/** @module diagrams/files/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class FilesDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const filesDiagramAssets = new FilesDiagramAssets();
