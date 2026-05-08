/**
 * Component diagram renderer adapters.
 * @module diagrams/component/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";

/** @public */
export const COMPONENT_RENDERERS = GRAPH_RENDERERS;

/** @public */
export class ComponentDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: COMPONENT_RENDERERS });
  }
}

/** @public */
export const componentDiagramRenderer = new ComponentDiagramRenderer();
