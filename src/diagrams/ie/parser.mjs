/** @module diagrams/ie/parser */
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
import { stripComment } from "../../util/plantuml_utils.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);

/** @public */
export const ieEntityPlugin = {
  name: "ie.entity",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryStart(line, ctx) {
    const match = line.match(/^entity\s+(.+?)\s*\{$/i);
    if (!match) return null;
    const box = addErBox(ctx, match[1], "entity", "<<ie-entity>>");
    return {
      /** @param {string} bodyLine */
      onLine(bodyLine) {
        addErMember(box, bodyLine.replace(/^-\s+/, "* "));
      },
      /** @param {string} bodyLine */
      tryEnd(bodyLine) {
        return bodyLine === "}";
      },
    };
  },
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const match = line.match(/^entity\s+(.+)$/i);
    if (!match || /\{$/.test(line)) return false;
    addErBox(ctx, match[1], "entity", "<<ie-entity>>");
    return true;
  },
};

/** @public */
export const ieRelationshipPlugin = {
  name: "ie.relationship",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const match = line.match(
      /^("[^"]+"|\S+)\s+([}|o{]+)(--|\.\.)([}|o{]+)\s+("[^"]+"|\S+)(?:\s*:\s*(.+))?$/,
    );
    if (!match) return false;
    queueErConnection(ctx, {
      fromId: parseErEndpoint(match[1]),
      toId: parseErEndpoint(match[5]),
      fromMul: match[2],
      toMul: match[4],
      dashed: match[3] === "..",
      label: match[6] || "",
    });
    return true;
  },
};

/** @public */
export const DEFAULT_IE_PLUGINS = Object.freeze([
  ieEntityPlugin,
  ...graphPluginsBeforeConnections,
  ieRelationshipPlugin,
  connectionPlugin,
]);

/** @public */
export const createIeParseContext = () => createErParseContext("ie");
/** @public @param {string[]} lines */
export const prepareIeLines = (lines) => lines;
/** @public @param {string} text */
export function detectIeDiagram(text) {
  return text
    .split(/\r?\n/)
    .some((raw) => /[}|o{]+(?:--|\.\.)[}|o{]+/.test(stripComment(raw).trim()));
}

/** @public */
export class IeDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_IE_PLUGINS,
      createParseContext: createIeParseContext,
      prepareLines: prepareIeLines,
      detect: detectIeDiagram,
    });
  }
}
/** @public */
export const ieDiagramParser = new IeDiagramParser();
