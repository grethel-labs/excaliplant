/**
 * Timing diagram asset manifest.
 * @module diagrams/timing/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class TimingDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({ fixtures: [] });
  }
}

/** @public */
export const timingDiagramAssets = new TimingDiagramAssets();
