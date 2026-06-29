/** @module diagrams/ie/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class IeDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const ieDiagramAssets = new IeDiagramAssets();
