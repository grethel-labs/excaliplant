/**
 * Base layout contract for diagram modules.
 * @module diagrams/base/layout
 */

/**
 * @typedef {object} BaseModuleLayoutOptions
 * @property {string} [layoutStrategy] Declared layout strategy.
 * @property {(model:object, context:object) => object|Promise<object>|void|Promise<void>} [layout] Layout adapter.
 */

/**
 * Base contract for module-owned layout implementations.
 * @public
 */
export class BaseModuleLayout {
  /** @param {BaseModuleLayoutOptions} [options] Layout options. */
  constructor(options = {}) {
    this.layoutStrategy = options.layoutStrategy ?? "custom";
    this._layout = options.layout ?? null;
    Object.freeze(this);
  }

  /**
   * @param {object} model Diagram model.
   * @param {object} context Layout context.
   * @returns {object|Promise<object>|void|Promise<void>}
   */
  layout(model, context) {
    return this._layout ? this._layout(model, context) : model;
  }
}
