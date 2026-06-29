/** @module diagrams/salt/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class SaltDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const saltDiagramAssets = new SaltDiagramAssets();
