/**
 * Base asset contract for diagram modules.
 * @module diagrams/base/assets
 */

import { normalizeAssetManifest } from "../../general/platform/asset_base.mjs";

/**
 * Base contract for module-owned asset policy.
 * @public
 */
export class BaseModuleAssets {
  /** @param {Partial<import("../../general/platform/asset_base.mjs").ModuleAssetManifest>} [manifest] Asset manifest. */
  constructor(manifest = {}) {
    this._manifest = normalizeAssetManifest(manifest);
    Object.freeze(this);
  }

  /** @returns {import("../../general/platform/asset_base.mjs").ModuleAssetManifest} Asset manifest. */
  manifest() {
    return this._manifest;
  }
}
