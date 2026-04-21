class InterfaceMixin {
  constructor(ctx, idl) {
    this.ctx = ctx;
    this.idl = idl;
    this.name = idl.name;
  }
}

InterfaceMixin.prototype.type = "interface mixin";

export default InterfaceMixin;
