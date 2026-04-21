import { before, describe, snapshot, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import reflector from "./reflector.js";
import Transformer from "../lib/transformer.js";

snapshot.setDefaultSnapshotSerializers([value => value]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const casesDir = path.resolve(__dirname, "cases");
const implsDir = path.resolve(__dirname, "implementations");
const outputDir = path.resolve(__dirname, "output");
const snapshotsDir = path.resolve(__dirname, "snapshots");

const idlFiles = fs.readdirSync(casesDir);

describe("generation", () => {
  describe("output mode option", () => {
    test("accepts aliases for commonjs and module modes", () => {
      assert.strictEqual(new Transformer({ outputMode: "commonjs" }).outputMode, "commonjs");
      assert.strictEqual(new Transformer({ outputMode: "cjs" }).outputMode, "commonjs");
      assert.strictEqual(new Transformer({ outputMode: "module" }).outputMode, "module");
      assert.strictEqual(new Transformer({ outputMode: "esm" }).outputMode, "module");
    });

    test("rejects invalid output mode", () => {
      assert.throws(() => {
        return Reflect.construct(Transformer, [{ outputMode: "invalid" }]);
      }, /outputMode must be "commonjs" or "module"/u);
    });
  });

  describe("built-in types", () => {
    before(() => {
      const transformer = new Transformer();
      return transformer.generate(outputDir);
    });

    test("Function", t => {
      const outputFile = path.resolve(outputDir, "Function.js");
      const output = fs.readFileSync(outputFile, { encoding: "utf-8" });

      t.assert.fileSnapshot(output, path.resolve(snapshotsDir, "built-in-types", "Function.js"));
    });

    test("VoidFunction", t => {
      const outputFile = path.resolve(outputDir, "VoidFunction.js");
      const output = fs.readFileSync(outputFile, { encoding: "utf-8" });

      t.assert.fileSnapshot(output, path.resolve(snapshotsDir, "built-in-types", "VoidFunction.js"));
    });
  });

  describe("without processors", () => {
    before(() => {
      const transformer = new Transformer();
      transformer.addSource(casesDir, implsDir);

      return transformer.generate(outputDir);
    });

    for (const idlFile of idlFiles) {
      test(idlFile, t => {
        const basename = path.basename(idlFile, ".webidl");
        const outputFile = path.resolve(outputDir, `${basename}.js`);
        const output = fs.readFileSync(outputFile, { encoding: "utf-8" });

        t.assert.fileSnapshot(output, path.resolve(snapshotsDir, "without-processors", `${basename}.js`));
      });
    }
  });

  describe("without processors in module output mode", () => {
    let outputModuleDir;

    before(() => {
      const transformer = new Transformer({ outputMode: "module" });
      transformer.addSource(casesDir, implsDir);
      outputModuleDir = fs.mkdtempSync(path.join(os.tmpdir(), "webidl2js-output-module-"));

      return transformer.generate(outputModuleDir);
    });

    test("EventTarget output uses ESM imports and exports", () => {
      const outputFile = path.resolve(outputModuleDir, "EventTarget.js");
      const output = fs.readFileSync(outputFile, { encoding: "utf-8" });

      assert.match(output, /import conversions from "webidl-conversions";/u);
      assert.match(output, /import \* as utils from "\.\/utils\.js";/u);
      assert.match(output, /import \* as Impl from ".*EventTarget\.js";/u);
      assert.match(output, /const exports = \{\};/u);
      assert.match(output, /export default exports;/u);
      assert.doesNotMatch(output, /require\(/u);
    });

    test("utils.js output uses ESM exports", () => {
      const outputFile = path.resolve(outputModuleDir, "utils.js");
      const output = fs.readFileSync(outputFile, { encoding: "utf-8" });

      assert.match(output, /export default exports;/u);
      assert.doesNotMatch(output, /module\.exports/u);
    });
  });

  describe("with processors", () => {
    before(() => {
      const transformer = new Transformer({
        processCEReactions(code) {
          const ceReactions = this.addImport("../CEReactions");

          return `
            ${ceReactions}.preSteps(globalObject);
            try {
              ${code}
            } finally {
              ${ceReactions}.postSteps(globalObject);
            }
          `;
        },
        processHTMLConstructor() {
          const htmlConstructor = this.addImport("../HTMLConstructor", "HTMLConstructor");

          return `
            return ${htmlConstructor}(globalObject, interfaceName);
          `;
        },
        processReflect(idl, implObj) {
          const reflectAttr = idl.extAttrs.find(attr => attr.name === "Reflect");
          const attrName =
            (reflectAttr && reflectAttr.rhs && reflectAttr.rhs.value.replace(/_/g, "-")) || idl.name.toLowerCase();
          if (idl.idlType.idlType === "USVString") {
            const reflectURL = idl.extAttrs.find(attr => attr.name === "ReflectURL");
            if (reflectURL) {
              const whatwgURL = this.addImport("whatwg-url");
              return {
                get: `
                  const value = ${implObj}.getAttributeNS(null, "${attrName}");
                  if (value === null) {
                    return "";
                  }
                  const urlRecord = ${whatwgURL}.parseURL(value, { baseURL: "http://localhost:8080/" });
                  return urlRecord === null ? conversions.USVString(value) : ${whatwgURL}.serializeURL(urlRecord);
                `,
                set: `
                  ${implObj}.setAttributeNS(null, "${attrName}", V);
                `
              };
            }
          }
          const reflect = reflector[idl.idlType.idlType];
          return {
            get: reflect.get(implObj, attrName),
            set: reflect.set(implObj, attrName)
          };
        }
      });
      transformer.addSource(casesDir, implsDir);

      return transformer.generate(outputDir);
    });

    for (const idlFile of idlFiles) {
      test(idlFile, t => {
        const basename = path.basename(idlFile, ".webidl");
        const outputFile = path.resolve(outputDir, `${basename}.js`);
        const output = fs.readFileSync(outputFile, { encoding: "utf-8" });

        t.assert.fileSnapshot(output, path.resolve(snapshotsDir, "with-processors", `${basename}.js`));
      });
    }
  });

  test("utils.js", () => {
    const input = fs.readFileSync(path.resolve(rootDir, "lib/output/utils.js"), { encoding: "utf-8" });
    const output = fs.readFileSync(path.resolve(outputDir, "utils.js"), { encoding: "utf-8" });
    assert.strictEqual(output, input);
  });
});
