/**
 * Base dependency contract for diagram modules.
 * @module diagrams/base/dependencies
 */

/**
 * @typedef {object} ModuleDependencySpec
 * @property {string} kind Diagram module or platform service kind.
 * @property {string} versionRange Supported semantic version range.
 * @property {readonly string[]} capabilities Requested capability names.
 * @property {boolean} optional Whether the module can degrade without it.
 */

/**
 * @param {ModuleDependencySpec} dependency Dependency spec.
 * @returns {ModuleDependencySpec}
 */
export function freezeDependency(dependency) {
  return Object.freeze({
    kind: dependency.kind,
    versionRange: dependency.versionRange,
    capabilities: Object.freeze([...(dependency.capabilities ?? [])]),
    optional: dependency.optional === true,
  });
}
