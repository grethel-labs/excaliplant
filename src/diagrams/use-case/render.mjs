/**
 * Use-case diagram renderer contract.
 * @module diagrams/use-case/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";

/** @public */
export class UseCaseDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({
      renderStrategy: "excalidraw",
    });
  }
}

/** @public */
export const useCaseDiagramRenderer = new UseCaseDiagramRenderer();
