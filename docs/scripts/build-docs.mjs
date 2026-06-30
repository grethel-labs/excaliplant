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
import prettier from "prettier";

import { renderPlantUml, excalidrawJsonToCanvasSvg, svgToPng } from "../../index.mjs";
import { extractDocBlocks } from "./extract-docs.mjs";
import { buildApiModel } from "./extract-api.mjs";
import { buildSequenceCoverageDocs } from "./build-sequence-coverage.mjs";
import { buildModuleCoverageDocs } from "./build-module-coverage.mjs";
import {
  buildModuleDiagramSource,
  buildSequenceDiagramSource,
  buildPluginDetailDiagramSource,
  buildModelClassDiagramSource,
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
  API_TEMPLATE_FILE,
  API_OUTPUT_FILE,
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
  {
    id: "model",
    title: "Model classes",
    getSource: buildModelClassDiagramSource,
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

  // Render the single-page API reference (docs/API.md). This
  // replaces the previous TypeDoc HTML site under docs/api/ and
  // always runs alongside the README so they cannot drift apart.
  const apiModules = await buildApiModel([SRC_DIR, ENTRY_FILE], REPO_ROOT);
  const apiTpl = await readFile(API_TEMPLATE_FILE, "utf8");
  const apiRaw = env.renderString(apiTpl, { pkg, modules: apiModules });
  // Collapse 3+ consecutive blank lines to 2 and remove a leading blank line.
  // The API template uses {% if %}{% endif %} guards that leave stray blank
  // lines when the condition is false; this normalises the output without
  // requiring trimBlocks/lstripBlocks (which would interact badly with the
  // explicit {%- -%} dash-stripping already present in the template).
  const apiNormalised = apiRaw.replace(/\n{3,}/g, "\n\n").replace(/^\n/, "");
  // Format through Prettier so the on-disk file is already Prettier-compliant.
  // Without this step the build-manifest hash recorded here and the hash after
  // a subsequent `npm run format` would diverge, causing the manifest check to
  // fail even though no manual edits were made.
  const prettierConfig = (await prettier.resolveConfig(API_OUTPUT_FILE)) ?? {};
  const apiPreformatted = await prettier.format(apiNormalised, {
    ...prettierConfig,
    filepath: API_OUTPUT_FILE,
  });
  const apiRendered = await prettier.format(apiPreformatted, {
    ...prettierConfig,
    filepath: API_OUTPUT_FILE,
  });
  await writeFile(API_OUTPUT_FILE, apiRendered, "utf8");
  const apiSymbolCount = apiModules.reduce((n, m) => n + m.symbols.length, 0);
  console.log(
    `  wrote docs/API.md (${apiModules.length} modules, ${apiSymbolCount} exported symbols)`,
  );

  const coverageFiles = [
    ...(await buildSequenceCoverageDocs()),
    ...(await buildModuleCoverageDocs()),
  ];

  // Write a build manifest so CI can distinguish a legitimate local
  // `npm run build:docs` (manifest hashes match the files on disk)
  // from a manual edit to a generated file (hashes diverge). The CI
  // guard reads this manifest instead of refusing every change.
  await writeBuildManifest(generated, coverageFiles);
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
 * @param {string[]} [extraFiles] Additional generated docs/resources.
 * @returns {Promise<void>}
 */
async function writeBuildManifest(generated, extraFiles = []) {
  /** @type {Record<string, string>} */
  const files = {};
  // Hash only the artefacts that are actually committed to the repo:
  // README.md and the SVG / PNG outputs embedded in it. The .puml and
  // .excalidraw sources are gitignored (regenerated on every build),
  // so including them in the manifest would break the CI guard on a
  // fresh checkout.
  files["README.md"] = await sha256(README_FILE);
  files["docs/API.md"] = await sha256(API_OUTPUT_FILE);
  for (const a of generated) {
    for (const rel of [a.svg, a.png]) {
      files[rel] = await sha256(path.join(REPO_ROOT, rel));
    }
  }
  for (const rel of extraFiles) {
    files[rel] = await sha256(path.join(REPO_ROOT, rel));
  }
  const manifestPath = path.join(REPO_ROOT, "docs", ".build-manifest.json");
  await writeFile(manifestPath, JSON.stringify({ version: 1, files }, null, 2) + "\n", "utf8");
  console.log(`  wrote docs/.build-manifest.json (${Object.keys(files).length} entries)`);
}

async function countTests() {
  // Run node:test with TAP reporter and read the "# pass N" summary
  // line.  This gives the exact runtime count, which the previous
  // source-regex approach under-counted (loop-generated tests) and
  // over-counted (.test() method calls in assertions).
  const { spawnSync } = await import("node:child_process");
  const dir = path.join(REPO_ROOT, "tests");
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-reporter=tap", `${dir}/*.test.mjs`],
    { encoding: "utf8", shell: true },
  );
  const match = result.stdout.match(/^# pass (\d+)/m);
  if (!match) {
    throw new Error(`countTests: could not parse '# pass' from node:test output`);
  }
  return Number(match[1]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
