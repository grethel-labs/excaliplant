/**
 * Deployment diagram renderer adapters.
 * @module diagrams/deployment/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { GRAPH_RENDERERS } from "../shared/graph_runtime.mjs";

/** @public */
export const DEPLOYMENT_RENDERERS = GRAPH_RENDERERS;

/** @public */
export class DeploymentDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: DEPLOYMENT_RENDERERS });
  }
}

/** @public */
export const deploymentDiagramRenderer = new DeploymentDiagramRenderer();
