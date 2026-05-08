/**
 * Component diagram parser contract.
 * @module diagrams/component/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";

/** @public */
export const DEFAULT_COMPONENT_PLUGINS = DEFAULT_GRAPH_PLUGINS;

/** @public */
export const createComponentParseContext = createGraphParseContext;

/** @public */
export const prepareComponentLines = explodeBraces;

/** @public */
export class ComponentDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_COMPONENT_PLUGINS,
      createParseContext: createComponentParseContext,
      prepareLines: prepareComponentLines,
      detect: detectComponentDiagram,
    });
  }
}

/** @public */
export const componentDiagramParser = new ComponentDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectComponentDiagram(text) {
  // First check if this is a deployment diagram (has deployment-specific keywords)
  const deploymentKeywords =
    /^(?:agent|storage|card|hexagon|stack|person|label|file|portin|portout)\b/i;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (deploymentKeywords.test(line)) return false;
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^skinparam\s+(?:component|package|node|frame|folder|database)\b/i.test(line)) return true;
    if (/^(?:left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i.test(line)) return true;
    if (
      /^(?:component|package|node|frame|folder|cloud|database|queue|artifact|actor|usecase|port)\b/i.test(
        line,
      )
    ) {
      return true;
    }
    if (/^\[[^\]]+\]/.test(line) || /^\([^)]*\)/.test(line)) return true;
  }
  return false;
}
