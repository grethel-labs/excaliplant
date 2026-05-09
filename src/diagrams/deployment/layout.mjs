/**
 * Deployment diagram layout adapter.
 * @module diagrams/deployment/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { layoutGraphModel } from "../shared/graph_runtime.mjs";

/** @public */
export const layoutDeploymentDiagram = layoutGraphModel;

/** @public */
export class DeploymentDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "elkGraph", layout: layoutDeploymentDiagram });
  }
}

/** @public */
export const deploymentDiagramLayout = new DeploymentDiagramLayout();
