/**
 * Relationship plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/relationships
 */

import {
  classifyArrow,
  extractPlantUmlLink,
  normalisePlantUmlText,
  slug,
  stripComment,
  stripQuotes,
  unescapeLabel,
} from "../../../util/plantuml_utils.mjs";

const ENDPOINT = String.raw`(?::[^:]+:\/?|\([^)]+\)\/?|"[^"]+"|[A-Za-z_][\w-]*)`;
const RELATIONSHIP = new RegExp(
  String.raw`^(${ENDPOINT})\s+([-.o*<|>]+(?:\[[^\]]+\])?(?:up|down|left|right|u|d|l|r)?[-.o*<|>]*)\s+(${ENDPOINT})(.*)$`,
  "i",
);

/**
 * Parse use-case relationship.
 * Supports: -->, ..>, <|--, :> (include), .> (extend)
 * @param {string} line
 * @returns {({from: ReturnType<typeof normaliseEndpoint>, to: ReturnType<typeof normaliseEndpoint>, label: string, inlineStyle: string} & NonNullable<ReturnType<typeof classifyArrow>>)|null}
 */
function parseRelationship(line) {
  const match = line.match(RELATIONSHIP);
  if (!match) return null;
  const [, rawFrom, op, rawTo, rest = ""] = match;
  const arrow = classifyArrow(normaliseDirectionShorthand(op));
  if (!arrow) return null;
  const from = normaliseEndpoint(rawFrom, "from");
  const to = normaliseEndpoint(rawTo, "to");
  const { inlineStyle, label } = parseRelationshipRest(rest);
  return {
    from,
    to,
    label,
    inlineStyle,
    ...arrow,
  };
}

/**
 * @param {string} rest Text after the target endpoint.
 * @returns {{inlineStyle:string,label:string}}
 */
function parseRelationshipRest(rest) {
  const trimmed = rest.trim();
  if (!trimmed) return { inlineStyle: "", label: "" };
  if (trimmed.startsWith("#")) {
    const labelSep = trimmed.indexOf(" : ");
    if (labelSep >= 0) {
      return {
        inlineStyle: trimmed.slice(0, labelSep).trim(),
        label: trimmed.slice(labelSep + 3).trim(),
      };
    }
    return { inlineStyle: trimmed, label: "" };
  }
  if (trimmed.startsWith(":")) return { inlineStyle: "", label: trimmed.slice(1).trim() };
  return { inlineStyle: "", label: "" };
}

/**
 * @param {string} op Raw PlantUML arrow operator.
 * @returns {string} Operator with one/two-letter direction shorthands expanded.
 */
function normaliseDirectionShorthand(op) {
  return op.replace(/-(u|up|d|do|down|l|le|left|r|ri|right)-/i, (_m, dir) => {
    const lower = String(dir).toLowerCase();
    const full = lower.startsWith("u")
      ? "up"
      : lower.startsWith("d")
        ? "down"
        : lower.startsWith("l")
          ? "left"
          : "right";
    return `-${full}-`;
  });
}

/**
 * @param {string} raw Endpoint token.
 * @param {"from"|"to"} side Relationship side, used for bare auto-vivification.
 * @returns {{id:string,title:string,shape:string,shorthand:boolean}}
 */
function normaliseEndpoint(raw, side) {
  const token = raw.trim();
  if (token.startsWith(":") && token.replace(/\/$/, "").endsWith(":")) {
    const title = unescapeLabel(token.replace(/\/$/, "").slice(1, -1));
    return {
      id: slug(title),
      title: normalisePlantUmlText(title),
      shape: "actor",
      shorthand: false,
    };
  }
  if (token.startsWith("(") && token.replace(/\/$/, "").endsWith(")")) {
    const title = unescapeLabel(token.replace(/\/$/, "").slice(1, -1));
    return {
      id: /^[A-Za-z_][\w-]*$/.test(title) ? title : slug(title),
      title: normalisePlantUmlText(title),
      shape: "usecase",
      shorthand: false,
    };
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    const title = unescapeLabel(stripQuotes(token));
    return {
      id: slug(title),
      title: normalisePlantUmlText(title),
      shape: side === "to" ? "usecase" : "actor",
      shorthand: false,
    };
  }
  return {
    id: token,
    title: normalisePlantUmlText(token),
    shape: side === "to" ? "usecase" : "actor",
    shorthand: false,
  };
}

/**
 * @param {ReturnType<typeof normaliseEndpoint>} endpoint Normalized endpoint.
 * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx Parser context.
 * @returns {void}
 */
function ensureEndpointBox(endpoint, ctx) {
  if (ctx.boxes.has(endpoint.id)) return;
  ctx.addBox({
    id: endpoint.id,
    title: endpoint.title,
    shape: endpoint.shape,
  });
}

/**
 * @param {string} inlineStyle PlantUML inline relationship style.
 * @returns {boolean} Whether the line should be rendered dashed.
 */
function inlineStyleDashed(inlineStyle) {
  return /line\.(?:dashed|dotted)/i.test(inlineStyle);
}

/** @public */
export const useCaseRelationshipPlugin = {
  name: "use-case.relationships",

  /**
   * Try to parse a relationship line.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    const relationship = parseRelationship(cleanLine);
    if (relationship) {
      const { from, to, label, inlineStyle, ...arrow } = relationship;
      ensureEndpointBox(from, ctx);
      ensureEndpointBox(to, ctx);
      const parsedLabel = extractPlantUmlLink(label.trim());
      ctx.queueConnection({
        fromId: from.id,
        toId: to.id,
        label: normalisePlantUmlText(parsedLabel.text),
        link: parsedLabel.link,
        tooltip: parsedLabel.tooltip,
        ...arrow,
        dashed: arrow.dashed || inlineStyleDashed(inlineStyle),
      });
      return true;
    }

    return false;
  },
};
