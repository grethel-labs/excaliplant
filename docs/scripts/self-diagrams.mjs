// Generate PlantUML sources that describe excaliplant itself.
//
// Used by:
//   - tests/self_introspection.test.mjs   (regression test)
//   - scripts/build-docs.mjs              (writes README diagrams)
//
// Three generators:
//
//   buildModuleDiagramSource()         → component diagram of src/
//   buildSequenceDiagramSource()       → sequence of renderPlantUml(text)
//   buildPluginDetailDiagramSource()   → each registered parser plugin as a box
//   buildModelClassDiagramSource()     → class diagram of exported model classes

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SRC = path.join(ROOT, "src");

// ---------------------------------------------------------------------------
// 1. Module / component diagram from src/ imports
// ---------------------------------------------------------------------------

export async function buildModuleDiagramSource() {
  const files = await collectMjs(SRC);
  // Group by top-level folder under src/ → planes; subfolders → subplanes.
  /** @type {Record<string, Record<string, string[]>>} */
  const tree = {};
  for (const f of files) {
    const rel = path.relative(SRC, f); // e.g. parser/plugins/component/notes.mjs
    const parts = rel.split(path.sep);
    const plane = parts[0]; // parser
    const sub = parts.length > 2 ? parts.slice(1, -1).join("/") : "";
    const leaf = parts[parts.length - 1].replace(/\.mjs$/, "");
    tree[plane] ??= {};
    tree[plane][sub] ??= [];
    tree[plane][sub].push(leaf);
  }

  // Resolve imports between modules to draw edges.
  const idOf = (rel) => slug(rel.replace(/\.mjs$/, ""));
  const edges = [];
  for (const f of files) {
    const rel = path.relative(SRC, f);
    const fromId = idOf(rel);
    const text = await readFile(f, "utf8");
    const importRe = /from\s+["']([^"']+)["']/g;
    let m;
    while ((m = importRe.exec(text)) !== null) {
      const target = m[1];
      if (!target.startsWith(".")) continue; // skip external imports
      const resolved = path.normalize(path.join(path.dirname(rel), target));
      const targetRel = resolved.endsWith(".mjs") ? resolved : `${resolved}.mjs`;
      const candidate = path.join(SRC, targetRel);
      if (!files.includes(candidate)) continue;
      const toId = idOf(targetRel);
      if (fromId !== toId) edges.push([fromId, toId]);
    }
  }

  const lines = ["@startuml", `title "excaliplant — module structure"`];
  for (const [plane, subs] of Object.entries(tree)) {
    lines.push(`package "${plane}" as ${slug(plane)} {`);
    for (const [sub, leaves] of Object.entries(subs)) {
      if (sub === "") {
        for (const leaf of leaves) {
          const id = idOf(path.join(plane, `${leaf}.mjs`));
          lines.push(`  [${leaf}] as ${id}`);
        }
      } else {
        const subId = slug(`${plane}_${sub}`);
        lines.push(`  package "${sub}" as ${subId} {`);
        for (const leaf of leaves) {
          const id = idOf(path.join(plane, sub, `${leaf}.mjs`));
          lines.push(`    [${leaf}] as ${id}`);
        }
        lines.push("  }");
      }
    }
    lines.push("}");
  }
  // Deduplicate edges.
  const seen = new Set();
  for (const [a, b] of edges) {
    const key = `${a}->${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`${a} --> ${b}`);
  }
  lines.push("@enduml");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 2. Sequence diagram for renderPlantUml(text)
// ---------------------------------------------------------------------------

export function buildSequenceDiagramSource() {
  return [
    "@startuml",
    `title "renderPlantUml — call flow"`,
    "skinparam sequence {",
    "  ArrowColor #334155",
    "  ParticipantBorderColor #475569",
    "  LifeLineBorderColor #94a3b8",
    "}",
    "autonumber 1",
    "actor       Caller",
    "participant index    as idx",
    'box "Parser pipeline" #LightBlue',
    "participant parser",
    "participant engine",
    "participant plugin",
    "end box",
    "participant layout",
    "participant renderer",
    "participant svg as svg",
    "participant png as png",
    "",
    "Caller -> idx ++    : renderPlantUml(text, opts)",
    "== Parse ==",
    "idx    -> parser    : parsePlantUml(text)",
    "parser -> engine    : runEngine({ lines, plugins, ctx })",
    "loop each PlantUML line",
    "engine -> plugin    : tryLine / tryStart per line",
    "alt plugin consumes line",
    "plugin --> engine   : consume + mutate ctx",
    "else unknown line",
    "engine -> engine    : collect diagnostic",
    "end",
    "end",
    "engine --> parser   : Diagram | SequenceDiagram",
    "parser --> idx      : model",
    "... layout phase ...",
    "idx    -> layout    : layoutDiagram(model)",
    "layout --> idx      : positions + edge paths",
    "ref over idx, renderer : RenderResult wraps Excalidraw JSON with toSvg() and toPng() helpers",
    "idx    -> renderer  : exportDiagram(model)",
    "renderer --> idx    : Excalidraw JSON",
    "|||",
    "opt caller requests SVG / PNG export",
    "idx -> svg          : result.toSvg(opts)",
    "svg --> idx         : SVG",
    "idx -> png          : result.toPng(opts)",
    "png --> idx         : PNG buffer",
    "end",
    "idx    --> Caller --: Excalidraw JSON | SVG | PNG",
    "@enduml",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// 3. Plugin detail diagram
// ---------------------------------------------------------------------------

export async function buildPluginDetailDiagramSource() {
  const { defaultDiagramModuleRegistry } = await import("../../src/main/builtin.mjs");

  const lines = ["@startuml", `title "excaliplant — parser plugins"`];
  const expected = [];
  const expectedModules = [];

  lines.push(`package "engine" as engine {`);
  lines.push(`  [runEngine] as runEngine`);
  lines.push(`}`);

  for (const module of defaultDiagramModuleRegistry.list()) {
    expectedModules.push(module.kind);
    const moduleId = slug(`${module.kind}_plugins`);
    lines.push(`package "${module.kind} plugins" as ${moduleId} {`);
    for (const plugin of module.parserPlugins()) {
      // Use plugin.name directly if it already contains a dot (module prefix), otherwise add module prefix
      const qualifiedName = plugin.name.includes(".")
        ? plugin.name
        : `${module.kind}.${plugin.name}`;
      const displayName = plugin.name.includes(".") ? plugin.name.split(".").pop() : plugin.name;
      const id = slug(qualifiedName);
      expected.push(qualifiedName);
      lines.push(`  [${displayName}] as ${id}`);
      lines.push(`  runEngine --> ${id}`);
    }
    lines.push(`}`);
  }
  lines.push("@enduml");

  return { puml: lines.join("\n"), expectedPlugins: expected, expectedModules };
}

// ---------------------------------------------------------------------------
// 4. Dynamic model class diagram
// ---------------------------------------------------------------------------

export async function buildModelClassDiagramSource() {
  const modelPath = path.join(SRC, "general", "model", "diagram.mjs");
  const source = await readFile(modelPath, "utf8");
  const classes = extractModelClasses(source);
  const lines = ["@startuml", `title "excaliplant — model classes"`];
  lines.push("skinparam classAttributeIconSize 0");
  for (const cls of classes) {
    lines.push(`class ${cls.name} {`);
    for (const prop of cls.properties) lines.push(`  +${prop}`);
    lines.push("}");
  }
  for (const cls of classes) {
    if (cls.extendsName) lines.push(`${cls.extendsName} <|-- ${cls.name}`);
  }
  const names = new Set(classes.map((cls) => cls.name));
  for (const cls of classes) {
    for (const prop of cls.properties) {
      const singular = prop.replace(/s$/, "");
      const target = [...names].find((name) => name.toLowerCase() === singular.toLowerCase());
      if (target && target !== cls.name) lines.push(`${cls.name} --> ${target} : ${prop}`);
    }
  }
  lines.push("@enduml");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function collectMjs(dir) {
  const out = [];
  const walk = async (d) => {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile() && p.endsWith(".mjs")) out.push(p);
    }
  };
  await walk(dir);
  return out;
}

function extractModelClasses(source) {
  const matches = [...source.matchAll(/export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?/g)];
  return matches.map((match, index) => {
    const bodyStart = match.index ?? 0;
    const bodyEnd = matches[index + 1]?.index ?? source.length;
    const body = source.slice(bodyStart, bodyEnd);
    const properties = [...new Set([...body.matchAll(/this\.(\w+)\s*=/g)].map((prop) => prop[1]))]
      .filter((prop) => !prop.startsWith("_"))
      .sort((a, b) => a.localeCompare(b));
    return { name: match[1], extendsName: match[2] || "", properties };
  });
}

function slug(s) {
  return String(s)
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
