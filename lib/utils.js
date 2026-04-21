import { extname } from "path";
import keywords from "./keywords.js";


function getDefault(dflt) {
  switch (dflt.type) {
    case "boolean":
    case "string":
      return JSON.stringify(dflt.value);
    case "number":
      return dflt.value;
    case "null":
    case "NaN":
      return dflt.type;
    case "Infinity":
      return `${dflt.negative ? "-" : ""}Infinity`;
    case "sequence":
      return "[]";
  }
  throw new Error(`Unexpected default type: ${dflt.type}`);
}

function getExtAttr(attrs, name) {
  for (let i = 0; i < attrs.length; ++i) {
    if (attrs[i].name === name) {
      return attrs[i];
    }
  }

  return null;
}

function isGlobal(idl) {
  return Boolean(getExtAttr(idl.extAttrs, "Global"));
}

function hasCEReactions(idl) {
  return Boolean(getExtAttr(idl.extAttrs, "CEReactions"));
}

function isOnInstance(memberIDL, interfaceIDL) {
  return memberIDL.special !== "static" && isGlobal(interfaceIDL);
}

function symbolName(symbol) {
  const desc = String(symbol).replace(/^Symbol\((.*)\)$/, "$1");
  if (!desc.startsWith("Symbol.")) {
    throw new Error(`Internal error: Unsupported property name ${String(symbol)}`);
  }
  return desc;
}

function propertyName(name) {
  // All Web IDL identifiers are valid JavaScript PropertyNames, other than those with '-'.
  const isJSIdentifier = !name.includes("-");
  if (isJSIdentifier) {
    return name;
  }
  return JSON.stringify(name);
}

function stringifyPropertyKey(prop) {
  return typeof prop === "symbol" ? `[${symbolName(prop)}]` : propertyName(prop);
}

function stringifyPropertyName(prop) {
  return typeof prop === "symbol" ? symbolName(prop) : JSON.stringify(propertyName(prop));
}

// type can be "accessor" or "regular"
function getPropertyDescriptorModifier(currentDesc, targetDesc, type, value = undefined) {
  const changes = [];
  if (value !== undefined) {
    changes.push(`value: ${value}`);
  }
  if (currentDesc.configurable !== targetDesc.configurable) {
    changes.push(`configurable: ${targetDesc.configurable}`);
  }
  if (currentDesc.enumerable !== targetDesc.enumerable) {
    changes.push(`enumerable: ${targetDesc.enumerable}`);
  }
  if (type !== "accessor" && currentDesc.writable !== targetDesc.writable) {
    changes.push(`writable: ${targetDesc.writable}`);
  }

  if (changes.length === 0) {
    return undefined;
  }
  return `{ ${changes.join(", ")} }`;
}

const defaultDefinePropertyDescriptor = {
  configurable: false,
  enumerable: false,
  writable: false
};

function formatArgs(args) {
  return args
    .filter(name => name !== null && name !== undefined && name !== "")
    .map(name => name + (keywords.has(name) ? "_" : ""))
    .join(", ");
}

function toKey(type, func = "") {
  return String(func + type).replace(/[./-]+/g, " ").trim().replaceAll(" ", "_");
}

const PACKAGE_NAME_REGEX = /^(?:@([^/]+?)[/])?([^/]+?)$/u;

class RequiresMap extends Map {
  constructor(ctx) {
    super();
    this.ctx = ctx;
  }

  add(name, func = "") {
    const key = toKey(name, func);

    // If `name` is a package name or has a file extension, then use it as-is,
    // otherwise append the `.js` file extension:
    const importPath = PACKAGE_NAME_REGEX.test(name) || extname(name) ? name : `${name}.js`;
    const isPackage = PACKAGE_NAME_REGEX.test(name);

    const entry = func
      ? { kind: "named-import", path: importPath, func }
      : isPackage
      ? { kind: "default-import", path: importPath }
      : { kind: "namespace-import", path: importPath };

    this._addEntry(key, entry);
    return key;
  }

  addRelative(type, func = "") {
    const key = toKey(type, func);

    const path = type.startsWith(".") ? type : `./${type}`;
    const importPath = `${path}.js`;

    const entry = func
      ? { kind: "named-import", path: importPath, func }
      : { kind: "namespace-import", path: importPath };

    this._addEntry(key, entry);
    return key;
  }

  addRaw(key, expr) {
    this._addEntry(key, { kind: "const", expr });
  }

  _addEntry(key, entry) {
    const canonical = JSON.stringify(entry);
    if (this.has(key)) {
      if (JSON.stringify(this.get(key)) !== canonical) {
        throw new Error(
          `Internal error: Variable name clash: ${key}; was ${JSON.stringify(this.get(key))}, adding: ${canonical}`
        );
      }
      return;
    }
    super.set(key, entry);
  }

  merge(src) {
    if (!src || !(src instanceof RequiresMap)) {
      return;
    }
    for (const [key, entry] of src) {
      this._addEntry(key, entry);
    }
  }

  generate() {
    const imports = [];
    const consts = [];

    for (const [key, entry] of this) {
      switch (entry.kind) {
        case "named-import":
          imports.push(`import { ${entry.func} as ${key} } from ${JSON.stringify(entry.path)};`);
          break;
        case "default-import":
          imports.push(`import ${key} from ${JSON.stringify(entry.path)};`);
          break;
        case "namespace-import":
          imports.push(`import * as ${key} from ${JSON.stringify(entry.path)};`);
          break;
        case "const":
          consts.push(`const ${key} = ${entry.expr};`);
          break;
      }
    }

    return [...imports, ...consts].join("\n");
  }
}

export {
  getDefault,
  getExtAttr,
  isGlobal,
  hasCEReactions,
  isOnInstance,
  stringifyPropertyKey,
  stringifyPropertyName,
  getPropertyDescriptorModifier,
  defaultDefinePropertyDescriptor,
  formatArgs,
  RequiresMap
};
