const boolean = {
  get(implObj, attrName) {
    return `return ${implObj}.hasAttributeNS(null, "${attrName}");`;
  },
  set(implObj, attrName) {
    return `
      if (V) {
        ${implObj}.setAttributeNS(null, "${attrName}", "");
      } else {
        ${implObj}.removeAttributeNS(null, "${attrName}");
      }
    `;
  }
};

const DOMString = {
  get(implObj, attrName) {
    return `
      const value = ${implObj}.getAttributeNS(null, "${attrName}");
      return value === null ? "" : value;
    `;
  },
  set(implObj, attrName) {
    return `${implObj}.setAttributeNS(null, "${attrName}", V);`;
  }
};

const USVString = {
  get(implObj, attrName) {
    return `
      const value = ${implObj}.getAttributeNS(null, "${attrName}");
      return value === null ? "" : value;
    `;
  },
  set(implObj, attrName) {
    return `${implObj}.setAttributeNS(null, "${attrName}", V);`;
  }
};

const long = {
  get(implObj, attrName) {
    return `
      const value = parseInt(${implObj}.getAttributeNS(null, "${attrName}"));
      return isNaN(value) || value < -2147483648 || value > 2147483647 ? 0 : value
    `;
  },
  set(implObj, attrName) {
    return `${implObj}.setAttributeNS(null, "${attrName}", String(V));`;
  }
};

const unsignedLong = {
  get(implObj, attrName) {
    return `
      const value = parseInt(${implObj}.getAttributeNS(null, "${attrName}"));
      return isNaN(value) || value < 0 || value > 2147483647 ? 0 : value
    `;
  },
  set(implObj, attrName) {
    return `${implObj}.setAttributeNS(null, "${attrName}", String(V > 2147483647 ? 0 : V));`;
  }
};

export default {
  boolean,
  DOMString,
  USVString,
  long,
  "unsigned long": unsignedLong
};
