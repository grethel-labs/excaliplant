import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "acorn";
import { validateSkill } from "../src/skills/frontmatter.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const exists = (file) => existsSync(path.join(root, file));
const resolve = (file, specifier) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));

function* filesIn(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* filesIn(file);
    else yield file;
  }
}

// Built-ins and runtime packages sit behind these specific rendering boundaries.
const renderPackages = new Map([
  ["src/diagrams/graph/elk_runner.mjs", new Set(["elkjs/lib/elk.bundled.js"])],
  ["src/render/font.mjs", new Set(["node:fs", "node:url"])],
  ["src/render/png.mjs", new Set(["@resvg/resvg-js"])],
  ["src/render/svg.mjs", new Set(["roughjs"])],
]);
const hostModules = /^(?:bin\/|src\/(?:markdown|mcp|skills)\/)/;
const rendererSupport = new Set(["src/core/limits.mjs", "src/layout/font_metrics.mjs"]);
const hostInternalImports = new Map([
  ["src/mcp/executor.mjs", ["src/diagrams/graph/elk_runner.mjs", "isElkLoaded"]],
  ["src/mcp/worker.mjs", ["src/diagrams/graph/elk_runner.mjs", "isElkLoaded"]],
  ["src/mcp/tools.mjs", ["src/core/pipeline.mjs", "parseBlock"]],
]);
const ambientIo = new Set(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport"]);
const ambientTime = new Set(["Date.now", "performance.now", "performance.timeOrigin"]);
const ambientRandom = new Set(["Math.random", "crypto.getRandomValues", "crypto.randomUUID"]);
const rawSceneFields = new Set(["strokeColor", "backgroundColor", "versionNonce", "isDeleted"]);
const drawingModules = /^(?:src\/draw\/(?:canvas|frame)|src\/diagrams\/.+\/draw)\.mjs$/;
const geometryModules =
  /^(?:src\/layout\/|src\/draw\/shapes\.mjs$|src\/diagrams\/.+\/(?:layout|route|elk_runner)\.mjs$)/;

function nameOf(node) {
  return node?.type === "Identifier" ? node.name : node?.value;
}

function memberName(node) {
  if (node?.type !== "MemberExpression") return undefined;
  return node.computed && node.property.type !== "Literal" ? undefined : nameOf(node.property);
}

// Visit ESTree children only. Comments, strings and JSDoc are data.
function walk(node, visit, parent) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit, node));
    else walk(value, visit, node);
  }
}

// Mixed-stage modules can import geometry and drawing for their other hooks.
// Follow each hook's local references (including rule arrays) to its imports.
function checkDiagramHooks(ast, file, hooks, report) {
  const imports = new Map();
  const declarations = new Map();
  for (const statement of ast.body) {
    const declaration = statement.declaration ?? statement;
    if (statement.type === "ImportDeclaration") {
      const target = resolve(file, statement.source.value);
      for (const { local } of statement.specifiers) imports.set(local.name, target);
    }
    if (declaration.type === "FunctionDeclaration" && declaration.id) {
      declarations.set(declaration.id.name, declaration);
    }
    if (declaration.type === "VariableDeclaration") {
      for (const { id, init } of declaration.declarations) {
        if (id.type === "Identifier" && init) declarations.set(id.name, init);
      }
    }
  }
  for (const [stage, hook] of hooks) {
    const visited = new Set();
    const inspect = (binding) => {
      if (visited.has(binding)) return;
      visited.add(binding);
      walk(binding, (node, parent) => {
        if (node.type !== "Identifier") return;
        if (
          !parent?.computed &&
          ((parent?.type === "MemberExpression" && parent.property === node) ||
            (parent?.type === "Property" && parent.key === node && !parent.shorthand))
        )
          return;
        const target = imports.get(node.name);
        if (
          target &&
          (drawingModules.test(target) || (stage === "parse" && geometryModules.test(target)))
        ) {
          report(node, `${stage} hook must not use ${node.name} from ${target}`);
        }
        const local = declarations.get(node.name);
        if (local) inspect(local);
      });
    };
    inspect(hook);
  }
}

test("runtime sources respect the module, rendering and host boundaries", () => {
  const problems = [];
  const files = new Set([...filesIn("src"), ...filesIn("bin")]);
  for (const file of files) {
    if (!/\.[cm]?js$/.test(file)) continue;
    if (
      !/^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*(?:\.generated)?\.mjs$/.test(path.posix.basename(file))
    ) {
      problems.push(`${file}: use an explicit .mjs module with a lower-case filename`);
    }
    const host = hostModules.test(file);
    const renderer = file.startsWith("src/render/");
    const diagram = file.startsWith("src/diagrams/");
    const parser = diagram && file.endsWith("/parse.mjs");
    const layout = file.startsWith("src/layout/") || (diagram && file.endsWith("/layout.mjs"));
    const sceneClient = diagram || (file.startsWith("src/draw/") && file !== "src/draw/canvas.mjs");

    const source = read(file);
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module" });
    const hooks = [];
    const reportAt = (node, message) => {
      const line = source.slice(0, node.start).split("\n").length;
      problems.push(`${file}:${line}: ${message}`);
    };
    walk(ast, (node) => {
      const report = (message) => reportAt(node, message);
      if (
        node.type === "ImportDeclaration" ||
        node.type === "ImportExpression" ||
        node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration"
      ) {
        if (!node.source) return;
        const specifier = node.source.value;
        if (typeof specifier !== "string") {
          report("use a literal runtime module specifier");
          return;
        }
        if (!specifier.startsWith(".")) {
          if (!host && !renderPackages.get(file)?.has(specifier)) {
            report(`rendering cannot import ${specifier} at this layer`);
          }
          return;
        }
        const target = resolve(file, specifier);
        if (!specifier.endsWith(".mjs") || !files.has(target)) {
          report(`relative module specifier must point to an existing .mjs file: ${specifier}`);
        }
        if (!host && (!target.startsWith("src/") || hostModules.test(target))) {
          report(`rendering cannot depend on host code: ${target}`);
        }
        if (renderer && !target.startsWith("src/render/") && !rendererSupport.has(target)) {
          report(`renderer cannot depend on PlantUML layers: ${target}`);
        }
        if (diagram && target.startsWith("src/render/")) {
          report(`draw through Canvas instead of importing ${target}`);
        }
        if (
          (parser && geometryModules.test(target)) ||
          ((parser || layout) && drawingModules.test(target))
        ) {
          report(`layer cannot import ${target}`);
        }
        if (host && /^(?:src\/diagrams\/|src\/core\/(?:pipeline\.mjs|preprocess\/))/.test(target)) {
          const [allowedTarget, binding] = hostInternalImports.get(file) ?? [];
          if (
            target !== allowedTarget ||
            node.type !== "ImportDeclaration" ||
            node.specifiers.length !== 1 ||
            node.specifiers[0].imported?.name !== binding
          ) {
            report(`use the shared public API instead of importing ${target}`);
          }
        }
      }
      if (node.type === "MemberExpression") {
        const property = memberName(node);
        const object = memberName(node.object) ?? nameOf(node.object);
        const member = `${object}.${property}`;
        if (member === "module.exports" || object === "exports") report("use ESM exports");
        if (!host && (ambientTime.has(member) || ambientRandom.has(member))) {
          report(`use seeded or supplied values instead of ${member}`);
        }
        if (sceneClient && rawSceneFields.has(property)) report(`let Canvas manage ${property}`);
      }
      if (sceneClient && node.type === "Property" && rawSceneFields.has(nameOf(node.key))) {
        report(`let Canvas manage ${nameOf(node.key)}`);
      }
      if (node.type === "CallExpression" || node.type === "NewExpression") {
        const callee = memberName(node.callee) ?? nameOf(node.callee);
        const spec = node.arguments[0];
        if (
          diagram &&
          (callee === "defineDiagram" || callee === "graphModule") &&
          spec?.type === "ObjectExpression"
        ) {
          for (const property of spec.properties) {
            const hook = nameOf(property.key);
            if (callee === "defineDiagram" && (hook === "parse" || hook === "layout")) {
              hooks.push([hook, property.value]);
            }
            if (callee === "graphModule" && ["implicit", "rules", "finish"].includes(hook)) {
              hooks.push(["parse", property.value]);
            }
          }
        }
        if (callee === "require") report("use ESM imports");
        if (!host && ambientIo.has(callee)) report(`keep ${callee} out of rendering`);
        if (
          !host &&
          callee === "Date" &&
          (node.type === "CallExpression" || node.arguments.length === 0)
        ) {
          report("supply a deterministic date");
        }
      }
    });
    if (hooks.length) checkDiagramHooks(ast, file, hooks, reportAt);
  }
  assert.deepEqual(problems, []);
});

test("the committed npm manifest and lockfile use the development version", () => {
  const manifest = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(manifest.type, "module");
  assert.equal(manifest.engines.node, ">=20");
  for (const metadata of [manifest, lock, lock.packages[""]]) {
    assert.equal(metadata.version, "0.0.0-development");
  }
});

test("repository instructions route to every portable development skill", () => {
  const agents = read("AGENTS.md");
  const dir = ".agents/skills";
  const paths = readdirSync(path.join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("excaliplant-"))
    .map((entry) => `${dir}/${entry.name}/SKILL.md`);
  const routed = [...agents.matchAll(/\]\((\.agents\/skills\/[^/)]+\/SKILL\.md)\)/g)].map(
    ([, target]) => target,
  );
  assert.ok(paths.length > 0, "repository skills are installed");
  assert.deepEqual(routed.toSorted(), paths.toSorted());
  for (const file of paths) {
    const source = read(file);
    assert.deepEqual(
      validateSkill(source, path.posix.basename(path.posix.dirname(file))),
      [],
      file,
    );
    for (const [, target] of source.matchAll(/\]\((\.\.?\/[^)#]+)(?:#[^)]*)?\)/g)) {
      assert.ok(exists(resolve(file, target)), `${file}: broken relative link to ${target}`);
    }
  }
});
