/** @module diagrams/chart/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class ChartDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const chartDiagramAssets = new ChartDiagramAssets();
