/**
 * Regex diagram parser contract.
 * @module diagrams/regex/parser
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
export const regexSyntaxPlugin = {
  name: "regex.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    return collectRailroadLine(ctx, line);
  },
  /** @param {Record<string, any>} ctx */
  finish(ctx) {
    return finalizeRailroadDiagram(ctx, "regex");
  },
};

/** @public */
export const DEFAULT_REGEX_PLUGINS = [regexSyntaxPlugin];

/** @public @param {string} text */
export function detectRegexDiagram(text) {
  return detectRailroadDiagram(text, "@startregex", "@endregex");
}

/** @public @param {string[]} lines */
export function prepareRegexLines(lines) {
  return prepareRailroadLines(lines, "@startregex", "@endregex");
}

/** @public */
export function createRegexParseContext() {
  return createRailroadParseContext("regex");
}

/** @public */
export class RegexDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_REGEX_PLUGINS,
      createParseContext: createRegexParseContext,
      prepareLines: prepareRegexLines,
      detect: detectRegexDiagram,
    });
  }
}

/** @public */
export const regexDiagramParser = new RegexDiagramParser();
