import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  Diagram,
  DiagramModuleRegistry,
  BaseModuleAssets,
  BaseModuleDocs,
  BaseModuleLayout,
  BaseModuleParser,
  BaseModuleRenderer,
  BaseModuleSecurity,
  BaseModuleTests,
  ClassDiagramModule,
  ComponentDiagramModule,
  GraphModuleBase,
  SecurityError,
  SequenceDiagram,
  SequenceDiagramModule,
  classDiagramModule,
  componentDiagramModule,
  createModuleSecurityProfile,
  createSecurityBase,
  defaultDiagramModuleRegistry,
  defaultPlatformServiceRegistry,
  describeDiagramPlatform,
  exportDiagramWithModule,
  getDiagramModuleKind,
  getDiagramModuleMetadata,
  layoutDiagramWithModule,
  parsePlantUml,
  renderPlantUml,
  setDiagramModuleMetadata,
  sequenceDiagramModule,
} from "../index.mjs";

test("module registry is closed-world and exposes built-in manifests", () => {
  assert.equal(defaultDiagramModuleRegistry.frozen, true);
  assert.deepEqual(
    defaultDiagramModuleRegistry.list().map((module) => module.kind),
    ["sequence", "class", "component", "deployment"],
  );
  assert.throws(
    () => defaultDiagramModuleRegistry.register(componentDiagramModule),
    /DiagramModuleRegistry is frozen/,
  );

  const registry = new DiagramModuleRegistry();
  registry
    .register(sequenceDiagramModule)
    .register(classDiagramModule)
    .register(componentDiagramModule)
    .freeze();
  assert.equal(
    registry.detect("@startuml\nparticipant A\nA -> A : ping\n@enduml")?.kind,
    "sequence",
  );
  assert.equal(registry.detect("@startclass\nclass User\n@enduml")?.kind, "class");
  assert.equal(registry.detect("@startuml\nclass User\n@enduml")?.kind, "class");
  assert.equal(registry.detect("@startcomponent\ncomponent API\n@enduml")?.kind, "component");
  assert.equal(registry.detect("@startuml\n[A]\n@enduml")?.kind, "component");
  assert.equal(registry.detect("")?.kind, "component");
});

test("built-in diagram modules are concrete classes composed from base facets", () => {
  const expectations = [
    [sequenceDiagramModule, SequenceDiagramModule],
    [classDiagramModule, ClassDiagramModule],
    [componentDiagramModule, ComponentDiagramModule],
  ];

  for (const [module, ModuleClass] of expectations) {
    assert.ok(module instanceof ModuleClass);
    assert.ok(module.parser instanceof BaseModuleParser, `${module.kind} parser facet`);
    assert.ok(module.layoutContract instanceof BaseModuleLayout, `${module.kind} layout facet`);
    assert.ok(module.renderer instanceof BaseModuleRenderer, `${module.kind} renderer facet`);
    assert.ok(module.documentation instanceof BaseModuleDocs, `${module.kind} docs facet`);
    assert.ok(module.testSuite instanceof BaseModuleTests, `${module.kind} tests facet`);
    assert.ok(module.security instanceof BaseModuleSecurity, `${module.kind} security facet`);
    assert.ok(module.assets instanceof BaseModuleAssets, `${module.kind} assets facet`);
  }
});

test("parsePlantUml records module metadata without mutating model classes", () => {
  const sequence = parsePlantUml("@startuml\nparticipant A\nA -> A : ping\n@enduml");
  assert.ok(sequence instanceof SequenceDiagram);
  assert.equal(getDiagramModuleKind(sequence), "sequence");
  assert.equal(getDiagramModuleMetadata(sequence)?.module.kind, "sequence");

  const classDiagram = parsePlantUml("@startclass\nclass User\n@enduml");
  assert.ok(classDiagram instanceof Diagram);
  assert.equal(getDiagramModuleKind(classDiagram), "class");
  assert.equal(getDiagramModuleMetadata(classDiagram)?.module.kind, "class");

  const component = parsePlantUml("@startuml\n[A]\n[B]\nA --> B\n@enduml");
  assert.ok(component instanceof Diagram);
  assert.equal(getDiagramModuleKind(component), "component");
  assert.equal(getDiagramModuleMetadata(component)?.module.kind, "component");
});

test("module-aware pipeline dispatches to module layout and renderer adapters", async () => {
  let layoutCalled = false;
  let renderCalled = false;
  const module = new GraphModuleBase({
    kind: "custom-test",
    layoutStrategy: "custom",
    startDirectives: ["@startcustom"],
    createParseContext: () => ({}),
    security: createModuleSecurityProfile({ capabilities: ["sanitize"] }),
    layout(model, context) {
      layoutCalled = context.kind === "custom-test";
      return model;
    },
    renderers: {
      excalidraw(model, options, context) {
        renderCalled = context.kind === "custom-test" && options.sourceLabel === "custom";
        return {
          type: "excalidraw",
          version: 2,
          source: "",
          elements: [],
          appState: {},
          files: {},
        };
      },
    },
  });
  const diagram = new Diagram();
  const securityBase = createSecurityBase();
  const securityContext = securityBase.createContext(module.securityProfile(), {
    module: module.kind,
  });
  setDiagramModuleMetadata(diagram, {
    kind: module.kind,
    module,
    securityContext,
    diagnostics: securityContext.diagnostics,
  });

  await layoutDiagramWithModule(diagram);
  const doc = exportDiagramWithModule(diagram, { sourceLabel: "custom" });

  assert.equal(layoutCalled, true);
  assert.equal(renderCalled, true);
  assert.equal(doc.type, "excalidraw");
});

test("module-aware render path preserves existing renderPlantUml API", async () => {
  const doc = await renderPlantUml("@startuml\n[A]\n[B]\nA --> B\n@enduml", {
    sourceLabel: "module-aware-render",
  });
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
});

test("security-base failure boundary converts unexpected failures to fail-closed diagnostics", () => {
  const securityBase = createSecurityBase();
  const context = securityBase.createContext(securityBase.defaultProfileFor("test"), {
    module: "test",
  });
  const boundary = securityBase.createFailureBoundary("render", context);

  assert.throws(
    () =>
      boundary.run(() => {
        throw new Error("internal stack detail should not be exposed");
      }),
    SecurityError,
  );
  assert.equal(context.fatal, true);
  assert.equal(context.diagnostics[0].code, "failure.render");
  assert.equal(context.diagnostics[0].message.includes("internal stack detail"), false);
});

test("security-base validates links, style values, capabilities and artifacts", () => {
  const securityBase = createSecurityBase();
  const context = securityBase.createContext(securityBase.defaultProfileFor("test"), {
    module: "test",
  });

  assert.equal(securityBase.sanitizeUrl("https://example.invalid", context).safe, true);
  assert.equal(securityBase.sanitizeUrl("javascript:alert(1)", context).safe, false);
  assert.throws(() => securityBase.assertCapability("network", context), SecurityError);

  const styleContext = securityBase.createContext(securityBase.defaultProfileFor("style-test"), {
    module: "style-test",
  });
  assert.throws(
    () => securityBase.sanitizeStyle({ fill: "url(javascript:alert(1))" }, styleContext),
    SecurityError,
  );

  const artifactContext = securityBase.createContext(
    securityBase.defaultProfileFor("artifact-test"),
    {
      module: "artifact-test",
    },
  );
  assert.throws(
    () =>
      securityBase.assertSafeArtifact(
        { elements: [{ type: "rectangle", x: NaN }] },
        artifactContext,
      ),
    SecurityError,
  );
});

test("platform introspection is manifest-driven", () => {
  const platform = describeDiagramPlatform();
  assert.deepEqual(
    platform.modules.map((module) => module.kind),
    ["sequence", "class", "component", "deployment"],
  );
  assert.deepEqual(platform.diagramModules, platform.modules);
  assert.ok(platform.platformServices.some((service) => service.kind === "security-base"));
  assert.ok(platform.dependencies.some((dependency) => dependency.to === "security-base"));
  assert.ok(
    platform.dependencies.some(
      (dependency) =>
        dependency.to === "security-base" && dependency.targetType === "platform-service",
    ),
  );
  assert.ok(platform.capabilities.includes("sanitize"));
  assert.ok(platform.modules.every((module) => Array.isArray(module.parserPlugins)));
  for (const module of platform.modules) {
    assert.match(module.artifactRoot, /^src\/diagrams\//);
    assert.ok(module.ownedArtifacts.parser.length > 0, `${module.kind} must own parser artifacts`);
    assert.ok(module.ownedArtifacts.layout.length > 0, `${module.kind} must own layout artifacts`);
    assert.ok(module.ownedArtifacts.render.length > 0, `${module.kind} must own render artifacts`);
    assert.ok(
      module.ownedArtifacts.security.length > 0,
      `${module.kind} must own security artifacts`,
    );
    assert.ok(module.ownedArtifacts.assets.length > 0, `${module.kind} must own asset artifacts`);
    assert.ok(module.ownedArtifacts.docs.length > 0, `${module.kind} must own docs artifacts`);
    assert.ok(module.ownedArtifacts.tests.length > 0, `${module.kind} must own test artifacts`);
    for (const artifact of [
      module.artifactRoot,
      ...module.ownedArtifacts.parser,
      ...module.ownedArtifacts.style,
      ...module.ownedArtifacts.layout,
      ...module.ownedArtifacts.render,
      ...module.ownedArtifacts.security,
      ...module.ownedArtifacts.assets,
      ...module.ownedArtifacts.docs,
      ...module.ownedArtifacts.tests,
    ]) {
      assert.equal(existsSync(path.join(process.cwd(), artifact)), true, `missing ${artifact}`);
    }
  }
  assert.equal(defaultPlatformServiceRegistry.get("component"), null);
  assert.equal(defaultDiagramModuleRegistry.get("security-base"), null);
});

test("source layout foregrounds diagram modules and separates runtime concerns", () => {
  const requiredPaths = [
    "src/diagrams/base/index.mjs",
    "src/diagrams/base/module.mjs",
    "src/diagrams/index.mjs",
    "src/main/parser.mjs",
    "src/main/pipeline.mjs",
    "src/main/registry.mjs",
    "src/general/model/diagram.mjs",
    "src/general/platform/security_base.mjs",
    "src/general/render/excalidraw.mjs",
    "src/general/style/style.mjs",
    "src/util/parser_engine.mjs",
    "src/util/plantuml_utils.mjs",
  ];

  for (const requiredPath of requiredPaths) {
    assert.equal(
      existsSync(path.join(process.cwd(), requiredPath)),
      true,
      `missing ${requiredPath}`,
    );
  }

  const requiredFacets = [
    "assets.mjs",
    "docs.mjs",
    "layout.mjs",
    "module.mjs",
    "parser.mjs",
    "render.mjs",
    "security.mjs",
    "tests.mjs",
  ];

  for (const diagramKind of ["sequence", "class", "component"]) {
    for (const facet of requiredFacets) {
      const facetPath = `src/diagrams/${diagramKind}/${facet}`;
      assert.equal(existsSync(path.join(process.cwd(), facetPath)), true, `missing ${facetPath}`);
    }
  }
});

test("legacy source folders are removed from src", () => {
  const removedFolders = [
    "src/parser",
    "src/layout",
    "src/model",
    "src/modules",
    "src/platform",
    "src/render",
    "src/style",
  ];

  for (const folder of removedFolders) {
    assert.equal(existsSync(path.join(process.cwd(), folder)), false, `${folder} must not exist`);
  }

  const removedFiles = [
    "src/general/layout/sequence_layout.mjs",
    "src/general/layout/sequence_spacing.mjs",
    "src/general/render/sequence_render.mjs",
  ];

  for (const file of removedFiles) {
    assert.equal(existsSync(path.join(process.cwd(), file)), false, `${file} must not exist`);
  }
});

test("diagram registry validates declared platform service dependencies", () => {
  const registry = new DiagramModuleRegistry({
    modules: [sequenceDiagramModule, classDiagramModule, componentDiagramModule],
    frozen: true,
  });

  assert.ok(
    registry
      .resolvedDependencies("class")
      .some((dependency) => dependency.kind === "graph-structure"),
  );

  const brokenModule = new GraphModuleBase({
    kind: "broken",
    createParseContext: () => ({}),
    security: createModuleSecurityProfile(),
    dependencies: [
      {
        kind: "missing-service",
        versionRange: "^1.0.0",
        capabilities: ["missing"],
        optional: false,
      },
    ],
  });

  assert.throws(
    () => new DiagramModuleRegistry({ modules: [brokenModule], frozen: true }),
    /unresolved dependency: missing-service/,
  );
});
