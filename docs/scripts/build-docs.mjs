#!/usr/bin/env node
//
// Build-time documentation pipeline.
//
// For each self-introspection diagram:
//   1. generate the PlantUML source        → docs/ressources/generated/puml/<id>.puml
//   2. parse + layout + export Excalidraw  → docs/ressources/generated/excalidraw/<id>.excalidraw
//   3. wrap the SVG in a 4:3 canvas        → docs/ressources/generated/svg/<id>.svg
//   4. rasterise to PNG                    → docs/ressources/generated/png/<id>.png
// Then render docs/README.template.md.njk → README.md.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import nunjucks from "nunjucks";

import { renderPlantUml, excalidrawJsonToCanvasSvg, svgToPng } from "../../index.mjs";
import { extractDocBlocks } from "./extract-docs.mjs";
import {
  buildModuleDiagramSource,
  buildSequenceDiagramSource,
  buildPluginDetailDiagramSource,
} from "./self-diagrams.mjs";
import { buildFileTree } from "./file-tree.mjs";
import {
  REPO_ROOT,
  SRC_DIR,
  ENTRY_FILE,
  PUML_DIR,
  EXCALIDRAW_DIR,
  SVG_DIR,
  PNG_DIR,
  TEMPLATE_FILE,
  README_FILE,
  README_IMAGE_FORMAT,
  CANVAS_WIDTH,
  PNG_SCALE,
  repoRel,
} from "./config.mjs";

const ARTEFACTS = [
  {
    id: "modules",
    title: "Module structure",
    getSource: buildModuleDiagramSource,
  },
  {
    id: "sequence",
    title: "renderPlantUml flow",
    getSource: buildSequenceDiagramSource,
  },
  {
    id: "plugins",
    title: "Parser plugins",
    getSource: async () => (await buildPluginDetailDiagramSource()).puml,
  },
];

async function main() {
  await Promise.all(
    [PUML_DIR, EXCALIDRAW_DIR, SVG_DIR, PNG_DIR].map((d) => mkdir(d, { recursive: true })),
  );

  const docBlocks = await extractDocBlocks([SRC_DIR, ENTRY_FILE]);

  const generated = [];
  for (const a of ARTEFACTS) {
    const puml = await a.getSource();
    const pumlPath = path.join(PUML_DIR, `${a.id}.puml`);
    const excPath = path.join(EXCALIDRAW_DIR, `${a.id}.excalidraw`);
    const svgPath = path.join(SVG_DIR, `${a.id}.svg`);
    const pngPath = path.join(PNG_DIR, `${a.id}.png`);

    await writeFile(pumlPath, puml, "utf8");

    const doc = await renderPlantUml(puml, { sourceLabel: a.id });
    await writeFile(excPath, JSON.stringify(doc, null, 2), "utf8");

    const svg = excalidrawJsonToCanvasSvg(doc, { width: CANVAS_WIDTH });
    await writeFile(svgPath, svg, "utf8");

    const png = await svgToPng(svg, { width: CANVAS_WIDTH * PNG_SCALE });
    await writeFile(pngPath, png);

    generated.push({
      id: a.id,
      title: a.title,
      doc: docBlocks[`diagram:${a.id}`] ?? "",
      puml: repoRel(pumlPath),
      svg: repoRel(svgPath),
      png: repoRel(pngPath),
      image: repoRel(README_IMAGE_FORMAT === "png" ? pngPath : svgPath),
    });

    console.log(`  built ${a.id}: puml + excalidraw + svg + png`);
  }

  // moduleDocs = every doc-block that is NOT a diagram block.
  const moduleDocs = Object.entries(docBlocks)
    .filter(([k]) => !k.startsWith("diagram:"))
    .map(([name, body]) => ({ name, body }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const pkg = JSON.parse(await readFile(path.join(REPO_ROOT, "package.json"), "utf8"));
  const testCount = await countTests();
  const fileTree = buildFileTree();

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    trimBlocks: false,
    lstripBlocks: false,
  });
  const tpl = await readFile(TEMPLATE_FILE, "utf8");
  const rendered = env.renderString(tpl, {
    pkg,
    diagrams: generated,
    moduleDocs,
    imagesFormat: README_IMAGE_FORMAT,
    testCount,
    fileTree,
  });

  await writeFile(README_FILE, rendered, "utf8");
  console.log(
    `  wrote README.md (${generated.length} diagrams, ${moduleDocs.length} module blocks, ${testCount} tests)`,
  );

  // Write a build manifest so CI can distinguish a legitimate local
  // `npm run build:docs` (manifest hashes match the files on disk)
  // from a manual edit to a generated file (hashes diverge). The CI
  // guard reads this manifest instead of refusing every change.
  await writeBuildManifest(generated);
}

/**
 * Hash a file with SHA-256 and return the lowercase hex digest.
 * @param {string} absPath Absolute path to read.
 * @returns {Promise<string>} Hex digest.
 */
async function sha256(absPath) {
  const buf = await readFile(absPath);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Persist the list of generated files together with their content
 * hashes. The CI guard verifies these hashes against the working tree
 * to detect manual edits to README.md / generated artefacts.
 * @param {Array<{svg:string,png:string,puml:string}>} generated
 *        Records returned by the build loop (paths are repo-relative).
 * @returns {Promise<void>}
 */
async function writeBuildManifest(generated) {
  /** @type {Record<string, string>} */
  const files = {};
  // Hash only the artefacts that are actually committed to the repo:
  // README.md and the SVG / PNG outputs embedded in it. The .puml and
  // .excalidraw sources are gitignored (regenerated on every build),
  // so including them in the manifest would break the CI guard on a
  // fresh checkout.
  files["README.md"] = await sha256(README_FILE);
  for (const a of generated) {
    for (const rel of [a.svg, a.png]) {
      files[rel] = await sha256(path.join(REPO_ROOT, rel));
    }
  }
  const manifestPath = path.join(REPO_ROOT, "docs", ".build-manifest.json");
  await writeFile(manifestPath, JSON.stringify({ version: 1, files }, null, 2) + "\n", "utf8");
  console.log(`  wrote docs/.build-manifest.json (${Object.keys(files).length} entries)`);
}

async function countTests() {
  // Count `test("...")` and `it("...")` calls anywhere in the test
  // files, not just at column 0 — tests inside `describe` blocks are
  // indented so the previous `^test\(` pattern under-counted.
  const { readdir } = await import("node:fs/promises");
  const dir = path.join(REPO_ROOT, "tests");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".test.mjs"));
  let n = 0;
  for (const f of files) {
    const text = await readFile(path.join(dir, f), "utf8");
    n += (text.match(/(?:^|[\s.;{])(?:test|it)\s*\(/gm) || []).length;
  }
  return n;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
