/**
 * Central security and failure-safety platform for diagram modules.
 *
 * The helpers here are deliberately framework-neutral. Parser, layout
 * and renderer code can share the same deny-by-default policy without
 * importing each other.
 * @module platform/security-base
 */

import { DiagnosticError, createDiagnostic, isFatalDiagnostic } from "./diagnostics.mjs";

/** @public */
export const DEFAULT_ALLOWED_LINK_PROTOCOLS = Object.freeze(["http:", "https:", "mailto:"]);

/** @public */
export const DEFAULT_FAILURE_POLICY = Object.freeze({
  unsupportedFeature: "fallback",
  securityDenial: "fatal",
  invariantViolation: "fatal",
  suppressInternalStacks: true,
});

/** @public */
export const DEFAULT_MODULE_SECURITY_PROFILE = Object.freeze({
  maxNodes: 10_000,
  maxEdges: 10_000,
  maxNestingDepth: 1_000,
  maxTextLength: 100_000,
  maxCostUnits: 500_000,
  maxParseMillis: 0,
  maxLayoutMillis: 0,
  maxRenderMillis: 0,
  allowsExternalResources: false,
  allowedLinkProtocols: DEFAULT_ALLOWED_LINK_PROTOCOLS,
  supportedInlineAssets: [],
  securityTestCases: [],
  capabilities: [],
  failurePolicy: DEFAULT_FAILURE_POLICY,
});

/**
 * @typedef {object} ModuleFailurePolicy
 * @property {"fallback"|"fatal"} unsupportedFeature Unsupported syntax handling.
 * @property {"fatal"} securityDenial Security denials must fail closed.
 * @property {"fatal"} invariantViolation Broken invariants must fail closed.
 * @property {boolean} suppressInternalStacks Whether generated artifacts may contain internal stacks.
 */

/**
 * @typedef {object} ModuleSecurityProfile
 * @property {number} maxNodes
 * @property {number} maxEdges
 * @property {number} maxNestingDepth
 * @property {number} maxTextLength
 * @property {number} maxCostUnits
 * @property {number} maxParseMillis
 * @property {number} maxLayoutMillis
 * @property {number} maxRenderMillis
 * @property {boolean} allowsExternalResources
 * @property {readonly string[]} allowedLinkProtocols
 * @property {readonly string[]} supportedInlineAssets
 * @property {readonly string[]} securityTestCases
 * @property {readonly string[]} capabilities
 * @property {ModuleFailurePolicy} failurePolicy
 */

/**
 * @typedef {object} SecurityContext
 * @property {ModuleSecurityProfile} profile Security profile in force.
 * @property {Record<string, unknown>} input Non-sensitive input metadata.
 * @property {import("./diagnostics.mjs").Diagnostic[]} diagnostics Diagnostics collected so far.
 * @property {Set<string>} capabilities Granted capability tokens.
 * @property {number} costUsed Current cost budget consumption.
 * @property {boolean} fatal Whether a fatal diagnostic was reported.
 */

/**
 * @typedef {object} SanitizedUrl
 * @property {string} href Sanitized href, empty when denied.
 * @property {boolean} safe Whether the URL passed policy.
 * @property {string} [reason] Denial reason.
 */

/**
 * @typedef {object} ModuleAssetRequest
 * @property {string} kind font | sprite | icon | fixture | image.
 * @property {string} name Asset name.
 * @property {string} [href] Optional external href.
 */

/**
 * @typedef {object} ModuleAssetResult
 * @property {boolean} allowed Whether the asset request is allowed.
 * @property {string} [name] Resolved asset name.
 * @property {string} [reason] Denial reason.
 */

/**
 * Security-specific fatal error.
 * @public
 */
export class SecurityError extends DiagnosticError {
  /**
   * @param {import("./diagnostics.mjs").Diagnostic} diagnostic Fatal diagnostic.
   * @param {{cause?:unknown}} [options]
   */
  constructor(diagnostic, options = {}) {
    super(diagnostic, options);
    this.name = "SecurityError";
  }
}

/**
 * Build a complete security profile from partial overrides.
 * @param {Partial<ModuleSecurityProfile>} [overrides]
 * @returns {ModuleSecurityProfile}
 * @public
 */
export function createModuleSecurityProfile(overrides = {}) {
  return Object.freeze({
    ...DEFAULT_MODULE_SECURITY_PROFILE,
    ...overrides,
    allowedLinkProtocols: Object.freeze([
      ...(overrides.allowedLinkProtocols ?? DEFAULT_ALLOWED_LINK_PROTOCOLS),
    ]),
    supportedInlineAssets: Object.freeze([...(overrides.supportedInlineAssets ?? [])]),
    securityTestCases: Object.freeze([...(overrides.securityTestCases ?? [])]),
    capabilities: Object.freeze([...(overrides.capabilities ?? [])]),
    failurePolicy: Object.freeze({
      ...DEFAULT_FAILURE_POLICY,
      ...(overrides.failurePolicy ?? {}),
    }),
  });
}

/**
 * Escape a string for safe SVG/XML attribute interpolation.
 * @param {string} value Raw string.
 * @returns {string} Escaped string.
 * @public
 */
export function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escape a string for safe SVG/XML text interpolation.
 * @param {string} value Raw string.
 * @returns {string} Escaped string.
 * @public
 */
export function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Create the shared security-base facade.
 * @returns {Readonly<{
 *   defaultProfileFor(kind:string): ModuleSecurityProfile,
 *   createContext(profile:ModuleSecurityProfile,input?:Record<string,unknown>): SecurityContext,
 *   escapeText(value:string,context?:SecurityContext): string,
 *   escapeAttribute(value:string,context?:SecurityContext): string,
 *   sanitizeUrl(url:string,context:SecurityContext): SanitizedUrl,
 *   sanitizeStyle(style:Record<string,unknown>,context:SecurityContext): Record<string,unknown>,
 *   resolveAsset(asset:ModuleAssetRequest,context:SecurityContext): ModuleAssetResult,
 *   accountCost(amount:number,context:SecurityContext): void,
 *   assertCapability(capability:string,context:SecurityContext): void,
 *   createFailureBoundary(phase:string,context:SecurityContext): FailureBoundary,
 *   assertSafeArtifact(artifact:object,context:SecurityContext): void,
 *   reportDiagnostic(diagnostic:Partial<import("./diagnostics.mjs").Diagnostic>,context:SecurityContext): import("./diagnostics.mjs").Diagnostic,
 * }>}
 * @public
 */
export function createSecurityBase() {
  const facade = {
    defaultProfileFor(/** @type {string} */ kind) {
      return createModuleSecurityProfile({ securityTestCases: [`${kind}.default-security`] });
    },

    createContext(
      /** @type {ModuleSecurityProfile} */ profile,
      /** @type {Record<string, unknown>} */ input = {},
    ) {
      return {
        profile: createModuleSecurityProfile(profile),
        input,
        diagnostics: [],
        capabilities: new Set(profile.capabilities ?? []),
        costUsed: 0,
        fatal: false,
      };
    },

    escapeText(/** @type {string} */ value) {
      return escapeText(value);
    },

    escapeAttribute(/** @type {string} */ value) {
      return escapeAttribute(value);
    },

    sanitizeUrl(/** @type {string} */ url, /** @type {SecurityContext} */ context) {
      const raw = String(url || "").trim();
      if (!raw) return { href: "", safe: true };
      let parsed;
      try {
        parsed = new URL(raw, "https://plantuml.invalid/");
      } catch {
        return denyUrl(raw, "url.invalid", context);
      }
      const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(raw);
      const protocol = isRelative ? "relative" : parsed.protocol.toLowerCase();
      if (isRelative || context.profile.allowedLinkProtocols.includes(protocol)) {
        return { href: raw, safe: true };
      }
      return denyUrl(raw, `url.protocol.${protocol.replace(/:$/, "")}`, context);
    },

    sanitizeStyle(
      /** @type {Record<string, unknown>} */ style,
      /** @type {SecurityContext} */ context,
    ) {
      if (!style || typeof style !== "object") return {};
      /** @type {Record<string, unknown>} */
      const safe = {};
      for (const [key, value] of Object.entries(style)) {
        if (typeof value === "string" && /url\s*\(|expression\s*\(/i.test(value)) {
          facade.reportDiagnostic(
            {
              severity: "fatal",
              code: "style.unsafe",
              message: `unsafe style value denied for ${key}`,
              phase: "security",
            },
            context,
          );
          throw new SecurityError(context.diagnostics[context.diagnostics.length - 1]);
        }
        safe[key] = value;
      }
      return safe;
    },

    resolveAsset(/** @type {ModuleAssetRequest} */ asset, /** @type {SecurityContext} */ context) {
      if (
        asset.href &&
        /^https?:\/\//i.test(asset.href) &&
        !context.profile.allowsExternalResources
      ) {
        facade.reportDiagnostic(
          {
            severity: "fatal",
            code: "asset.remote-denied",
            message: "remote assets are disabled by the module security profile",
            phase: "security",
          },
          context,
        );
        return { allowed: false, reason: "remote assets are disabled" };
      }
      return { allowed: true, name: asset.name };
    },

    accountCost(/** @type {number} */ amount, /** @type {SecurityContext} */ context) {
      if (!Number.isFinite(amount) || amount < 0) {
        throwFatal(context, "cost.invalid", "cost amount must be a non-negative finite number");
      }
      context.costUsed += amount;
      if (context.costUsed > context.profile.maxCostUnits) {
        throwFatal(context, "cost.exceeded", "operation exceeded its security cost budget");
      }
    },

    assertCapability(/** @type {string} */ capability, /** @type {SecurityContext} */ context) {
      if (!context.capabilities.has(capability)) {
        throwFatal(context, "capability.denied", `capability denied: ${capability}`);
      }
    },

    createFailureBoundary(/** @type {string} */ phase, /** @type {SecurityContext} */ context) {
      return new FailureBoundary(phase, context, facade);
    },

    assertSafeArtifact(/** @type {object} */ artifact, /** @type {SecurityContext} */ context) {
      validateArtifact(artifact, context, facade);
    },

    reportDiagnostic(
      /** @type {Partial<import("./diagnostics.mjs").Diagnostic>} */ diagnostic,
      /** @type {SecurityContext} */ context,
    ) {
      const normalized = createDiagnostic(diagnostic);
      context.diagnostics.push(normalized);
      if (isFatalDiagnostic(normalized)) context.fatal = true;
      return normalized;
    },
  };
  return Object.freeze(facade);
}

/**
 * Failure boundary around a module phase.
 * @public
 */
export class FailureBoundary {
  /**
   * @param {string} phase Phase name.
   * @param {SecurityContext} context Security context.
   * @param {ReturnType<typeof createSecurityBase>} securityBase Security facade.
   */
  constructor(phase, context, securityBase) {
    this.phase = phase;
    this.context = context;
    this.securityBase = securityBase;
  }

  /**
   * Run synchronous work inside the boundary.
   * @template T
   * @param {() => T} action Work callback.
   * @returns {T}
   */
  run(action) {
    try {
      return action();
    } catch (error) {
      throw this.wrap(error);
    }
  }

  /**
   * Run asynchronous work inside the boundary.
   * @template T
   * @param {() => Promise<T>} action Async work callback.
   * @returns {Promise<T>}
   */
  async runAsync(action) {
    try {
      return await action();
    } catch (error) {
      throw this.wrap(error);
    }
  }

  /**
   * @param {unknown} error Error to convert.
   * @returns {SecurityError}
   */
  wrap(error) {
    if (error instanceof SecurityError) return error;
    const diagnostic = this.securityBase.reportDiagnostic(
      {
        severity: "fatal",
        code: `failure.${this.phase}`,
        message: `unexpected ${this.phase} failure in diagram module`,
        phase: this.phase,
        module: String(this.context.input.module ?? "unknown"),
        data: { errorName: error instanceof Error ? error.name : typeof error },
      },
      this.context,
    );
    return new SecurityError(diagnostic, { cause: error });
  }
}

/**
 * @param {string} raw Raw URL.
 * @param {string} reason Denial code suffix.
 * @param {SecurityContext} context Security context.
 * @returns {SanitizedUrl}
 */
function denyUrl(raw, reason, context) {
  context.diagnostics.push(
    createDiagnostic({
      severity: "fatal",
      code: reason,
      message: "URL denied by security policy",
      phase: "security",
      data: { length: raw.length },
    }),
  );
  context.fatal = true;
  return { href: "", safe: false, reason };
}

/**
 * @param {SecurityContext} context Security context.
 * @param {string} code Diagnostic code.
 * @param {string} message Diagnostic message.
 * @throws {SecurityError}
 */
function throwFatal(context, code, message) {
  const diagnostic = createDiagnostic({ severity: "fatal", code, message, phase: "security" });
  context.diagnostics.push(diagnostic);
  context.fatal = true;
  throw new SecurityError(diagnostic);
}

/**
 * @param {object} artifact Artifact to validate.
 * @param {SecurityContext} context Security context.
 * @param {ReturnType<typeof createSecurityBase>} securityBase Security facade.
 */
function validateArtifact(artifact, context, securityBase) {
  /** @type {WeakSet<object>} */
  const seen = new WeakSet();
  const visit = (/** @type {unknown} */ value, /** @type {string} */ path) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throwFatal(context, "artifact.non-finite-number", `unsafe non-finite number at ${path}`);
    }
    if (typeof value === "string") {
      if (/\b(?:at\s+.*:\d+:\d+|file:\/\/|\/Users\/|C:\\)/.test(value)) {
        throwFatal(
          context,
          "artifact.internal-detail",
          "artifact contains internal path or stack detail",
        );
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) visit(value[index], `${path}[${index}]`);
      return;
    }
    const record = /** @type {Record<string, unknown>} */ (value);
    if (typeof record.link === "string") {
      const result = securityBase.sanitizeUrl(record.link, context);
      if (!result.safe)
        throwFatal(context, "artifact.unsafe-link", "artifact contains unsafe link");
    }
    for (const [key, child] of Object.entries(record)) visit(child, `${path}.${key}`);
  };
  visit(artifact, "artifact");
}
