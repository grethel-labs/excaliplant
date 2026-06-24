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
  jsonDeclarationPlugin,
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
  jsonDeclarationPlugin,
  diamondDeclarationPlugin,
  objectFieldPlugin,
  connectionPlugin,
]);

/** @public */
export function createObjectParseContext() {
  const ctx = createGraphParseContext();
  ctx.diagram.kind = "object";
  ctx.setAutoVivifyConnections(true, "object");
  return ctx;
}

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
    if (/^state\s+/i.test(line) || /^\[\*\]\s*[-.]+>?/.test(line)) return false;
    if (/^\(\*\)\s*--?>/.test(line) || /^--?>/.test(line)) return false;
    if (/^skinparam\s+object\b/i.test(line)) return true;
    if (/^(?:object|map|diamond|json)\b/i.test(line)) return true;
    if (/\s(?:<\|--|<\|\.\.|--\|>|\.\.\|>|\*--|--\*|o--|--o|\.\.>|-->)\s/.test(line)) {
      return true;
    }
  }
  return false;
}
