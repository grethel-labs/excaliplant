/**
 * Dependency validation for closed-world diagram modules.
 * @module modules/dependencies
 */

import { defaultPlatformServiceRegistry, satisfiesVersion } from "../general/platform/services.mjs";

/**
 * @typedef {object} ResolvedModuleDependency
 * @property {string} kind Requested dependency kind.
 * @property {"platform-service"|"diagram-module"} type Resolved dependency source.
 * @property {string} version Resolved contract version.
 * @property {readonly string[]} capabilities Resolved capabilities.
 * @property {boolean} optional Whether the dependency was optional.
 */

/**
 * Validate every registered diagram module against host services and other
 * diagram modules known to the registry.
 * @param {readonly import("../diagrams/base/index.mjs").BaseDiagramModule[]} modules Diagram modules.
 * @param {import("../general/platform/services.mjs").PlatformServiceRegistry} [serviceRegistry]
 * @returns {Map<string, readonly ResolvedModuleDependency[]>}
 * @public
 */
export function validateRegistryDependencies(
  modules,
  serviceRegistry = defaultPlatformServiceRegistry,
) {
  const resolved = new Map();
  for (const module of modules) {
    resolved.set(module.kind, resolveModuleDependencies(module, modules, serviceRegistry));
  }
  return resolved;
}

/**
 * Resolve and validate one module's declared dependencies.
 * @param {import("../diagrams/base/index.mjs").BaseDiagramModule} module Diagram module.
 * @param {readonly import("../diagrams/base/index.mjs").BaseDiagramModule[]} modules All registered modules.
 * @param {import("../general/platform/services.mjs").PlatformServiceRegistry} [serviceRegistry]
 * @returns {readonly ResolvedModuleDependency[]}
 * @public
 */
export function resolveModuleDependencies(
  module,
  modules,
  serviceRegistry = defaultPlatformServiceRegistry,
) {
  const moduleByKind = new Map(modules.map((candidate) => [candidate.kind, candidate]));
  return Object.freeze(
    module.dependencySpecs().flatMap((dependency) => {
      const service = serviceRegistry.get(dependency.kind);
      const diagramModule = moduleByKind.get(dependency.kind) ?? null;
      if (!service && !diagramModule) {
        if (dependency.optional) return [];
        throw new Error(
          `diagram module ${module.kind} has unresolved dependency: ${dependency.kind}`,
        );
      }

      const target = service ?? diagramModule;
      const type = service ? "platform-service" : "diagram-module";
      const version = service ? service.version : (diagramModule?.version ?? "1.0.0");
      const capabilities = service
        ? service.capabilities
        : (diagramModule?.securityProfile().capabilities ?? []);

      if (!satisfiesVersion(version, dependency.versionRange)) {
        if (dependency.optional) return [];
        throw new Error(
          `diagram module ${module.kind} dependency ${dependency.kind} requires ${dependency.versionRange}, got ${version}`,
        );
      }

      const missing = dependency.capabilities.filter(
        (capability) => !capabilities.includes(capability),
      );
      if (missing.length) {
        if (dependency.optional) return [];
        throw new Error(
          `diagram module ${module.kind} dependency ${dependency.kind} misses capabilities: ${missing.join(", ")}`,
        );
      }

      return [
        Object.freeze({
          kind: dependency.kind,
          type,
          version,
          capabilities: Object.freeze([...dependency.capabilities]),
          optional: dependency.optional,
        }),
      ];
    }),
  );
}
