/** @module diagrams/chronology/assets */
import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class ChronologyDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const chronologyDiagramAssets = new ChronologyDiagramAssets();
