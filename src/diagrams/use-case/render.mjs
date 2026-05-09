/**
 * Use-case diagram renderer contract.
 * @module diagrams/use-case/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";

/** @public */
export class UseCaseDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({
      renderers: {},
    });
  }
}

/** @public */
export const useCaseDiagramRenderer = new UseCaseDiagramRenderer();
