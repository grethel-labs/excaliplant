/**
 * State diagram renderer contract.
 * @module diagrams/state/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";

/** @public */
export const STATE_RENDERERS = GRAPH_RENDERERS;

/** @public */
export class StateDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({
      renderers: STATE_RENDERERS,
    });
  }
}

/** @public */
export const stateDiagramRenderer = new StateDiagramRenderer();
