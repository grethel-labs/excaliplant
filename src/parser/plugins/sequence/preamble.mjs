import { TITLE_LINE, stripQuotes } from "../../utils.mjs";

/**
 * `title …` line for sequence diagrams.
 * @type {import("../../engine.mjs").Plugin}
 */
export const titlePlugin = {
  name: "sequence.title",
  tryLine(line, ctx) {
    const m = line.match(TITLE_LINE);
    if (!m) return false;
    ctx.setTitle(stripQuotes(m[1].trim()));
    return true;
  },
};

/** @type {Map<string, keyof import("../../../model/diagram.mjs").SequenceDiagram["style"]>} */
const STYLE_KEYS = new Map([
  ["arrowcolor", "arrowColor"],
  ["participantbackgroundcolor", "participantBackgroundColor"],
  ["participantbordercolor", "participantBorderColor"],
  ["lifelinebordercolor", "lifelineColor"],
]);

/**
 * Small, deterministic subset of sequence skinparams that maps directly onto
 * renderer style fields. Other skinparams are consumed tolerantly.
 * @type {import("../../engine.mjs").Plugin}
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
  ctx.setSequenceStyle(key, value);
}
