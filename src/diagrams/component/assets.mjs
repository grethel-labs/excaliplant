/**
 * Component diagram asset contract.
 * @module diagrams/component/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class ComponentDiagramAssets extends BaseModuleAssets {
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
export const componentDiagramAssets = new ComponentDiagramAssets();
