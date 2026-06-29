/**
 * EBNF diagram parser contract.
 * @module diagrams/ebnf/parser
 */

import { BaseModuleParser } from "../base/parser.mjs";
import {
  collectRailroadLine,
  createRailroadParseContext,
  detectRailroadDiagram,
  finalizeRailroadDiagram,
  prepareRailroadLines,
} from "../shared/railroad_runtime.mjs";

/** @public */
export const ebnfSyntaxPlugin = {
  name: "ebnf.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    return collectRailroadLine(ctx, line);
  },
  /** @param {Record<string, any>} ctx */
  finish(ctx) {
    return finalizeRailroadDiagram(ctx, "ebnf");
  },
};

/** @public */
export const DEFAULT_EBNF_PLUGINS = [ebnfSyntaxPlugin];

/** @public @param {string} text */
export function detectEbnfDiagram(text) {
  return detectRailroadDiagram(text, "@startebnf", "@endebnf");
}

/** @public @param {string[]} lines */
export function prepareEbnfLines(lines) {
  return prepareRailroadLines(lines, "@startebnf", "@endebnf");
}

/** @public */
export function createEbnfParseContext() {
  return createRailroadParseContext("ebnf");
}

/** @public */
export class EbnfDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_EBNF_PLUGINS,
      createParseContext: createEbnfParseContext,
      prepareLines: prepareEbnfLines,
      detect: detectEbnfDiagram,
    });
  }
}

/** @public */
export const ebnfDiagramParser = new EbnfDiagramParser();
