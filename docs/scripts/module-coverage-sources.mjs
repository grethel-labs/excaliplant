// Shared module coverage inventory for docs and tests.
//
// Each diagram module owns its source examples under
// src/diagrams/<kind>/docs/coverage_examples.mjs. This file only
// normalises the different historical example shapes and adds dynamic
// repository-derived examples where that fits the diagram type.

import { readdir } from "node:fs/promises";
import path from "node:path";

import { archimateCoverageExamples } from "../../src/diagrams/archimate/docs/coverage_examples.mjs";
import { chartCoverageExamples } from "../../src/diagrams/chart/docs/coverage_examples.mjs";
import { chenCoverageExamples } from "../../src/diagrams/chen/docs/coverage_examples.mjs";
import { chronologyCoverageExamples } from "../../src/diagrams/chronology/docs/coverage_examples.mjs";
import { CLASS_COMPONENT_EXAMPLES } from "../../src/diagrams/class/docs/coverage_examples.mjs";
import { COMPONENT_COMPONENT_EXAMPLES } from "../../src/diagrams/component/docs/coverage_examples.mjs";
import { DEPLOYMENT_COMPONENT_EXAMPLES } from "../../src/diagrams/deployment/docs/coverage_examples.mjs";
import { ditaaCoverageExamples } from "../../src/diagrams/ditaa/docs/coverage_examples.mjs";
import { ebnfCoverageExamples } from "../../src/diagrams/ebnf/docs/coverage_examples.mjs";
import { filesCoverageExamples } from "../../src/diagrams/files/docs/coverage_examples.mjs";
import { ganttCoverageExamples } from "../../src/diagrams/gantt/docs/coverage_examples.mjs";
import { ieCoverageExamples } from "../../src/diagrams/ie/docs/coverage_examples.mjs";
import { jsonCoverageExamples } from "../../src/diagrams/json/docs/coverage_examples.mjs";
import { mathCoverageExamples } from "../../src/diagrams/math/docs/coverage_examples.mjs";
import { mindmapCoverageExamples } from "../../src/diagrams/mindmap/docs/coverage_examples.mjs";
import { nwdiagCoverageExamples } from "../../src/diagrams/nwdiag/docs/coverage_examples.mjs";
import { OBJECT_COMPONENT_EXAMPLES } from "../../src/diagrams/object/docs/coverage_examples.mjs";
import { regexCoverageExamples } from "../../src/diagrams/regex/docs/coverage_examples.mjs";
import { saltCoverageExamples } from "../../src/diagrams/salt/docs/coverage_examples.mjs";
import { SEQUENCE_COMPONENT_EXAMPLES } from "../../src/diagrams/sequence/docs/coverage_examples.mjs";
import { STATE_COVERAGE_EXAMPLES } from "../../src/diagrams/state/docs/coverage_examples.mjs";
import { TIMING_COMPONENT_EXAMPLES } from "../../src/diagrams/timing/docs/coverage_examples.mjs";
import { wbsCoverageExamples } from "../../src/diagrams/wbs/docs/coverage_examples.mjs";
import { yamlCoverageExamples } from "../../src/diagrams/yaml/docs/coverage_examples.mjs";
import { REPO_ROOT } from "./config.mjs";

const STATIC_COVERAGE_SUITES = Object.freeze([
  suite("sequence", "Sequence", SEQUENCE_COMPONENT_EXAMPLES),
  suite("class", "Class", CLASS_COMPONENT_EXAMPLES),
  suite("component", "Component", COMPONENT_COMPONENT_EXAMPLES),
  suite("deployment", "Deployment", DEPLOYMENT_COMPONENT_EXAMPLES),
  suite("object", "Object", OBJECT_COMPONENT_EXAMPLES),
  suite("state", "State", STATE_COVERAGE_EXAMPLES),
  suite("timing", "Timing", TIMING_COMPONENT_EXAMPLES),
  suite("archimate", "Archimate", archimateCoverageExamples),
  suite("chart", "Chart", chartCoverageExamples),
  suite("chen", "Chen ER", chenCoverageExamples),
  suite("chronology", "Chronology", chronologyCoverageExamples),
  suite("ditaa", "Ditaa", ditaaCoverageExamples),
  suite("ebnf", "EBNF", ebnfCoverageExamples),
  suite("files", "Files", filesCoverageExamples),
  suite("gantt", "Gantt", ganttCoverageExamples),
  suite("ie", "Information Engineering ER", ieCoverageExamples),
  suite("json", "JSON", jsonCoverageExamples),
  suite("math", "Math", mathCoverageExamples),
  suite("mindmap", "Mindmap", mindmapCoverageExamples),
  suite("nwdiag", "Nwdiag", nwdiagCoverageExamples),
  suite("regex", "Regex", regexCoverageExamples),
  suite("salt", "Salt", saltCoverageExamples),
  suite("wbs", "WBS", wbsCoverageExamples),
  suite("yaml", "YAML", yamlCoverageExamples),
]);

/**
 * Return all module coverage suites in their normalised shape.
 * @param {{includeDynamic?: boolean}} [options]
 * @returns {Promise<Array<{kind:string,title:string,examples:Array<{id:string,title:string,description:string,source:string,dynamic:boolean}>}>>}
 */
export async function getModuleCoverageSuites({ includeDynamic = true } = {}) {
  const suites = STATIC_COVERAGE_SUITES.map((entry) => ({
    kind: entry.kind,
    title: entry.title,
    examples: entry.examples.map((example, index) => normaliseExample(example, index)),
  }));

  if (includeDynamic) {
    const filesSuite = suites.find((entry) => entry.kind === "files");
    if (filesSuite) filesSuite.examples.push(await buildRepoFilesCoverageExample());
  }

  return suites;
}

/**
 * @param {string} kind
 * @param {string} title
 * @param {Array<Record<string, unknown>>} examples
 */
function suite(kind, title, examples) {
  return { kind, title, examples };
}

/**
 * @param {Record<string, unknown>} example
 * @param {number} index
 * @returns {{id:string,title:string,description:string,source:string,dynamic:boolean}}
 */
function normaliseExample(example, index) {
  const rawId = String(example.id ?? example.name ?? `example-${index + 1}`);
  const id = slugId(rawId);
  return {
    id,
    title: String(example.title ?? titleFromId(id)),
    description: String(
      example.description ?? "Coverage example rendered through the docs pipeline.",
    ),
    source: String(example.source ?? ""),
    dynamic: Boolean(example.dynamic),
  };
}

/**
 * Build a Files diagram from the current repository layout. The explicit
 * include list keeps the example stable while still tracking real source
 * files as modules and tests are added.
 * @returns {Promise<{id:string,title:string,description:string,source:string,dynamic:boolean}>}
 */
async function buildRepoFilesCoverageExample() {
  const candidates = await collectRepoFiles(["src/diagrams", "docs/scripts", "docs", "tests"]);
  const selected = candidates
    .filter((file) =>
      /(?:coverage_examples|_components\.test|module_coverage\.test|build-(?:docs|module-coverage)|README\.template|AGENTS\.md|index\.mjs)/.test(
        file,
      ),
    )
    .filter((file) => !file.startsWith("docs/ressources/"))
    .slice(0, 80);

  const source = ["@startfiles", ...selected.map((file) => `/${file}`), "@endfiles"].join("\n");
  return {
    id: "repo-derived-coverage-tree",
    title: "Repo-derived coverage tree",
    description:
      "Generated from this checkout to keep the documentation example tied to real module, docs and test files.",
    source,
    dynamic: true,
  };
}

/**
 * @param {string[]} roots
 * @returns {Promise<string[]>}
 */
async function collectRepoFiles(roots) {
  /** @type {string[]} */
  const files = [];
  for (const root of roots) {
    await collect(path.join(REPO_ROOT, root), files);
  }
  return files
    .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join("/"))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} dir
 * @param {string[]} files
 * @returns {Promise<void>}
 */
async function collect(dir, files) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
}

/** @param {string} name */
function shouldSkip(name) {
  return name === "node_modules" || name === ".git" || name === "output";
}

/** @param {string} raw */
function slugId(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** @param {string} id */
function titleFromId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
