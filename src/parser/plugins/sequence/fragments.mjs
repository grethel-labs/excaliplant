// Sequence-diagram combined fragments.
//
// Supports the common PlantUML fragment operators:
//   opt <label>
//   loop <label>
//   alt <label> / else <label>
//   par <label> / else|and <label>
//   break <label>
//   critical <label> / option <label>
//   group <label> / option <label>
//   end

import { unescapeLabel } from "../../utils.mjs";

const FRAGMENT_START = /^(opt|loop|alt|par|break|critical|group)(?:\s+(.*))?$/i;
const FRAGMENT_SPLIT = /^(else|and|option)(?:\s+(.*))?$/i;
const FRAGMENT_END = /^end(?:\s+(opt|loop|alt|par|break|critical|group))?$/i;

/**
 * Combined fragment lines for sequence diagrams.
 * @type {import("../../engine.mjs").Plugin}
 */
export const fragmentPlugin = {
  name: "sequence.fragment",
  tryLine(line, ctx) {
    const start = line.match(FRAGMENT_START);
    if (start) {
      ctx.startFragment(start[1].toLowerCase(), unescapeLabel(start[2]?.trim() || ""));
      return true;
    }
    const split = line.match(FRAGMENT_SPLIT);
    if (split) {
      return ctx.splitFragmentOperand(unescapeLabel(split[2]?.trim() || ""));
    }
    if (FRAGMENT_END.test(line)) {
      return ctx.endFragment();
    }
    return false;
  },
};
