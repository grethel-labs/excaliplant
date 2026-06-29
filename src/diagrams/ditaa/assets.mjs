/** @module diagrams/ditaa/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class DitaaDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const ditaaDiagramAssets = new DitaaDiagramAssets();
