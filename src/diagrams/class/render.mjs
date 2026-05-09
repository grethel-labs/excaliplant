/**
 * Class diagram renderer adapters.
 * @module diagrams/class/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";

/** @public */
export const CLASS_RENDERERS = GRAPH_RENDERERS;

/** @public */
export class ClassDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: CLASS_RENDERERS });
  }
}

/** @public */
export const classDiagramRenderer = new ClassDiagramRenderer();
