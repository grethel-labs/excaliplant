/**
 * Base documentation contract for diagram modules.
 * @module diagrams/base/docs
 */

/**
 * @typedef {object} ModuleDocsManifest
 * @property {readonly string[]} examples Coverage example IDs.
 * @property {readonly string[]} generatedPages Generated documentation pages.
 * @property {readonly string[]} knownGaps Known unsupported or degraded features.
 */

/**
 * Base contract for module-owned documentation metadata.
 * @public
 */
export class BaseModuleDocs {
  /** @param {ModuleDocsManifest} [manifest] Documentation manifest. */
  constructor(manifest = /** @type {ModuleDocsManifest} */ ({})) {
    this._manifest = freezeDocs(manifest);
    Object.freeze(this);
  }

  /** @returns {ModuleDocsManifest} Documentation manifest. */
  manifest() {
    return this._manifest;
  }
}

/** @param {ModuleDocsManifest|undefined} docs Docs manifest. @returns {ModuleDocsManifest} */
export function freezeDocs(docs) {
  return Object.freeze({
    examples: Object.freeze([...(docs?.examples ?? [])]),
    generatedPages: Object.freeze([...(docs?.generatedPages ?? [])]),
    knownGaps: Object.freeze([...(docs?.knownGaps ?? [])]),
  });
}
