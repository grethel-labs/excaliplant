#!/usr/bin/env node
// Build the generic diagram-module coverage gallery and its SVG resources.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import prettier from "prettier";
import nunjucks from "nunjucks";

import { renderPlantUml } from "../../index.mjs";
import { REPO_ROOT, repoRel } from "./config.mjs";
import { getModuleCoverageSuites } from "./module-coverage-sources.mjs";

const MODULE_COVERAGE_DOC = path.join(REPO_ROOT, "docs", "module-coverage.md");
const MODULE_COVERAGE_TEMPLATE = path.join(REPO_ROOT, "docs", "module-coverage.template.md.njk");
const MODULE_COVERAGE_RESOURCE_DIR = path.join(REPO_ROOT, "docs", "ressources", "module-coverage");

/**
 * Render all module coverage examples and write the Markdown coverage gallery.
 * @returns {Promise<string[]>} Repository-relative files written by this step.
 */
export async function buildModuleCoverageDocs() {
  await mkdir(MODULE_COVERAGE_RESOURCE_DIR, { recursive: true });

  /** @type {Array<{kind:string,title:string,examples:Array<Record<string, unknown>>}>} */
  const renderedSuites = [];
  /** @type {string[]} */
  const written = [];
  const suites = await getModuleCoverageSuites();

  for (const suite of suites) {
    const pumlDir = path.join(MODULE_COVERAGE_RESOURCE_DIR, suite.kind, "puml");
    const svgDir = path.join(MODULE_COVERAGE_RESOURCE_DIR, suite.kind, "svg");
    await Promise.all([mkdir(pumlDir, { recursive: true }), mkdir(svgDir, { recursive: true })]);

    /** @type {Array<Record<string, unknown>>} */
    const renderedExamples = [];
    for (const example of suite.examples) {
      const pumlPath = path.join(pumlDir, `${example.id}.puml`);
      const svgPath = path.join(svgDir, `${example.id}.svg`);
      const result = renderPlantUml(example.source, {
        sourceLabel: `module-coverage.${suite.kind}.${example.id}`,
      });
      const svg = await result.toSvg({ canvas: false });
      await writeFile(pumlPath, example.source, "utf8");
      await writeFile(svgPath, svg, "utf8");
      written.push(repoRel(pumlPath), repoRel(svgPath));
      renderedExamples.push({
        ...example,
        puml: repoRel(pumlPath),
        svg: repoRel(svgPath),
      });
      console.log(`  built module coverage ${suite.kind}/${example.id}: puml + svg`);
    }

    renderedSuites.push({ ...suite, examples: renderedExamples });
  }

  const markdown = await renderMarkdown(renderedSuites);
  await writeFile(MODULE_COVERAGE_DOC, markdown, "utf8");
  written.push(repoRel(MODULE_COVERAGE_DOC));
  const count = renderedSuites.reduce((sum, suite) => sum + suite.examples.length, 0);
  console.log(
    `  wrote docs/module-coverage.md (${renderedSuites.length} suites, ${count} examples)`,
  );
  return written;
}

/**
 * @param {Array<{kind:string,title:string,examples:Array<Record<string, unknown>>}>} suites
 * @returns {Promise<string>}
 */
async function renderMarkdown(suites) {
  const docsDir = path.join(REPO_ROOT, "docs");
  const suitesWithRelPaths = suites.map((suite) => ({
    ...suite,
    examples: suite.examples.map((example) => ({
      ...example,
      pumlRel: path.relative(docsDir, String(example.puml)).replace(/\\/g, "/"),
      svgRel: path.relative(docsDir, String(example.svg)).replace(/\\/g, "/"),
    })),
  }));

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    trimBlocks: false,
    lstripBlocks: false,
  });
  env.addFilter("trim", (value) => String(value).trim());

  const tpl = await readFile(MODULE_COVERAGE_TEMPLATE, "utf8");
  const raw = env.renderString(tpl, {
    suites: suitesWithRelPaths,
    exampleCount: suitesWithRelPaths.reduce((sum, suite) => sum + suite.examples.length, 0),
  });

  const prettierConfig = (await prettier.resolveConfig(MODULE_COVERAGE_DOC)) ?? {};
  return prettier.format(raw, { ...prettierConfig, filepath: MODULE_COVERAGE_DOC });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildModuleCoverageDocs().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
