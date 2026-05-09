/**
 * Object diagram parser contract.
 * @module diagrams/object/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import {
  diamondDeclarationPlugin,
  mapDeclarationPlugin,
  objectDeclarationPlugin,
  objectFieldPlugin,
} from "./plugins/syntax.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);

/** @public */
export const DEFAULT_OBJECT_PLUGINS = Object.freeze([
  ...graphPluginsBeforeConnections,
  objectDeclarationPlugin,
  mapDeclarationPlugin,
  diamondDeclarationPlugin,
  objectFieldPlugin,
  connectionPlugin,
]);

/** @public */
export const createObjectParseContext = createGraphParseContext;

/**
 * @param {string[]} lines Raw PlantUML lines.
 * @returns {string[]} Lines prepared for object-diagram parsing.
 * @public
 */
export function prepareObjectLines(lines) {
  return explodeBraces(lines).filter((line) => !/^@(start|end)object\b/i.test(line.trim()));
}

/** @public */
export class ObjectDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_OBJECT_PLUGINS,
      createParseContext: createObjectParseContext,
      prepareLines: prepareObjectLines,
      detect: detectObjectDiagram,
    });
  }
}

/** @public */
export const objectDiagramParser = new ObjectDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectObjectDiagram(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^skinparam\s+object\b/i.test(line)) return true;
    if (/^(?:object|map|diamond)\b/i.test(line)) return true;
  }
  return false;
}
