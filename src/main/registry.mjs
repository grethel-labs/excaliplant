/**
 * Closed-world diagram module registry.
 * @module modules/registry
 */

import { BaseDiagramModule } from "../diagrams/base/index.mjs";
import { validateRegistryDependencies } from "./dependencies.mjs";
import { defaultPlatformServiceRegistry } from "../general/platform/services.mjs";

const KIND_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Registry for statically known diagram modules.
 * @public
 */
export class DiagramModuleRegistry {
  /**
   * @param {{modules?: BaseDiagramModule[], frozen?: boolean, serviceRegistry?: import("../general/platform/services.mjs").PlatformServiceRegistry}} [options]
   */
  constructor(options = {}) {
    /** @type {Map<string, BaseDiagramModule>} */
    this._modules = new Map();
    this._serviceRegistry = options.serviceRegistry ?? defaultPlatformServiceRegistry;
    /** @type {Map<string, readonly import("./dependencies.mjs").ResolvedModuleDependency[]>} */
    this._resolvedDependencies = new Map();
    this._frozen = false;
    for (const module of options.modules ?? []) this.register(module);
    if (options.frozen) this.freeze();
  }

  /**
   * Register a module before the registry is frozen.
   * @param {BaseDiagramModule} module Module to register.
   * @returns {this}
   */
  register(module) {
    if (this._frozen) throw new Error("DiagramModuleRegistry is frozen");
    validateDiagramModule(module);
    if (this._modules.has(module.kind)) {
      throw new Error(`Duplicate diagram module kind: ${module.kind}`);
    }
    this._modules.set(module.kind, module);
    return this;
  }

  /** @returns {this} */
  freeze() {
    this._resolvedDependencies = validateRegistryDependencies(this.list(), this._serviceRegistry);
    this._frozen = true;
    return this;
  }

  /** @returns {boolean} */
  get frozen() {
    return this._frozen;
  }

  /** @param {string} kind Module kind. @returns {BaseDiagramModule|null} */
  get(kind) {
    return this._modules.get(kind) ?? null;
  }

  /** @returns {BaseDiagramModule[]} Registered modules in registration order. */
  list() {
    return [...this._modules.values()];
  }

  /**
   * Detect the owning module for a source string.
   * @param {string} text PlantUML source.
   * @returns {BaseDiagramModule|null}
   */
  detect(text) {
    const directive = firstStartDirective(text);
    if (directive && directive !== "@startuml") {
      for (const module of this._modules.values()) {
        if (module.startDirectives.includes(directive)) return module;
      }
    }
    for (const module of this._modules.values()) {
      if (module.detect(text)) return module;
    }
    if (directive === "@startuml" || !directive) {
      for (const module of this._modules.values()) {
        if (module.genericFallback && module.startDirectives.includes("@startuml")) return module;
      }
    }
    return null;
  }

  /**
   * @param {string} kind Diagram module kind.
   * @returns {readonly import("./dependencies.mjs").ResolvedModuleDependency[]}
   */
  resolvedDependencies(kind) {
    return this._resolvedDependencies.get(kind) ?? Object.freeze([]);
  }

  /** @returns {object[]} Stable manifests for self-introspection. */
  manifests() {
    return this.list().map((module) => module.toManifest());
  }
}

/**
 * Validate that an object obeys the minimum DiagramModule contract.
 * @param {unknown} module Candidate module.
 * @returns {asserts module is BaseDiagramModule}
 * @public
 */
export function validateDiagramModule(module) {
  if (!(module instanceof BaseDiagramModule)) {
    throw new TypeError("diagram module must extend BaseDiagramModule");
  }
  if (!KIND_RE.test(module.kind))
    throw new TypeError(`invalid diagram module kind: ${module.kind}`);
  if (!module.parserPlugins().every((plugin) => plugin && typeof plugin.name === "string")) {
    throw new TypeError(`diagram module ${module.kind} has invalid parser plugins`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(module.version)) {
    throw new TypeError(`diagram module ${module.kind} has invalid version`);
  }
  const security = module.securityProfile();
  if (!security || typeof security !== "object") {
    throw new TypeError(`diagram module ${module.kind} must declare a security profile`);
  }
}

/**
 * @param {unknown} registry Registry candidate.
 * @returns {DiagramModuleRegistry}
 * @public
 */
export function ensureDiagramModuleRegistry(registry) {
  if (!(registry instanceof DiagramModuleRegistry)) {
    throw new TypeError("expected a DiagramModuleRegistry");
  }
  return registry;
}

/**
 * @param {string} text PlantUML source.
 * @returns {string|null} Lower-case @start directive, or null.
 */
function firstStartDirective(text) {
  const match = String(text).match(/^\s*(@start[a-z0-9_]*)\b/im);
  return match ? match[1].toLowerCase() : null;
}
