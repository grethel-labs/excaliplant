import { TITLE_LINE, normalisePlantUmlText, stripQuotes } from "../../../util/plantuml_utils.mjs";

/**
 * Create a `title ...` parser plugin for any diagram context that exposes
 * `setTitle(title)`.
 *
 * @param {string} name Stable plugin name.
 * @returns {import("../../../util/parser_engine.mjs").Plugin} Title parser plugin.
 * @public
 */
export function createTitlePlugin(name) {
  return {
    name,
    tryLine(line, ctx) {
      const match = line.match(TITLE_LINE);
      if (!match) return false;
      ctx.setTitle(normalisePlantUmlText(stripQuotes(match[1].trim())));
      return true;
    },
  };
}
