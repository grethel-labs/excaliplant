// Sequence-diagram participant declarations.

import { slug, unescapeLabel } from "../../utils.mjs";

const SEQ_PARTICIPANT =
  /^(participant|actor|boundary|control|collections|queue|database|entity)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+(#[\w-]+))?(?:\s+order\s+(-?\d+))?$/i;

/**
 * Sequence-diagram participant declaration.
 * @type {import("../../engine.mjs").Plugin}
 */
export const participantPlugin = {
  name: "sequence.participant",
  tryLine(line, ctx) {
    const m = line.match(SEQ_PARTICIPANT);
    if (!m) return false;
    const [, kw, qTitle, bareId, alias, stereo, color, order] = m;
    const id = alias || bareId || slug(qTitle);
    const title = unescapeLabel(qTitle || bareId || id);
    ctx.declareParticipant({
      id,
      title,
      shape: kw,
      stereotype: stereo || "",
      color: color || "",
      order: order ? Number(order) : null,
    });
    return true;
  },
};
