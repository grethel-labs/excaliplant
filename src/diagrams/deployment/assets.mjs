/**
 * Deployment diagram asset contract.
 * @module diagrams/deployment/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class DeploymentDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({
      fonts: ["Excalifont"],
      sprites: [],
      icons: [],
      fixtures: [],
      allowsRemoteAssets: false,
    });
  }
}

/** @public */
export const deploymentDiagramAssets = new DeploymentDiagramAssets();
