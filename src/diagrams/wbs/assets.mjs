/** @module diagrams/wbs/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class WbsDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const wbsDiagramAssets = new WbsDiagramAssets();
