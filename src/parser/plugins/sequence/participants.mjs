// Sequence-diagram participant declarations.

import { slug, unescapeLabel } from "../../utils.mjs";

const SEQ_PARTICIPANT =
  /^(participant|actor|boundary|control|collections|queue|database|entity)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+(#[\w-]+))?(?:\s+order\s+(-?\d+))?$/i;
const SEQ_PARTICIPANT_BLOCK =
  /^(participant|actor|boundary|control|collections|queue|database|entity)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+(#[\w-]+))?(?:\s+order\s+(-?\d+))?\s*\[$/i;

/**
 * Sequence-diagram participant declaration.
 * @type {import("../../engine.mjs").Plugin}
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
  const id = alias || bareId || slug(qTitle);
  return {
    id,
    title: unescapeLabel(qTitle || bareId || id),
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
  return unescapeLabel(title || fallback);
}
