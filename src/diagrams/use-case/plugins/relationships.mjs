/**
 * Relationship plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/relationships
 */

import { stripComment } from "../../../util/plantuml_utils.mjs";

/**
 * Parse use-case relationship.
 * Supports: -->, ..>, <|--, :> (include), .> (extend)
 * @param {string} line
 * @returns {{from: string, to: string, type: string, label: string, dashed: boolean}|null}
 */
function parseRelationship(line) {
  // Match: Actor --> Usecase : label
  // Match: Usecase ..> Usecase2 : include
  // Match: Usecase <|-- Usecase2 (generalization)
  // Match: Actor -- Usecase (simple association)

  const patterns = [
    // Include: ..> or .>
    {
      regex: /^(\w+)\s*\.\.?>\s*(\w+)\s*(?::\s*(.+))?$/,
      type: "include",
      dashed: true,
    },
    // Extend: <|-- or <--
    {
      regex: /^(\w+)\s*<\|?--\s*(\w+)\s*(?::\s*(.+))?$/,
      type: "extend",
      dashed: false,
    },
    // Generalization: --|> or -->
    {
      regex: /^(\w+)\s*--\|?>\s*(\w+)\s*(?::\s*(.+))?$/,
      type: "generalization",
      dashed: false,
    },
    // Association: --> or --
    {
      regex: /^(\w+)\s*--+>\s*(\w+)\s*(?::\s*(.+))?$/,
      type: "association",
      dashed: false,
    },
    // Simple association without arrowhead: --
    {
      regex: /^(\w+)\s*--\s*(\w+)\s*(?::\s*(.+))?$/,
      type: "association",
      dashed: false,
    },
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) {
      return {
        from: match[1],
        to: match[2],
        type: pattern.type,
        label: match[3]?.trim() || "",
        dashed: pattern.dashed,
      };
    }
  }

  return null;
}

/** @public */
export const useCaseRelationshipPlugin = {
  name: "use-case.relationships",

  /**
   * Try to parse a relationship line.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    const relationship = parseRelationship(cleanLine);
    if (relationship) {
      ctx.queueConnection({
        fromId: relationship.from,
        toId: relationship.to,
        label: relationship.label,
        dashed: relationship.dashed,
        directed: true,
      });
      return true;
    }

    return false;
  },
};
