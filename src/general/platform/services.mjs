/**
 * Host-provided platform services for diagram modules.
 *
 * These are not diagram modules. They describe shared capabilities such as
 * security, style, text, arrows and reusable model/layout services that diagram
 * modules can request through dependency specs.
 * @module platform/services
 */

const SERVICE_KIND_RE = /^[a-z][a-z0-9-]*$/;

/** @public */
export const DEFAULT_PLATFORM_SERVICE_MANIFESTS = Object.freeze([
  Object.freeze({
    kind: "security-base",
    version: "1.0.0",
    capabilities: Object.freeze([
      "sanitize",
      "limits",
      "diagnostics",
      "failure-boundary",
      "artifact-validation",
    ]),
  }),
  Object.freeze({
    kind: "style-base",
    version: "1.0.0",
    capabilities: Object.freeze(["style-cascade", "style-validation"]),
  }),
  Object.freeze({
    kind: "text-base",
    version: "1.0.0",
    capabilities: Object.freeze(["inline-text", "text-measurement", "text-wrapping"]),
  }),
  Object.freeze({
    kind: "arrow-base",
    version: "1.0.0",
    capabilities: Object.freeze(["diagram-arrow", "arrowheads", "edge-labels"]),
  }),
  Object.freeze({
    kind: "asset-base",
    version: "1.0.0",
    capabilities: Object.freeze(["packaged-assets", "asset-policy"]),
  }),
  Object.freeze({
    kind: "graph-structure",
    version: "1.0.0",
    capabilities: Object.freeze(["boxes", "containers", "connections"]),
  }),
  Object.freeze({
    kind: "data-tree",
    version: "1.0.0",
    capabilities: Object.freeze(["structured-values", "folding", "value-rendering"]),
  }),
  Object.freeze({
    kind: "tree-layout",
    version: "1.0.0",
    capabilities: Object.freeze(["hierarchy", "branch-layout"]),
  }),
]);

/**
 * @typedef {object} PlatformServiceManifest
 * @property {string} kind Stable service kind.
 * @property {string} version Semantic service contract version.
 * @property {readonly string[]} capabilities Capability tokens provided by the service.
 */

/**
 * Registry for host services that diagram modules may depend on.
 * @public
 */
export class PlatformServiceRegistry {
  /** @param {{services?: readonly PlatformServiceManifest[], frozen?: boolean}} [options] */
  constructor(options = {}) {
    /** @type {Map<string, PlatformServiceManifest>} */
    this._services = new Map();
    this._frozen = false;
    for (const service of options.services ?? []) this.register(service);
    if (options.frozen) this.freeze();
  }

  /**
   * @param {PlatformServiceManifest} service Service manifest.
   * @returns {this}
   */
  register(service) {
    if (this._frozen) throw new Error("PlatformServiceRegistry is frozen");
    validatePlatformService(service);
    if (this._services.has(service.kind)) {
      throw new Error(`Duplicate platform service kind: ${service.kind}`);
    }
    this._services.set(service.kind, freezeService(service));
    return this;
  }

  /** @returns {this} */
  freeze() {
    this._frozen = true;
    return this;
  }

  /** @returns {boolean} */
  get frozen() {
    return this._frozen;
  }

  /** @param {string} kind Service kind. @returns {PlatformServiceManifest|null} */
  get(kind) {
    return this._services.get(kind) ?? null;
  }

  /** @returns {PlatformServiceManifest[]} */
  list() {
    return [...this._services.values()];
  }

  /** @returns {PlatformServiceManifest[]} */
  manifests() {
    return this.list();
  }
}

/** @public */
export const defaultPlatformServiceRegistry = new PlatformServiceRegistry({
  services: DEFAULT_PLATFORM_SERVICE_MANIFESTS,
  frozen: true,
});

/**
 * @param {unknown} service Service candidate.
 * @returns {asserts service is PlatformServiceManifest}
 * @public
 */
export function validatePlatformService(service) {
  if (!service || typeof service !== "object") {
    throw new TypeError("platform service must be an object");
  }
  const candidate = /** @type {Partial<PlatformServiceManifest>} */ (service);
  if (!candidate.kind || !SERVICE_KIND_RE.test(candidate.kind)) {
    throw new TypeError(`invalid platform service kind: ${String(candidate.kind)}`);
  }
  if (!candidate.version || !/^\d+\.\d+\.\d+$/.test(candidate.version)) {
    throw new TypeError(`invalid platform service version: ${String(candidate.version)}`);
  }
  if (!Array.isArray(candidate.capabilities)) {
    throw new TypeError(`platform service ${candidate.kind} must declare capabilities`);
  }
}

/**
 * Minimal semantic-version range check for the closed-world dependency graph.
 * Supports exact versions, `*`, and caret ranges such as `^1.0.0`.
 * @param {string} version Concrete version.
 * @param {string} range Requested range.
 * @returns {boolean}
 * @public
 */
export function satisfiesVersion(version, range) {
  if (!range || range === "*") return true;
  if (range.startsWith("^")) {
    const requested = parseVersion(range.slice(1));
    const actual = parseVersion(version);
    return actual.major === requested.major && compareVersions(actual, requested) >= 0;
  }
  return version === range;
}

/** @param {PlatformServiceManifest} service Service manifest. @returns {PlatformServiceManifest} */
function freezeService(service) {
  return Object.freeze({
    kind: service.kind,
    version: service.version,
    capabilities: Object.freeze([...service.capabilities]),
  });
}

/** @param {string} version Version string. @returns {{major:number,minor:number,patch:number}} */
function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return { major: -1, minor: -1, patch: -1 };
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * @param {{major:number,minor:number,patch:number}} a First version.
 * @param {{major:number,minor:number,patch:number}} b Second version.
 * @returns {number}
 */
function compareVersions(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
