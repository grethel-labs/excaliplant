/** @module diagrams/archimate/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class ArchimateDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const archimateDiagramAssets = new ArchimateDiagramAssets();
