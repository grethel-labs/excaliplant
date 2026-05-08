/**
 * Class diagram asset contract.
 * @module diagrams/class/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class ClassDiagramAssets extends BaseModuleAssets {
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
export const classDiagramAssets = new ClassDiagramAssets();
