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

import { normalisePlantUmlText } from "../../../util/plantuml_utils.mjs";

const FRAGMENT_START = /^(opt|loop|alt|par|break|critical|group)(?:\s+(.*))?$/i;
const FRAGMENT_SPLIT = /^(else|and|option)(?:\s+(.*))?$/i;
const FRAGMENT_END = /^end(?:\s+(opt|loop|alt|par|break|critical|group))?$/i;

/**
 * Combined fragment lines for sequence diagrams.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const fragmentPlugin = {
  name: "sequence.fragment",
  tryLine(line, ctx) {
    const start = line.match(FRAGMENT_START);
    if (start) {
      const spec = parseFragmentStart(start[1].toLowerCase(), start[2]?.trim() || "");
      ctx.startFragment(spec.kind, spec.label, spec.secondaryLabel, spec.color);
      return true;
    }
    const split = line.match(FRAGMENT_SPLIT);
    if (split) {
      return ctx.splitFragmentOperand(normalisePlantUmlText(split[2]?.trim() || ""));
    }
    if (FRAGMENT_END.test(line)) {
      return ctx.endFragment();
    }
    return false;
  },
};

/**
 * @param {string} kind Fragment keyword.
 * @param {string} raw Raw label suffix.
 * @returns {{kind:string,label:string,secondaryLabel:string,color:string}}
 */
function parseFragmentStart(kind, raw) {
  let label = raw.trim();
  let color = "";
  const colorMatch = label.match(/\s+(#[\w-]+)\s*$/);
  if (colorMatch) {
    color = colorMatch[1];
    label = label.slice(0, colorMatch.index).trimEnd();
  }

  let secondaryLabel = "";
  if (kind === "group") {
    const secondary = label.match(/\s+\[([^\]]+)\]\s*$/);
    if (secondary) {
      secondaryLabel = normalisePlantUmlText(secondary[1].trim());
      label = label.slice(0, secondary.index).trimEnd();
    }
  }

  return { kind, label: normalisePlantUmlText(label), secondaryLabel, color };
}
