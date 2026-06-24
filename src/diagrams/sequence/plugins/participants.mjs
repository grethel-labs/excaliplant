// Sequence-diagram participant declarations.

import { normalisePlantUmlText, slug, stripQuotes } from "../../../util/plantuml_utils.mjs";

const SEQ_PARTICIPANT =
  /^(participant|actor|boundary|control|collections|queue|database|entity)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+(#[\w-]+))?(?:\s+order\s+(-?\d+))?$/i;
const SEQ_PARTICIPANT_REVERSE =
  /^(participant|actor|boundary|control|collections|queue|database|entity)\s+(\S+)\s+as\s+"([^"]+)"(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+(#[\w-]+))?(?:\s+order\s+(-?\d+))?$/i;
const SEQ_PARTICIPANT_BLOCK =
  /^(participant|actor|boundary|control|collections|queue|database|entity)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+(#[\w-]+))?(?:\s+order\s+(-?\d+))?\s*\[$/i;

/**
 * Sequence-diagram participant declaration.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const participantPlugin = {
  name: "sequence.participant",
  tryStart(line) {
    const m = line.match(SEQ_PARTICIPANT_BLOCK);
    if (!m) return null;
    const spec = participantSpecFromMatch(m);
    /** @type {string[]} */
    const lines = [];
    return {
      onLine(blockLine) {
        lines.push(blockLine);
      },
      tryEnd(blockLine, ctx) {
        if (blockLine.trim() !== "]") return false;
        const title = blockParticipantTitle(lines, spec.title);
        ctx.declareParticipant({ ...spec, title });
        return true;
      },
    };
  },
  tryLine(line, ctx) {
    const reverse = line.match(SEQ_PARTICIPANT_REVERSE);
    if (reverse) {
      ctx.declareParticipant(reverseParticipantSpecFromMatch(reverse));
      return true;
    }
    const m = line.match(SEQ_PARTICIPANT);
    if (!m) return false;
    ctx.declareParticipant(participantSpecFromMatch(m));
    return true;
  },
};

/**
 * @param {RegExpMatchArray} match Participant declaration regex match.
 * @returns {{id:string,title:string,shape:string,stereotype:string,color:string,order:number|null}}
 */
function participantSpecFromMatch(match) {
  const [, kw, qTitle, bareId, alias, stereo, color, order] = match;
  const aliasIsQuotedTitle = alias && /^".*"$/.test(alias);
  const id = aliasIsQuotedTitle ? bareId : alias || bareId || slug(qTitle);
  return {
    id,
    title: normalisePlantUmlText(aliasIsQuotedTitle ? stripQuotes(alias) : qTitle || bareId || id),
    shape: kw,
    stereotype: stereo || "",
    color: color || "",
    order: order ? Number(order) : null,
  };
}

/**
 * @param {RegExpMatchArray} match Reverse `participant Alias as "Title"` match.
 * @returns {{id:string,title:string,shape:string,stereotype:string,color:string,order:number|null}}
 */
function reverseParticipantSpecFromMatch(match) {
  const [, kw, id, title, stereo, color, order] = match;
  return {
    id,
    title: normalisePlantUmlText(title),
    shape: kw,
    stereotype: stereo || "",
    color: color || "",
    order: order ? Number(order) : null,
  };
}

/**
 * @param {string[]} lines Raw bracket-block title lines.
 * @param {string} fallback Fallback declaration title.
 * @returns {string} Display title for the participant head.
 */
function blockParticipantTitle(lines, fallback) {
  const title = lines
    .map((line) => line.replace(/^\s*=\s*/, ""))
    .join("\n")
    .trim();
  return normalisePlantUmlText(title || fallback);
}
