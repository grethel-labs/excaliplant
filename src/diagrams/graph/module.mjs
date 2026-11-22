/**
 * Factory for graph-based diagram modules.
 * @module diagrams/graph/module
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createGraphParser } from "./parse.mjs";
import { layoutGraph } from "./layout.mjs";
import { drawGraph } from "./draw.mjs";

/**
 * @typedef {object} GraphModuleSpec
 * @property {string} kind
 * @property {string} title
 * @property {string[]} [starts]
 * @property {[string, import("./parse.mjs").ElementKind][]} keywords
 * @property {(token: string) => { id: string, label: string, keyword: string } | null} [implicit]
 * @property {(lines: import("../../core/source.mjs").SourceLine[]) => number} [detect]
 * @property {import("../../syntax/reader.mjs").Rule<import("./parse.mjs").GraphContext>[]} [rules]
 * @property {(model: import("../../model/graph.mjs").GraphModel, ctx: import("./parse.mjs").GraphContext) => void} [finish]
 * @property {import("./layout.mjs").GraphLayoutOptions} [layout]
 */

/**
 * @param {GraphModuleSpec} spec
 */
export function graphModule(spec) {
  const parse = createGraphParser({
    kind: spec.kind,
    keywords: new Map(spec.keywords),
    implicit: spec.implicit,
    rules: spec.rules,
    finish: spec.finish,
  });
  return defineDiagram({
    kind: spec.kind,
    title: spec.title,
    starts: spec.starts ?? ["uml"],
    detect: spec.detect,
    parse,
    layout: (model, ctx) => layoutGraph(model, ctx.theme, spec.layout, ctx),
    draw: (model, canvas) => drawGraph(model, canvas),
  });
}
