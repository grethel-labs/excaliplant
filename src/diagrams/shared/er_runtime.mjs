/** @module diagrams/shared/er_runtime */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { createGraphParseContext } from "./graph_parser.mjs";
import { GRAPH_RENDERERS, layoutGraphModel } from "./graph_runtime.mjs";
import {
  extractPlantUmlLink,
  normalisePlantUmlText,
  slug,
  stripQuotes,
} from "../../util/plantuml_utils.mjs";

/** @public */
export const erRenderers = GRAPH_RENDERERS;
/** @public */
export const erDiagramRenderer = new BaseModuleRenderer({ renderers: erRenderers });
/** @public */
export const layoutErDiagram = layoutGraphModel;

/**
 * @param {string} kind Diagram kind.
 * @returns {Record<string, any>}
 */
export function createErParseContext(kind) {
  const ctx = createGraphParseContext();
  ctx.diagram.kind = kind;
  ctx.setAutoVivifyConnections(true, "entity");
  return ctx;
}

/**
 * @param {string} raw Raw PlantUML declaration tail.
 * @returns {{id:string,title:string}}
 */
export function parseErName(raw) {
  const body = raw.trim().replace(/\s*\{\s*$/, "");
  const alias = body.match(/^("[^"]+"|.+?)\s+as\s+([A-Za-z_$][\w$.-]*)$/i);
  if (alias) return { id: alias[2], title: normalisePlantUmlText(stripQuotes(alias[1])) };
  const title = normalisePlantUmlText(stripQuotes(body));
  return { id: body.startsWith('"') ? slug(title) : body.split(/\s+/)[0], title };
}

/**
 * @param {Record<string, any>} ctx Parser context.
 * @param {string} raw Name or alias.
 * @param {string} shape Model shape.
 * @param {string} stereotype Stereotype marker.
 * @returns {import("../../general/model/diagram.mjs").Box}
 */
export function addErBox(ctx, raw, shape, stereotype) {
  const parsed = parseErName(raw);
  return ctx.addBox({
    id: parsed.id,
    title: parsed.title,
    shape,
    stereotype,
    members: [],
  });
}

/**
 * @param {import("../../general/model/diagram.mjs").Box} box Target box.
 * @param {string} raw Raw member line.
 */
export function addErMember(box, raw) {
  const source = raw.trim();
  let member = normalisePlantUmlText(source);
  if (/^\*\s+/.test(source)) member = `* ${member.replace(/^[-*]\s+/, "")}`;
  if (member && member !== "--" && !box.members.includes(member)) box.members.push(member);
}

/**
 * @param {string} raw Raw endpoint token.
 * @returns {string}
 */
export function parseErEndpoint(raw) {
  const token = stripQuotes(raw.trim());
  return raw.trim().startsWith('"') ? slug(token) : token;
}

/**
 * @param {Record<string, any>} ctx Parser context.
 * @param {object} spec Connection specification.
 * @param {string} spec.fromId Source id.
 * @param {string} spec.toId Target id.
 * @param {string} [spec.label] Label.
 * @param {string} [spec.fromMul] Source-side marker.
 * @param {string} [spec.toMul] Target-side marker.
 * @param {boolean} [spec.dashed] Dashed edge.
 */
export function queueErConnection(ctx, spec) {
  const parsedLabel = extractPlantUmlLink(spec.label?.trim() || "");
  ctx.queueConnection({
    fromId: spec.fromId,
    toId: spec.toId,
    label: normalisePlantUmlText(parsedLabel.text),
    fromMul: normalisePlantUmlText(spec.fromMul || ""),
    toMul: normalisePlantUmlText(spec.toMul || ""),
    link: parsedLabel.link,
    tooltip: parsedLabel.tooltip,
    dashed: spec.dashed === true,
    startArrowhead: null,
    endArrowhead: null,
    kind: spec.dashed ? "dependency" : "default",
  });
}
