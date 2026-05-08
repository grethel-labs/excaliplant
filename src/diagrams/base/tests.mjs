/**
 * Base test contract for diagram modules.
 * @module diagrams/base/tests
 */

/**
 * @typedef {object} ModuleTestManifest
 * @property {readonly string[]} unit Unit test groups.
 * @property {readonly string[]} integration Integration test groups.
 * @property {readonly string[]} security Security test groups.
 */

/**
 * Base contract for module-owned test metadata.
 * @public
 */
export class BaseModuleTests {
  /** @param {ModuleTestManifest} [manifest] Test manifest. */
  constructor(manifest = /** @type {ModuleTestManifest} */ ({})) {
    this._manifest = freezeTests(manifest);
    Object.freeze(this);
  }

  /** @returns {ModuleTestManifest} Test manifest. */
  manifest() {
    return this._manifest;
  }
}

/** @param {ModuleTestManifest|undefined} tests Test manifest. @returns {ModuleTestManifest} */
export function freezeTests(tests) {
  return Object.freeze({
    unit: Object.freeze([...(tests?.unit ?? [])]),
    integration: Object.freeze([...(tests?.integration ?? [])]),
    security: Object.freeze([...(tests?.security ?? [])]),
  });
}
