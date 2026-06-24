/**
 * Container plugin for use-case diagrams (packages, rectangles).
 * @module diagrams/use-case/plugins/containers
 */

import { slug, stripComment, stripQuotes } from "../../../util/plantuml_utils.mjs";

/**
 * Parse container start.
 * @param {string} line
 * @returns {{type: string, name: string, id: string}|null}
 */
function parseContainerStart(line) {
  // Match: package "Name" { or rectangle "Name" {
  const match = line.match(/^(package|rectangle)\s+(?:"([^"]+)"|([^{]+?))\s*\{\s*$/i);
  if (!match) return null;

  const name = stripQuotes((match[2] || match[3]).trim());
  const type = match[1].toLowerCase();

  return {
    type,
    name,
    id: slug(name),
  };
}

/** @public */
export const useCaseContainerPlugin = {
  name: "use-case.containers",

  /**
   * Try to parse container start.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    const container = parseContainerStart(cleanLine);
    if (container) {
      ctx.openContainer({
        id: container.id,
        title: container.name,
        kind: container.type,
      });
      return true;
    }

    return false;
  },
};
