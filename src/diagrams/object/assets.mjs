/**
 * Object diagram asset contract.
 * @module diagrams/object/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class ObjectDiagramAssets extends BaseModuleAssets {
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
export const objectDiagramAssets = new ObjectDiagramAssets();
