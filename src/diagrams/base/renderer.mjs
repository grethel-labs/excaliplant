/**
 * Base renderer contract for diagram modules.
 * @module diagrams/base/renderer
 */

/**
 * @typedef {object} BaseModuleRendererOptions
 * @property {Record<string, (model:object, options:object, context:object) => object>} [renderers] Renderer adapters by format.
 */

/**
 * Base contract for module-owned renderer implementations.
 * @public
 */
export class BaseModuleRenderer {
  /** @param {BaseModuleRendererOptions} [options] Renderer options. */
  constructor(options = {}) {
    this._renderers = Object.freeze({ ...(options.renderers ?? {}) });
    Object.freeze(this);
  }

  /** @returns {Record<string, Function>} Renderer adapters. */
  renderers() {
    return this._renderers;
  }
}
