/**
 * Sequence diagram asset contract.
 * @module diagrams/sequence/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class SequenceDiagramAssets extends BaseModuleAssets {
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
export const sequenceDiagramAssets = new SequenceDiagramAssets();
