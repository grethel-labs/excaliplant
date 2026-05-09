/**
 * Note plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/notes
 */

import { stripComment } from "../../../util/plantuml_utils.mjs";

/**
 * Parse note declaration.
 * @param {string} line
 * @returns {{type: "anchored", position: string, target: string}|{type: "floating", text: string, id: string}|null}
 */
function parseNote(line) {
  // Match: note right of Actor
  // Match: note "Text" as N1
  const anchoredMatch = line.match(/^note\s+(right|left|top|bottom)\s+of\s+(\w+)\s*$/i);
  if (anchoredMatch) {
    return {
      type: "anchored",
      position: anchoredMatch[1].toLowerCase(),
      target: anchoredMatch[2],
    };
  }

  const floatingMatch = line.match(/^note\s+"([^"]+)"\s+as\s+(\w+)\s*$/i);
  if (floatingMatch) {
    return {
      type: "floating",
      text: floatingMatch[1],
      id: floatingMatch[2],
    };
  }

  return null;
}

/** @public */
export const useCaseNotePlugin = {
  name: "use-case.notes",

  /**
   * Try to parse a note line.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    const note = parseNote(cleanLine);
    if (note) {
      if (note.type === "anchored") {
        ctx.queueNote({
          targetId: note.target,
          text: "",
          side: note.position,
        });
      } else {
        ctx.addBox({
          id: note.id,
          title: note.text,
          shape: "note",
        });
      }
      return true;
    }

    return false;
  },
};
