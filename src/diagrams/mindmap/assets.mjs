/** @module diagrams/mindmap/assets */
import { BaseModuleAssets } from "../base/assets.mjs";
/** @public */
export class MindmapDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}
/** @public */
export const mindmapDiagramAssets = new MindmapDiagramAssets();
