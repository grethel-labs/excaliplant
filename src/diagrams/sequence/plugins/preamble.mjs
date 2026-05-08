import { createTitlePlugin } from "../../shared/common_plugins/title.mjs";

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
  ctx.setSequenceStyle(key, value);
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
