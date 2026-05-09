/**
 * Container plugin for use-case diagrams (packages, rectangles).
 * @module diagrams/use-case/plugins/containers
 */

import { stripComment } from "../../../util/plantuml_utils.mjs";

/**
 * Parse container start.
 * @param {string} line
 * @returns {{type: string, name: string, id: string}|null}
 */
function parseContainerStart(line) {
  // Match: package "Name" { or rectangle "Name" {
  const match = line.match(/^(package|rectangle)\s+(?:"([^"]+)"|(\w+))\s*\{\s*$/i);
  if (!match) return null;

  const name = match[2] || match[3];
  const type = match[1].toLowerCase();

  return {
    type,
    name,
    id: name.toLowerCase().replace(/\s+/g, "_"),
  };
}

/** @public */
export const useCaseContainerPlugin = {
  name: "use-case.containers",

  /**
   * Try to parse container start.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {{onLine: () => boolean, tryEnd: (endLine: string) => boolean}|null}
   */
  tryStart(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return null;

    const container = parseContainerStart(cleanLine);
    if (container) {
      ctx.openContainer({
        id: container.id,
        title: container.name,
        kind: container.type,
      });
      return {
        onLine: () => true,
        tryEnd: (endLine) => {
          if (endLine.trim() === "}") {
            ctx.closeContainer();
            return true;
          }
          return false;
        },
      };
    }

    return null;
  },
};
