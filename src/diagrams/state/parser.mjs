/**
 * State diagram parser contract.
 * @module diagrams/state/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import {
  stateDeclarationPlugin,
  pseudostateDeclarationPlugin,
  compositeStatePlugin,
  stateDescriptionPlugin,
  concurrentRegionPlugin,
} from "./plugins/syntax.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);

/** @public */
export const DEFAULT_STATE_PLUGINS = Object.freeze([
  ...graphPluginsBeforeConnections,
  stateDeclarationPlugin,
  pseudostateDeclarationPlugin,
  compositeStatePlugin,
  stateDescriptionPlugin,
  concurrentRegionPlugin,
  connectionPlugin,
]);

/** @public */
export const createStateParseContext = createGraphParseContext;

/**
 * @param {string[]} lines Raw PlantUML lines.
 * @returns {string[]} Lines prepared for state-diagram parsing.
 * @public
 */
export function prepareStateLines(lines) {
  return explodeBraces(lines).filter((line) => !/^@(start|end)state\b/i.test(line.trim()));
}

/** @public */
export class StateDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_STATE_PLUGINS,
      createParseContext: createStateParseContext,
      prepareLines: prepareStateLines,
      detect: detectStateDiagram,
    });
  }
}

/** @public */
export const stateDiagramParser = new StateDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectStateDiagram(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^skinparam\s+state\b/i.test(line)) return true;
    if (/^\[\*\]\s*-->?\s*/.test(line)) return true;
    if (/^state\s+/.test(line)) return true;
    if (/^hide\s+empty\s+description\b/i.test(line)) return true;
  }
  return false;
}
