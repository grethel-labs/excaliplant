/**
 * Deployment diagram parser contract.
 * @module diagrams/deployment/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import { componentJsonPlugin } from "../component/plugins/syntax.mjs";
import { deploymentLongDescriptionPlugin } from "./plugins/syntax.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);
const graphPluginsWithoutShape = graphPluginsBeforeConnections.filter(
  (plugin) => plugin.name !== "component.shapeKeyword",
);
const graphShapePlugins = graphPluginsBeforeConnections.filter(
  (plugin) => plugin.name === "component.shapeKeyword",
);

/** @public */
export const DEFAULT_DEPLOYMENT_PLUGINS = Object.freeze([
  deploymentLongDescriptionPlugin,
  componentJsonPlugin,
  ...graphPluginsWithoutShape,
  ...graphShapePlugins,
  connectionPlugin,
]);

/** @public */
export function createDeploymentParseContext() {
  const ctx = createGraphParseContext();
  ctx.diagram.kind = "deployment";
  ctx.setAutoVivifyConnections(true, "node");
  return ctx;
}

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
  let hasUseCaseSpecific = false;
  let hasObjectSpecific = false;
  let hasActivitySpecific = false;
  let hasDeploymentSpecific = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^(?:archimate|Junction_(?:And|Or))\b/i.test(line)) return false;
    if (/^state\s+/i.test(line) || /^\[\*\]\s*[-.]+>?/.test(line)) return false;
    if (/^(?:object|map|diamond)\b/i.test(line)) return false;
    if (
      /^:([^:]+):\/?(?:\s|$)/.test(line) ||
      /^actor\//i.test(line) ||
      /^usecase\/?\b/i.test(line) ||
      /^"[^"]+"\s+as\s+\([^)]+\)/.test(line) ||
      /^\([^)]+\)\/?(?:\s+as\s+\([^)]+\))?/.test(line)
    ) {
      hasUseCaseSpecific = true;
    }
    if (
      /^skinparam\s+(?:node|artifact|cloud|database|agent|storage)\b/i.test(line) ||
      /^(?:node|artifact|cloud|database|agent|storage|card|file|folder|frame|hexagon|queue|stack|person|component|boundary|control|entity|collections|interface|label|circle|process|action|json)\b/i.test(
        line,
      ) ||
      /^\[[^\]]+\]/.test(line)
    ) {
      hasDeploymentSpecific = true;
    }
    if (/^(?:object|map|diamond|json)\b/i.test(line)) hasObjectSpecific = true;
    if (
      /^(?:start|stop|end|kill|detach)$/i.test(line) ||
      /^(?:fork|split|repeat|while|if|switch|label|goto)\b/i.test(line) ||
      /^:.*;\s*(?:<<[^>]+>>)?$/i.test(line) ||
      /^\|(?:#[^|]+)?[^|]+\|$/.test(line) ||
      /^\(\*\)\s*--?>/.test(line) ||
      /^--?>/.test(line)
    ) {
      hasActivitySpecific = true;
    }
  }
  if (hasActivitySpecific) return false;
  if (hasUseCaseSpecific && !hasDeploymentSpecific) return false;
  if (hasObjectSpecific && !hasDeploymentSpecific) return false;

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    // Deployment-specific keywords
    if (/^skinparam\s+(?:node|artifact|cloud|database|agent|storage)\b/i.test(line)) return true;
    if (/^(?:left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i.test(line)) return true;
    if (
      /^(?:node|artifact|cloud|database|agent|storage|card|file|folder|frame|hexagon|package|queue|stack|person|actor|component|boundary|control|entity|collections|interface|label|circle|rectangle|process|action|json)\b/i.test(
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
