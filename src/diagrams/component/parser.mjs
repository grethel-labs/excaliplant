/**
 * Component diagram parser contract.
 * @module diagrams/component/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import { componentBracketDeclarationPlugin, componentJsonPlugin } from "./plugins/syntax.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);
const graphPluginsBeforeComponentShapes = graphPluginsBeforeConnections.filter(
  (plugin) => plugin.name !== "component.shapeKeyword",
);
const graphShapePlugins = graphPluginsBeforeConnections.filter(
  (plugin) => plugin.name === "component.shapeKeyword",
);

/** @public */
export const DEFAULT_COMPONENT_PLUGINS = Object.freeze([
  componentBracketDeclarationPlugin,
  componentJsonPlugin,
  ...graphPluginsBeforeComponentShapes,
  ...graphShapePlugins,
  connectionPlugin,
]);

/** @public */
export function createComponentParseContext() {
  const ctx = createGraphParseContext();
  ctx.diagram.kind = "component";
  ctx.setAutoVivifyConnections(true, "component");
  return ctx;
}

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
  const deploymentKeywords = /^(?:agent|storage|card|hexagon|stack|person|label|file)\b/i;
  let hasUseCaseSpecific = false;
  let hasObjectSpecific = false;
  let hasActivitySpecific = false;
  let hasComponentSpecific = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^(?:archimate|Junction_(?:And|Or))\b/i.test(line)) return false;
    if (/^state\s+/i.test(line) || /^\[\*\]\s*[-.]+>?/.test(line)) return false;
    if (/^(?:object|map|diamond)\b/i.test(line)) return false;
    if (
      /^(?:actor|agent|artifact|boundary|card|circle|cloud|collections|component|control|database|entity|file|folder|frame|hexagon|interface|label|node|package|person|process|queue|rectangle|stack|storage|usecase)\s+(?:"[^"]+"|[A-Za-z_$][\w$.-]*)\s+\[\s*$/i.test(
        line,
      )
    ) {
      return false;
    }
    if (deploymentKeywords.test(line)) return false;
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
      /^\[[^\]]+\]/.test(line) ||
      /^(?:component|node|frame|folder|cloud|database|queue|artifact|port|portin|portout|json)\b/i.test(
        line,
      )
    ) {
      hasComponentSpecific = true;
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
  if (hasUseCaseSpecific && !hasComponentSpecific) return false;
  if (hasObjectSpecific && !hasComponentSpecific) return false;

  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^skinparam\s+(?:component|package|node|frame|folder|database)\b/i.test(line)) return true;
    if (/^(?:left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i.test(line)) return true;
    if (
      /^(?:component|package|node|frame|folder|cloud|database|queue|artifact|actor|usecase|port|portin|portout|json)\b/i.test(
        line,
      )
    ) {
      return true;
    }
    if (/^\[[^\]]+\]/.test(line) || /^\([^)]*\)/.test(line)) return true;
  }
  return false;
}
