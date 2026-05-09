/**
 * Base diagram module classes.
 * @module diagrams/base/module
 */

import { freezeOwnedArtifacts } from "./artifacts.mjs";
import { BaseModuleAssets } from "./assets.mjs";
import { freezeDependency } from "./dependencies.mjs";
import { BaseModuleDocs } from "./docs.mjs";
import { BaseModuleLayout } from "./layout.mjs";
import { BaseModuleParser } from "./parser.mjs";
import { BaseModuleRenderer } from "./renderer.mjs";
import { BaseModuleSecurity } from "./security.mjs";
import { BaseModuleTests } from "./tests.mjs";

/**
 * @typedef {object} BaseDiagramModuleOptions
 * @property {string} kind Stable module kind.
 * @property {string} [version] Diagram module contract version.
 * @property {string} [family] Module family name.
 * @property {string} [layoutStrategy] Declared layout strategy.
 * @property {string} [artifactRoot] Repository path to this module's artifact folder.
 * @property {import("./artifacts.mjs").ModuleOwnedArtifacts} [ownedArtifacts] Module-owned parser/model/layout/render/docs/tests files.
 * @property {boolean} [genericFallback] Whether the generic PlantUML start directive may fall back to this module.
 * @property {readonly string[]} [startDirectives] Supported PlantUML start directives.
 * @property {BaseModuleParser} [parser] Parser contract implementation.
 * @property {BaseModuleLayout | ((model:object, context:object) => object|Promise<object>|void|Promise<void>)} [layout] Layout contract implementation or module layout function.
 * @property {BaseModuleRenderer} [renderer] Renderer contract implementation.
 * @property {BaseModuleDocs | import("./docs.mjs").ModuleDocsManifest} [docs] Documentation contract or manifest.
 * @property {BaseModuleTests | import("./tests.mjs").ModuleTestManifest} [tests] Test contract or manifest.
 * @property {BaseModuleSecurity | import("../../general/platform/security_base.mjs").ModuleSecurityProfile} [security] Security contract or profile.
 * @property {BaseModuleAssets | import("../../general/platform/asset_base.mjs").ModuleAssetManifest} [assets] Asset contract or manifest.
 * @property {readonly any[]} [parserPlugins] Ordered parser plugins.
 * @property {() => Record<string, any>} [createParseContext] Parser context factory.
 * @property {(lines:string[]) => string[]} [prepareLines] Source-line preprocessor.
 * @property {(text:string) => boolean} [detect] Source ownership heuristic.
 * @property {readonly import("./dependencies.mjs").ModuleDependencySpec[]} [dependencies] Dependency specs.
 * @property {Record<string, (model:object, options:object, context:object) => object>} [renderers] Renderer adapters.
 */

/**
 * Abstract base for every diagram module.
 * @public
 */
export class BaseDiagramModule {
  /** @param {BaseDiagramModuleOptions} options Module options. */
  constructor(options) {
    if (!options?.kind) throw new TypeError("BaseDiagramModule requires a stable kind");
    this.kind = options.kind;
    this.version = options.version ?? "1.0.0";
    this.moduleType = "diagram";
    this.family = options.family ?? "base";
    this.artifactRoot = options.artifactRoot ?? "";
    this._ownedArtifacts = freezeOwnedArtifacts(options.ownedArtifacts);
    this.genericFallback = options.genericFallback === true;
    this.startDirectives = Object.freeze([...(options.startDirectives ?? ["@startuml"])]);
    this.dependencies = Object.freeze([...(options.dependencies ?? [])].map(freezeDependency));
    this.parser =
      options.parser ??
      new BaseModuleParser({
        plugins: options.parserPlugins,
        createParseContext: options.createParseContext,
        prepareLines: options.prepareLines,
        detect: options.detect,
      });
    this.layoutContract =
      options.layout instanceof BaseModuleLayout
        ? options.layout
        : new BaseModuleLayout({
            layoutStrategy: options.layoutStrategy,
            layout: typeof options.layout === "function" ? options.layout : undefined,
          });
    this.renderer = options.renderer ?? new BaseModuleRenderer({ renderers: options.renderers });
    this.documentation =
      options.docs instanceof BaseModuleDocs ? options.docs : new BaseModuleDocs(options.docs);
    this.testSuite =
      options.tests instanceof BaseModuleTests ? options.tests : new BaseModuleTests(options.tests);
    this.security =
      options.security instanceof BaseModuleSecurity
        ? options.security
        : new BaseModuleSecurity(options.security);
    this.assets =
      options.assets instanceof BaseModuleAssets
        ? options.assets
        : new BaseModuleAssets(options.assets);
    this.layoutStrategy = this.layoutContract.layoutStrategy;
    Object.freeze(this);
  }

  /** @returns {import("../../util/parser_engine.mjs").Plugin[]} Ordered parser plugins. */
  parserPlugins() {
    return this.parser.plugins();
  }

  /** @param {string[]} lines Raw source lines. @returns {string[]} Engine-ready lines. */
  prepareLines(lines) {
    return this.parser.prepareLines(lines);
  }

  /** @param {string} text Raw PlantUML source. @returns {boolean} Whether this module owns it. */
  detect(text) {
    return this.parser.detect(text);
  }

  /** @returns {Record<string, any>} Mutable parser context. */
  createParseContext() {
    return this.parser.createParseContext();
  }

  /** @returns {import("../../general/platform/security_base.mjs").ModuleSecurityProfile} Security profile. */
  securityProfile() {
    return this.security.profile();
  }

  /** @returns {import("./docs.mjs").ModuleDocsManifest} Documentation manifest. */
  docsManifest() {
    return this.documentation.manifest();
  }

  /** @returns {import("./tests.mjs").ModuleTestManifest} Test manifest. */
  testManifest() {
    return this.testSuite.manifest();
  }

  /** @returns {import("../../general/platform/asset_base.mjs").ModuleAssetManifest} Asset manifest. */
  assetManifest() {
    return this.assets.manifest();
  }

  /** @returns {import("./dependencies.mjs").ModuleDependencySpec[]} Dependency specs. */
  dependencySpecs() {
    return [...this.dependencies];
  }

  /**
   * Module-specific layout adapter. Defaults to a no-op when no layout is declared.
   * @param {object} model Diagram model.
   * @param {object} context Layout context.
   * @returns {object|Promise<object>|void|Promise<void>}
   */
  layout(model, context) {
    return this.layoutContract.layout(model, context);
  }

  /** @returns {Record<string, Function>} Renderer adapters. */
  renderers() {
    return this.renderer.renderers();
  }

  /** @returns {object} Stable manifest used by self-introspection. */
  toManifest() {
    return Object.freeze({
      kind: this.kind,
      version: this.version,
      moduleType: this.moduleType,
      family: this.family,
      layoutStrategy: this.layoutStrategy,
      artifactRoot: this.artifactRoot,
      ownedArtifacts: this._ownedArtifacts,
      genericFallback: this.genericFallback,
      startDirectives: this.startDirectives,
      parserPlugins: this.parserPlugins().map((/** @type {any} */ plugin) => plugin.name),
      dependencies: this.dependencies,
      docs: this.docsManifest(),
      tests: this.testManifest(),
      assets: this.assetManifest(),
      security: this.securityProfile(),
    });
  }
}

/** @public */
export class GraphModuleBase extends BaseDiagramModule {
  /** @param {BaseDiagramModuleOptions} options Module options. */
  constructor(options) {
    super({ ...options, family: options.family ?? "graph" });
  }
}

/** @public */
export class TimelineModuleBase extends BaseDiagramModule {
  /** @param {BaseDiagramModuleOptions} options Module options. */
  constructor(options) {
    super({ ...options, family: options.family ?? "timeline" });
  }
}

/** @public */
export class TreeModuleBase extends BaseDiagramModule {
  /** @param {BaseDiagramModuleOptions} options Module options. */
  constructor(options) {
    super({ ...options, family: options.family ?? "tree" });
  }
}

/** @public */
export class DataModuleBase extends BaseDiagramModule {
  /** @param {BaseDiagramModuleOptions} options Module options. */
  constructor(options) {
    super({ ...options, family: options.family ?? "data" });
  }
}

/** @public */
export class ExternalBridgeModuleBase extends BaseDiagramModule {
  /** @param {BaseDiagramModuleOptions} options Module options. */
  constructor(options) {
    super({ ...options, family: options.family ?? "externalBridge" });
  }
}
