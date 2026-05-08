/**
 * Weak metadata map that connects parsed models to their owning module
 * without changing the public model classes.
 * @module modules/metadata
 */

/** @type {WeakMap<object, DiagramModuleMetadata>} */
const METADATA = new WeakMap();

/**
 * @typedef {object} DiagramModuleMetadata
 * @property {string} kind Diagram module kind.
 * @property {import("../diagrams/base/index.mjs").BaseDiagramModule} module Owning module.
 * @property {import("../general/platform/security_base.mjs").SecurityContext} securityContext Security context.
 * @property {import("../general/platform/diagnostics.mjs").Diagnostic[]} diagnostics Diagnostics collected while parsing/rendering.
 */

/**
 * Attach module metadata to a diagram model.
 * @param {object} diagram Diagram model.
 * @param {DiagramModuleMetadata} metadata Metadata.
 * @returns {object} The same diagram.
 * @public
 */
export function setDiagramModuleMetadata(diagram, metadata) {
  METADATA.set(diagram, metadata);
  return diagram;
}

/**
 * Read module metadata from a diagram model.
 * @param {object} diagram Diagram model.
 * @returns {DiagramModuleMetadata|null}
 * @public
 */
export function getDiagramModuleMetadata(diagram) {
  return METADATA.get(diagram) ?? null;
}

/**
 * @param {object} diagram Diagram model.
 * @returns {string|null} Module kind, if known.
 * @public
 */
export function getDiagramModuleKind(diagram) {
  return getDiagramModuleMetadata(diagram)?.kind ?? null;
}
