/** @module diagrams/nwdiag/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { createGraphParseContext } from "../shared/graph_parser.mjs";
import {
  explodeBraces,
  normalisePlantUmlText,
  slug,
  stripQuotes,
} from "../../util/plantuml_utils.mjs";

/** @public */
export const nwdiagSyntaxPlugin = {
  name: "nwdiag.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (/^(?:nwdiag|packetdiag|rackdiag)\s*\{?$/i.test(line) || line === "{") return true;
    if (line === "}") {
      if (ctx.networkStack.length) ctx.closeContainer();
      ctx.networkStack.pop();
      return true;
    }
    const network = line.match(/^network\s+("?[^"{]+"?)\s*\{?$/i);
    if (network) {
      const title = normalisePlantUmlText(stripQuotes(network[1].trim()));
      const id = `network_${slug(title)}`;
      ctx.openContainer({ id, title, kind: "frame" });
      ctx.networkStack.push(id);
      return true;
    }
    const group = line.match(/^group\s+("?[^"{]+"?)\s*\{?$/i);
    if (group) {
      const title = normalisePlantUmlText(stripQuotes(group[1].trim()));
      const id = `group_${slug(title)}`;
      ctx.openContainer({ id, title, kind: "folder" });
      ctx.networkStack.push(id);
      return true;
    }
    const address = line.match(/^address\s*=\s*(.+?);?$/i);
    if (address) {
      ctx.addBox({
        id: `address_${ctx.networkStack.at(-1) || "root"}`,
        title: "address",
        description: normalisePlantUmlText(stripQuotes(address[1].trim())),
        shape: "note",
      });
      return true;
    }
    const peer = line.match(
      /^([A-Za-z_$][\w$.-]*)\s*(?:--|<->|->|<-)\s*([A-Za-z_$][\w$.-]*)(?:\s*:\s*(.+))?;?$/,
    );
    if (peer) {
      ensureNode(ctx, peer[1]);
      ensureNode(ctx, peer[2]);
      ctx.queueConnection({
        fromId: peer[1],
        toId: peer[2],
        label: normalisePlantUmlText(stripQuotes((peer[3] || "").replace(/;$/, "").trim())),
        directionHint: "right",
        dashed: false,
        allowVivify: true,
      });
      return true;
    }
    const node = line.match(/^([A-Za-z_$][\w$.-]*)(?:\s*\[([^\]]*)\])?;?$/);
    if (node && !/^(?:title|caption|legend|skinparam)\b/i.test(line)) {
      const [, id, attrs = ""] = node;
      const parsed = parseAttributes(attrs);
      ctx.addBox({
        id,
        title: normalisePlantUmlText(parsed.label || id),
        description: normalisePlantUmlText(parsed.address || parsed.description || ""),
        shape: shapeForNode(parsed.shape),
        stereotype: parsed.stereotype,
      });
      return true;
    }
    return false;
  },
};

/** @public */
export const DEFAULT_NWDIAG_PLUGINS = [nwdiagSyntaxPlugin];

/** @public */
export function createNwdiagParseContext() {
  const ctx = /** @type {Record<string, any>} */ (createGraphParseContext());
  ctx.diagram.kind = "nwdiag";
  ctx.networkStack = [];
  ctx.setAutoVivifyConnections(true, "node");
  return ctx;
}

/** @public @param {string[]} lines */
export function prepareNwdiagLines(lines) {
  return explodeBraces(lines).filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return !["@startnwdiag", "@endnwdiag", "@enduml"].includes(trimmed);
  });
}

/** @public @param {string} text */
export function detectNwdiagDiagram(text) {
  return /@startnwdiag\b|^\s*(?:nwdiag|packetdiag|rackdiag)\s*\{/im.test(text);
}

/** @public */
export class NwdiagDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_NWDIAG_PLUGINS,
      createParseContext: createNwdiagParseContext,
      prepareLines: prepareNwdiagLines,
      detect: detectNwdiagDiagram,
    });
  }
}

/** @public */
export const nwdiagDiagramParser = new NwdiagDiagramParser();

/** @param {Record<string, any>} ctx @param {string} id */
function ensureNode(ctx, id) {
  if (!ctx.boxes.has(id)) ctx.addBox({ id, title: id, shape: "node" });
}

/** @param {string} attrs */
function parseAttributes(attrs) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of attrs.split(",")) {
    const match = part.trim().match(/^([A-Za-z_][\w.-]*)\s*=\s*(.+)$/);
    if (match) out[match[1].toLowerCase()] = stripQuotes(match[2].trim());
  }
  if (out.description && !out.label) out.label = out.description;
  return {
    address: out.address || "",
    description: out.description || "",
    label: out.label || "",
    shape: out.shape || "",
    stereotype: out.stereotype || "",
  };
}

/** @param {string} shape */
function shapeForNode(shape) {
  if (/database|storage/i.test(shape)) return "database";
  if (/cloud/i.test(shape)) return "cloud";
  return "node";
}
