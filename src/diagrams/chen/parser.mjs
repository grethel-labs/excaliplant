/** @module diagrams/chen/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS } from "../shared/graph_parser.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import {
  addErBox,
  addErMember,
  createErParseContext,
  parseErEndpoint,
  queueErConnection,
} from "../shared/er_runtime.mjs";
import { explodeBraces } from "../../util/plantuml_utils.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);

/** @public */
export const chenDeclarationPlugin = {
  name: "chen.declaration",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryStart(line, ctx) {
    const match = line.match(
      /^(entity|relationship|attribute|derived_attribute|multi_valued_attribute|key)\s+(.+?)\s*\{$/i,
    );
    if (!match) return null;
    const box = addChenBox(ctx, match[1], match[2]);
    return {
      /** @param {string} bodyLine */
      onLine(bodyLine) {
        addErMember(box, bodyLine);
      },
      /** @param {string} bodyLine */
      tryEnd(bodyLine) {
        return bodyLine === "}";
      },
    };
  },
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const match = line.match(
      /^(entity|relationship|attribute|derived_attribute|multi_valued_attribute|key)\s+(.+)$/i,
    );
    if (!match || /\{$/.test(line)) return false;
    addChenBox(ctx, match[1], match[2]);
    return true;
  },
};

/** @public */
export const chenConnectionPlugin = {
  name: "chen.connection",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (/^(?:left|right|top|bottom)\s+to\s+(?:left|right|top|bottom)\s+direction$/i.test(line)) {
      return true;
    }
    const match = line.match(
      /^("[^"]+"|\S+)\s+-(?:([A-Za-z0-9_.]+)-)?\s*("[^"]+"|\S+)(?:\s*:\s*(.+))?$/,
    );
    if (!match) return false;
    queueErConnection(ctx, {
      fromId: parseErEndpoint(match[1]),
      toId: parseErEndpoint(match[3]),
      label: match[4] || "",
      toMul: match[2] || "",
    });
    return true;
  },
};

/** @param {Record<string, any>} ctx @param {string} keyword @param {string} raw */
function addChenBox(ctx, keyword, raw) {
  const normalized = keyword.toLowerCase();
  if (normalized === "relationship") return addErBox(ctx, raw, "diamond", "<<chen-relationship>>");
  if (normalized === "entity") return addErBox(ctx, raw, "entity", "<<chen-entity>>");
  return addErBox(ctx, raw, "usecase", `<<chen-${normalized.replaceAll("_", "-")}>>`);
}

/** @public */
export const DEFAULT_CHEN_PLUGINS = Object.freeze([
  ...graphPluginsBeforeConnections,
  chenDeclarationPlugin,
  chenConnectionPlugin,
  connectionPlugin,
]);

/** @public */
export const createChenParseContext = () => createErParseContext("chen");
/** @public @param {string[]} lines */
export const prepareChenLines = explodeBraces;
/** @public @param {string} text */
export const detectChenDiagram = (text) => /@startchen\b/im.test(text);

/** @public */
export class ChenDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_CHEN_PLUGINS,
      createParseContext: createChenParseContext,
      prepareLines: prepareChenLines,
      detect: detectChenDiagram,
    });
  }
}
/** @public */
export const chenDiagramParser = new ChenDiagramParser();
