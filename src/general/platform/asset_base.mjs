/**
 * Asset manifest helpers for diagram modules.
 * @module platform/asset-base
 */

/** @public */
export const EMPTY_ASSET_MANIFEST = Object.freeze({
  fonts: Object.freeze([]),
  sprites: Object.freeze([]),
  icons: Object.freeze([]),
  fixtures: Object.freeze([]),
  allowsRemoteAssets: false,
});

/**
 * @typedef {object} ModuleAssetManifest
 * @property {readonly string[]} fonts Declared font families or packaged font assets.
 * @property {readonly string[]} sprites Declared sprite namespaces.
 * @property {readonly string[]} icons Declared icon sets.
 * @property {readonly string[]} fixtures Test and documentation fixtures owned by the module.
 * @property {boolean} allowsRemoteAssets Whether remote assets are requested.
 */

/**
 * Normalize a partial asset manifest into immutable arrays.
 * @param {Partial<ModuleAssetManifest>} [manifest]
 * @returns {ModuleAssetManifest}
 * @public
 */
export function normalizeAssetManifest(manifest = {}) {
  return Object.freeze({
    fonts: Object.freeze([...(manifest.fonts ?? [])]),
    sprites: Object.freeze([...(manifest.sprites ?? [])]),
    icons: Object.freeze([...(manifest.icons ?? [])]),
    fixtures: Object.freeze([...(manifest.fixtures ?? [])]),
    allowsRemoteAssets: manifest.allowsRemoteAssets === true,
  });
}

/**
 * Create the host asset-base facade.
 * @param {{securityBase: ReturnType<import("./security_base.mjs").createSecurityBase>}} options Options.
 * @returns {Readonly<{emptyManifest: ModuleAssetManifest, normalizeManifest(manifest?:Partial<ModuleAssetManifest>): ModuleAssetManifest, resolveAsset(manifest:ModuleAssetManifest, request:import("./security_base.mjs").ModuleAssetRequest, context:import("./security_base.mjs").SecurityContext): import("./security_base.mjs").ModuleAssetResult}>}
 * @public
 */
export function createAssetBase(options) {
  return Object.freeze({
    emptyManifest: EMPTY_ASSET_MANIFEST,
    normalizeManifest: normalizeAssetManifest,
    resolveAsset(manifest, request, context) {
      const normalized = normalizeAssetManifest(manifest);
      if (request.href && !normalized.allowsRemoteAssets) {
        return options.securityBase.resolveAsset(request, context);
      }
      return { allowed: true, name: request.name };
    },
  });
}
