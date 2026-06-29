/** @module diagrams/nwdiag/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class NwdiagDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const nwdiagDiagramAssets = new NwdiagDiagramAssets();
