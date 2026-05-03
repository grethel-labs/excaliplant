// Title + closing brace.
//
// Each plugin file deliberately handles ONE PlantUML concept. To support
// a new construct, drop a new file in this folder and register it.

import { TITLE_LINE, stripQuotes } from "../../utils.mjs";

/**
 * `title …` line.
 * @type {import("../../engine.mjs").Plugin}
 */
export const titlePlugin = {
  name: "component.title",
  tryLine(line, ctx) {
    const m = line.match(TITLE_LINE);
    if (!m) return false;
    ctx.setTitle(stripQuotes(m[1].trim()));
    return true;
  },
};

/**
 * Closing `}` for any open container.
 * @type {import("../../engine.mjs").Plugin}
 */
export const closeBracePlugin = {
  name: "component.close",
  tryLine(line, ctx) {
    if (line !== "}") return false;
    ctx.closeContainer();
    return true;
  },
};
