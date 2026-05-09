/**
 * Usecase plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/usecases
 */

import { stripComment, stripQuotes, slug } from "../../../util/plantuml_utils.mjs";

/**
 * Parse usecase with parentheses notation (Use Case Name).
 * @param {string} line
 * @returns {object|null}
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
    isBusiness: name.endsWith("/"),
  };
}

/**
 * Parse usecase keyword declaration.
 * @param {string} line
 * @returns {object|null}
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
    isBusiness: name.endsWith("/"),
  };
}

/** @public */
export const usecasePlugin = {
  name: "use-case.usecase",

  /**
   * Try to parse a usecase line.
   * @param {string} line
   * @param {object} context
   * @returns {boolean}
   */
  tryLine(line, context) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    // Try parenthesis notation (Use Case)
    const parenUsecase = parseParenthesisUsecase(cleanLine);
    if (parenUsecase) {
      const box = context.addBox({
        id: parenUsecase.id,
        title: parenUsecase.title,
        shape: "usecase",
      });
      if (box) {
        box.isBusiness = parenUsecase.isBusiness;
      }
      return true;
    }

    // Try keyword usecase
    const keywordUsecase = parseKeywordUsecase(cleanLine);
    if (keywordUsecase) {
      const box = context.addBox({
        id: keywordUsecase.id,
        title: keywordUsecase.title,
        shape: "usecase",
      });
      if (box) {
        box.isBusiness = keywordUsecase.isBusiness;
      }
      return true;
    }

    return false;
  },
};
