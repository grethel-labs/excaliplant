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
