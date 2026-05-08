/**
 * Deployment diagram parser contract.
 * @module diagrams/deployment/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";

/** @public */
export const DEFAULT_DEPLOYMENT_PLUGINS = DEFAULT_GRAPH_PLUGINS;

/** @public */
export const createDeploymentParseContext = createGraphParseContext;

/** @public */
export const prepareDeploymentLines = explodeBraces;

/** @public */
export class DeploymentDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_DEPLOYMENT_PLUGINS,
      createParseContext: createDeploymentParseContext,
      prepareLines: prepareDeploymentLines,
      detect: detectDeploymentDiagram,
    });
  }
}

/** @public */
export const deploymentDiagramParser = new DeploymentDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectDeploymentDiagram(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    // Deployment-specific keywords
    if (/^skinparam\s+(?:node|artifact|cloud|database|agent|storage)\b/i.test(line)) return true;
    if (/^(?:left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i.test(line)) return true;
    if (
      /^(?:node|artifact|cloud|database|agent|storage|card|file|folder|frame|hexagon|package|queue|stack|person|actor|component|boundary|control|entity|collections|interface|label|circle|rectangle)\b/i.test(
        line,
      )
    ) {
      return true;
    }
    if (/^allowmixing\b/i.test(line)) return true;
    if (/^\[[^\]]+\]/.test(line) || /^\([^)]*\)/.test(line)) return true;
  }
  return false;
}
