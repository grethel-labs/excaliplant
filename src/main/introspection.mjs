/**
 * Manifest-driven self-introspection for diagram modules.
 * @module modules/introspection
 */

import { defaultDiagramModuleRegistry } from "./builtin.mjs";
import { defaultPlatformServiceRegistry } from "../general/platform/services.mjs";

/**
 * Build a stable, serialisable description of the diagram platform.
 * @param {import("./registry.mjs").DiagramModuleRegistry} [registry]
 * @param {import("../general/platform/services.mjs").PlatformServiceRegistry} [serviceRegistry]
 * @returns {{modules: object[], diagramModules: object[], platformServices: object[], dependencies: object[], capabilities: string[]}}
 * @public
 */
export function describeDiagramPlatform(
  registry = defaultDiagramModuleRegistry,
  serviceRegistry = defaultPlatformServiceRegistry,
) {
  const modules = registry.manifests();
  const platformServices = serviceRegistry.manifests();
  const dependencies = [];
  const capabilities = new Set();
  for (const service of platformServices) {
    for (const capability of service.capabilities ?? []) capabilities.add(capability);
  }
  for (const module of modules) {
    const manifest =
      /** @type {{kind:string,dependencies?:{kind:string,capabilities:readonly string[]}[],security?:{capabilities?:readonly string[]}}} */ (
        module
      );
    const deps = manifest.dependencies ?? [];
    for (const dependency of deps) {
      dependencies.push({
        from: manifest.kind,
        to: dependency.kind,
        targetType: serviceRegistry.get(dependency.kind) ? "platform-service" : "diagram-module",
        capabilities: dependency.capabilities,
      });
      for (const capability of dependency.capabilities ?? []) capabilities.add(capability);
    }
    const security = manifest.security ?? {};
    for (const capability of security.capabilities ?? []) capabilities.add(capability);
  }
  return {
    modules,
    diagramModules: modules,
    platformServices,
    dependencies,
    capabilities: [...capabilities].sort((a, b) => a.localeCompare(b)),
  };
}
