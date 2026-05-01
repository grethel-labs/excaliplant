#!/usr/bin/env node
//
// Build-time documentation pipeline.
//
// Steps:
//   1. Generate PlantUML sources for the project itself
//      (modules / call flow / plugin detail).
//   2. Run them through excaliplant → .excalidraw + .svg.
//   3. Substitute README placeholders so README always matches the
//      current code: version banner, image refs, JSDoc snippets.
//
// Idempotent: re-running this script with no source changes produces
// the same byte-identical artefacts (apart from random Excalidraw
// element IDs / seeds — those would need a deterministic-id mode in
// the renderer to be byte-stable; not worth blocking the pipeline).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderPlantUml } from "../index.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import {
  buildModuleDiagramSource,
  buildSequenceDiagramSource,
  buildPluginDetailDiagramSource,
} from "./self_diagrams.mjs";
import { extractDocBlocks } from "./extract_docs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DOCS = path.join(ROOT, "docs");

const README = path.join(ROOT, "README.md");
const PKG_JSON = path.join(ROOT, "package.json");

async function main() {
  await mkdir(DOCS, { recursive: true });

  const pkg = JSON.parse(await readFile(PKG_JSON, "utf8"));

  const artefacts = [
    { id: "modules",  title: "Module structure",     getSource: buildModuleDiagramSource },
    { id: "sequence", title: "renderPlantUml flow",  getSource: () => Promise.resolve(buildSequenceDiagramSource()) },
    { id: "plugins",  title: "Parser plugins",       getSource: async () => (await buildPluginDetailDiagramSource()).puml },
  ];

  const generated = [];
  for (const art of artefacts) {
    const puml = await art.getSource();
    const pumlPath = path.join(DOCS, `${art.id}.puml`);
    await writeFile(pumlPath, puml);

    const doc = await renderPlantUml(puml, { sourceLabel: `excaliplant.self.${art.id}` });
    const excaliPath = path.join(DOCS, `${art.id}.excalidraw`);
    await writeFile(excaliPath, JSON.stringify(doc, null, 2));

    const svg = excalidrawToSvg(doc);
    const svgPath = path.join(DOCS, `${art.id}.svg`);
    await writeFile(svgPath, svg);

    generated.push({ ...art, svgRel: path.relative(ROOT, svgPath), pumlRel: path.relative(ROOT, pumlPath) });
    console.log(`  wrote ${path.relative(ROOT, pumlPath)} → ${path.relative(ROOT, svgPath)}`);
  }

  const docBlocks = await extractDocBlocks([path.join(ROOT, "src"), path.join(ROOT, "index.mjs")]);

  const readme = await readFile(README, "utf8");
  const updated = applyTemplate(readme, { pkg, generated, docBlocks });
  await writeFile(README, updated);
  console.log(`  updated README (version=${pkg.version}, ${generated.length} diagrams, ${Object.keys(docBlocks).length} doc blocks)`);
}

// ---------------------------------------------------------------------------
// README templating.
//
// We replace anything between matching <!-- BEGIN:KEY --> / <!-- END:KEY -->
// markers. If a marker pair is missing we leave the README alone, so the
// pipeline never destroys hand-written sections by accident.
// ---------------------------------------------------------------------------

function applyTemplate(readme, { pkg, generated, docBlocks }) {
  let out = readme;

  out = replaceBlock(out, "version", `**Version:** \`${pkg.version}\``);

  // Each diagram gets a section: heading + image + (if available) doc snippet.
  const diagramSection = generated.map((g) => {
    const docKey = `diagram:${g.id}`;
    const snippet = docBlocks[docKey] ?? "";
    return [
      `### ${g.title}`,
      ``,
      `![${g.title}](./${g.svgRel})`,
      ``,
      snippet ? snippet.trim() : `_PlantUML source: [\`${g.pumlRel}\`](./${g.pumlRel})_`,
      ``,
    ].join("\n");
  }).join("\n");

  out = replaceBlock(out, "diagrams", diagramSection);

  // Per-module doc snippets.
  const moduleSnippets = Object.entries(docBlocks)
    .filter(([k]) => !k.startsWith("diagram:"))
    .map(([k, v]) => `#### ${k}\n\n${v.trim()}\n`)
    .join("\n");
  out = replaceBlock(out, "module-docs", moduleSnippets || "_No module docs extracted._");

  return out;
}

function replaceBlock(text, key, content) {
  const begin = `<!-- BEGIN:${key} -->`;
  const end = `<!-- END:${key} -->`;
  const idx0 = text.indexOf(begin);
  const idx1 = text.indexOf(end);
  if (idx0 < 0 || idx1 < 0 || idx1 < idx0) return text;
  return text.slice(0, idx0 + begin.length)
    + "\n" + content + "\n"
    + text.slice(idx1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
