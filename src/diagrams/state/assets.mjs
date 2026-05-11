/**
 * State diagram asset manifest.
 * @module diagrams/state/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class StateDiagramAssets extends BaseModuleAssets {
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
export const stateDiagramAssets = new StateDiagramAssets();
