/**
 * Base artifact ownership helpers for diagram modules.
 * @module diagrams/base/artifacts
 */

/**
 * @typedef {object} ModuleOwnedArtifacts
 * @property {readonly string[]} parser Parser files owned by this module.
 * @property {readonly string[]} model Model or model-adapter files owned by this module.
 * @property {readonly string[]} style Style defaults or style adapters owned by this module.
 * @property {readonly string[]} layout Layout adapter files owned by this module.
 * @property {readonly string[]} render Renderer adapter files owned by this module.
 * @property {readonly string[]} security Security contract files owned by this module.
 * @property {readonly string[]} assets Asset contract files owned by this module.
 * @property {readonly string[]} docs Documentation sources owned by this module.
 * @property {readonly string[]} tests Test files owned by this module.
 */

/**
 * @param {ModuleOwnedArtifacts|undefined} artifacts Owned artifacts.
 * @returns {ModuleOwnedArtifacts}
 */
export function freezeOwnedArtifacts(artifacts) {
  return Object.freeze({
    parser: Object.freeze([...(artifacts?.parser ?? [])]),
    model: Object.freeze([...(artifacts?.model ?? [])]),
    style: Object.freeze([...(artifacts?.style ?? [])]),
    layout: Object.freeze([...(artifacts?.layout ?? [])]),
    render: Object.freeze([...(artifacts?.render ?? [])]),
    security: Object.freeze([...(artifacts?.security ?? [])]),
    assets: Object.freeze([...(artifacts?.assets ?? [])]),
    docs: Object.freeze([...(artifacts?.docs ?? [])]),
    tests: Object.freeze([...(artifacts?.tests ?? [])]),
  });
}
