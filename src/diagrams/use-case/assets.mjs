/**
 * Use-case diagram asset manifest.
 * @module diagrams/use-case/assets
 */

import { BaseModuleAssets } from "../base/assets.mjs";

/** @public */
export class UseCaseDiagramAssets extends BaseModuleAssets {
  constructor() {
    super({});
  }
}

/** @public */
export const useCaseDiagramAssets = new UseCaseDiagramAssets();
