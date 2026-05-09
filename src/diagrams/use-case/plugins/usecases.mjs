/**
 * Usecase plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/usecases
 */

import { stripComment, slug } from "../../../util/plantuml_utils.mjs";

/**
 * Parse usecase with parentheses notation (Use Case Name).
 * @param {string} line
 * @returns {{type: string, id: string, title: string}|null}
 */
function parseParenthesisUsecase(line) {
  // Match (Use Case Name) or (Use Case Name) as Alias
  const match = line.match(/^\(([^)]+)\)(?:\s+as\s+(\w+))?$/);
  if (!match) return null;

  const name = match[1].trim();
  const alias = match[2] || slug(name);

  return {
    type: "usecase",
    id: alias,
    title: name,
  };
}

/**
 * Parse usecase keyword declaration.
 * @param {string} line
 * @returns {{type: string, id: string, title: string}|null}
 */
function parseKeywordUsecase(line) {
  // Match: usecase "Name" as Alias or usecase (Name) as Alias
  const match = line.match(/^usecase\s+(?:\(([^)]+)\)|"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?$/i);
  if (!match) return null;

  const name = (match[1] || match[2] || match[3]).trim();
  const alias = match[4] || slug(name);

  return {
    type: "usecase",
    id: alias,
    title: name,
  };
}

/** @public */
export const usecasePlugin = {
  name: "use-case.usecase",

  /**
   * Try to parse a usecase line.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    // Try parenthesis notation (Use Case)
    const parenUsecase = parseParenthesisUsecase(cleanLine);
    if (parenUsecase) {
      ctx.addBox({
        id: parenUsecase.id,
        title: parenUsecase.title,
        shape: "usecase",
      });
      return true;
    }

    // Try keyword usecase
    const keywordUsecase = parseKeywordUsecase(cleanLine);
    if (keywordUsecase) {
      ctx.addBox({
        id: keywordUsecase.id,
        title: keywordUsecase.title,
        shape: "usecase",
      });
      return true;
    }

    return false;
  },
};
