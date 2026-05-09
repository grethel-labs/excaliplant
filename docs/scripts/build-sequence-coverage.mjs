#!/usr/bin/env node
// Build the sequence-diagram feature coverage page and its SVG resources.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";
import nunjucks from "nunjucks";

import { renderPlantUml } from "../../index.mjs";
import { REPO_ROOT, repoRel } from "./config.mjs";
import {
  SEQUENCE_COMPONENT_EXAMPLES,
  SEQUENCE_SUPPORT_MATRIX,
} from "../../src/diagrams/sequence/docs/coverage_examples.mjs";

const SEQUENCE_DOC = path.join(REPO_ROOT, "docs", "sequence-components.md");
const SEQUENCE_TEMPLATE = path.join(REPO_ROOT, "docs", "sequence-components.template.md.njk");
const SEQUENCE_RESOURCE_DIR = path.join(REPO_ROOT, "docs", "ressources", "sequence");
const SEQUENCE_PUML_DIR = path.join(SEQUENCE_RESOURCE_DIR, "puml");
const SEQUENCE_SVG_DIR = path.join(SEQUENCE_RESOURCE_DIR, "svg");

/**
 * Render all sequence coverage examples and write the Markdown coverage page.
 * @returns {Promise<string[]>} Repository-relative files written by this step.
 */
export async function buildSequenceCoverageDocs() {
  await Promise.all([
    mkdir(SEQUENCE_RESOURCE_DIR, { recursive: true }),
    mkdir(SEQUENCE_PUML_DIR, { recursive: true }),
    mkdir(SEQUENCE_SVG_DIR, { recursive: true }),
  ]);

  /** @type {Array<{id:string,title:string,description:string,source:string,puml:string,svg:string}>} */
  const renderedExamples = [];
  /** @type {string[]} */
  const written = [];

  for (const example of SEQUENCE_COMPONENT_EXAMPLES) {
    const pumlPath = path.join(SEQUENCE_PUML_DIR, `${example.id}.puml`);
    const svgPath = path.join(SEQUENCE_SVG_DIR, `${example.id}.svg`);
    const result = renderPlantUml(example.source, { sourceLabel: `sequence.${example.id}` });
    const svg = await result.toSvg({ canvas: false });
    await writeFile(pumlPath, example.source, "utf8");
    await writeFile(svgPath, svg, "utf8");
    written.push(repoRel(pumlPath), repoRel(svgPath));
    renderedExamples.push({
      ...example,
      puml: repoRel(pumlPath),
      svg: repoRel(svgPath),
    });
    console.log(`  built sequence coverage ${example.id}: puml + svg`);
  }

  const markdown = await renderMarkdown(renderedExamples);
  await writeFile(SEQUENCE_DOC, markdown, "utf8");
  written.push(repoRel(SEQUENCE_DOC));
  console.log(`  wrote docs/sequence-components.md (${renderedExamples.length} examples)`);
  return written;
}

/**
 * @param {Array<{id:string,title:string,description:string,source:string,puml:string,svg:string}>} examples
 * @returns {Promise<string>}
 */
async function renderMarkdown(examples) {
  // Calculate relative paths from the docs folder
  const docsDir = path.join(REPO_ROOT, "docs");
  const examplesWithRelPaths = examples.map((ex) => ({
    ...ex,
    pumlRel: path.relative(docsDir, ex.puml).replace(/\\/g, "/"),
    svgRel: path.relative(docsDir, ex.svg).replace(/\\/g, "/"),
  }));

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    trimBlocks: false,
    lstripBlocks: false,
  });

  // Add custom filters
  env.addFilter("escapeCell", (value) => String(value).replace(/\|/g, "\\|"));
  env.addFilter("urlencode", (value) => value.replace(/ /g, "%20"));
  env.addFilter("trim", (value) => String(value).trim());

  const tpl = await readFile(SEQUENCE_TEMPLATE, "utf8");
  const raw = env.renderString(tpl, {
    matrix: SEQUENCE_SUPPORT_MATRIX,
    examples: examplesWithRelPaths,
  });

  const prettierConfig = (await prettier.resolveConfig(SEQUENCE_DOC)) ?? {};
  return prettier.format(raw, { ...prettierConfig, filepath: SEQUENCE_DOC });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildSequenceCoverageDocs().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
