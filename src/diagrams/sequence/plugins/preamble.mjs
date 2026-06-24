import { createTitlePlugin } from "../../shared/common_plugins/title.mjs";
import { collectBlockLines, sanitizePlantUmlColor } from "../../../util/plantuml_utils.mjs";

/**
 * `title …` line for sequence diagrams.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const titlePlugin = createTitlePlugin("sequence.title");

/** @type {Map<string, keyof import("../../../general/model/diagram.mjs").SequenceDiagram["style"]>} */
const STYLE_KEYS = new Map([
  ["arrowcolor", "arrowColor"],
  ["messagefontcolor", "messageFontColor"],
  ["sequencemessagealign", "messageAlign"],
  ["messagealign", "messageAlign"],
  ["responsemessagebelowarrow", "responseMessageBelowArrow"],
  ["participantbackgroundcolor", "participantBackgroundColor"],
  ["participantbordercolor", "participantBorderColor"],
  ["participantfontcolor", "participantFontColor"],
  ["lifelinebordercolor", "lifelineColor"],
  ["lifelinestrategy", "lifelineStyle"],
  ["lifelinestyle", "lifelineStyle"],
  ["actorstyle", "actorStyle"],
  ["notebackgroundcolor", "noteBackgroundColor"],
  ["notebordercolor", "noteBorderColor"],
  ["notefontcolor", "noteFontColor"],
  ["groupbackgroundcolor", "groupBackgroundColor"],
  ["groupbordercolor", "groupBorderColor"],
  ["groupfontcolor", "groupFontColor"],
  ["dividerbordercolor", "dividerColor"],
  ["dividerfontcolor", "dividerColor"],
  ["sequencegroupbackgroundcolor", "groupBackgroundColor"],
  ["sequencegroupbordercolor", "groupBorderColor"],
  ["activationbackgroundcolor", "activationColor"],
  ["activationbarcolor", "activationColor"],
]);

const COLOR_STYLE_KEYS = new Set([
  "arrowColor",
  "messageFontColor",
  "participantBackgroundColor",
  "participantBorderColor",
  "participantFontColor",
  "lifelineColor",
  "noteBackgroundColor",
  "noteBorderColor",
  "noteFontColor",
  "groupBackgroundColor",
  "groupBorderColor",
  "groupFontColor",
  "dividerColor",
  "activationColor",
]);

/**
 * Small, deterministic subset of sequence skinparams that maps directly onto
 * renderer style fields. Other skinparams are consumed tolerantly.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const skinparamPlugin = {
  name: "sequence.skinparam",
  tryLine(line, ctx) {
    const compact = line.match(/^skinparam\s+(?:(?:sequence)\s+|sequence)?([A-Za-z]+)\s+(\S+)$/i);
    if (!compact) return /^skinparam\b/i.test(line);
    applySkinparam(ctx, compact[1], compact[2]);
    return true;
  },
  tryStart(line, ctx) {
    if (!/^skinparam\s+sequence\s*\{$/i.test(line)) return null;
    return {
      onLine(blockLine) {
        const item = blockLine.match(/^([A-Za-z]+)\s+(\S+)$/);
        if (item) applySkinparam(ctx, item[1], item[2]);
      },
      tryEnd(blockLine) {
        return blockLine === "}";
      },
    };
  },
};

/**
 * CSS-like PlantUML `<style>...</style>` blocks are consumed without applying
 * them until the renderer has a complete safe style mapping.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const styleBlockPlugin = {
  name: "sequence.style",
  tryStart(line) {
    if (!/^<style>\s*$/i.test(line)) return null;
    return collectBlockLines(/^<\/style>\s*$/i, (lines, ctx) => {
      applyStyleBlock(ctx, lines);
    });
  },
};

/**
 * @param {any} ctx
 * @param {string} rawName
 * @param {string} value
 * @returns {void}
 */
function applySkinparam(ctx, rawName, value) {
  const key = STYLE_KEYS.get(rawName.toLowerCase());
  if (!key) return;
  if (key === "lifelineStyle") {
    ctx.setSequenceStyle(key, /solid/i.test(value) ? "solid" : "dashed");
    return;
  }
  if (key === "messageAlign") {
    ctx.setSequenceStyle(key, normalizeMessageAlign(value));
    return;
  }
  if (key === "responseMessageBelowArrow") {
    ctx.setSequenceStyle(key, /^(?:true|yes|1|on)$/i.test(value) ? "true" : "false");
    return;
  }
  if (key === "actorStyle") {
    ctx.setSequenceStyle(key, normalizeActorStyle(value));
    return;
  }
  if (COLOR_STYLE_KEYS.has(key)) {
    const safeColor = sanitizePlantUmlColor(value);
    if (safeColor) ctx.setSequenceStyle(key, safeColor);
    return;
  }
  ctx.setSequenceStyle(key, value);
}

/**
 * Parse a safe subset of CSS-like PlantUML style blocks for sequence
 * diagrams. Unknown selectors/properties are intentionally ignored.
 *
 * @param {any} ctx Sequence parser context.
 * @param {string[]} lines Block body between `<style>` and `</style>`.
 * @returns {void}
 */
function applyStyleBlock(ctx, lines) {
  /** @type {string[]} */
  const selectors = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\*.*?\*\//g, "").trim();
    if (!line) continue;
    if (line === "}") {
      selectors.pop();
      continue;
    }
    const open = line.match(/^([A-Za-z][\w-]*)\s*\{$/);
    if (open) {
      selectors.push(open[1].toLowerCase());
      continue;
    }
    const item = line.match(/^([A-Za-z][\w-]*)\s*:\s*([^;]+);?$/);
    if (!item) continue;
    const selector = selectors[selectors.length - 1] || "";
    const key = styleBlockKey(selector, item[1]);
    if (!key) continue;
    const safeColor = sanitizePlantUmlColor(item[2]);
    if (safeColor) ctx.setSequenceStyle(key, safeColor);
  }
}

/**
 * @param {string} selector Lower-case PlantUML style selector.
 * @param {string} property Raw CSS-like property name.
 * @returns {keyof import("../../../general/model/diagram.mjs").SequenceDiagram["style"]|""}
 */
function styleBlockKey(selector, property) {
  const prop = property.toLowerCase();
  if (selector === "arrow") {
    if (prop === "linecolor" || prop === "color") return "arrowColor";
    if (prop === "fontcolor") return "messageFontColor";
  }
  if (selector === "participant" || selector === "actor") {
    if (prop === "backgroundcolor") return "participantBackgroundColor";
    if (prop === "linecolor" || prop === "bordercolor") return "participantBorderColor";
    if (prop === "fontcolor") return "participantFontColor";
  }
  if (selector === "note") {
    if (prop === "backgroundcolor") return "noteBackgroundColor";
    if (prop === "linecolor" || prop === "bordercolor") return "noteBorderColor";
    if (prop === "fontcolor") return "noteFontColor";
  }
  if (selector === "group") {
    if (prop === "backgroundcolor") return "groupBackgroundColor";
    if (prop === "linecolor" || prop === "bordercolor") return "groupBorderColor";
    if (prop === "fontcolor") return "groupFontColor";
  }
  if (selector === "lifeline" || selector === "lifeLine".toLowerCase()) {
    if (prop === "linecolor" || prop === "bordercolor") return "lifelineColor";
  }
  if (selector === "divider") {
    if (prop === "linecolor" || prop === "bordercolor" || prop === "fontcolor")
      return "dividerColor";
  }
  return "";
}

/**
 * @param {string} value PlantUML message alignment token.
 * @returns {"left"|"center"|"right"} Renderer-safe alignment.
 */
function normalizeMessageAlign(value) {
  const lower = value.toLowerCase();
  if (lower === "left" || lower === "right") return lower;
  return "center";
}

/**
 * @param {string} value PlantUML actor style token.
 * @returns {"stick"|"hollow"|"box"} Renderer-safe actor style.
 */
function normalizeActorStyle(value) {
  const lower = value.toLowerCase();
  if (lower === "hollow") return "hollow";
  if (lower === "box" || lower === "rectangle" || lower === "awesome") return "box";
  return "stick";
}
