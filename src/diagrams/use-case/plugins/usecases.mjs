/**
 * Usecase plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/usecases
 */

import {
  normalisePlantUmlText,
  stripComment,
  stripQuotes,
  slug,
  unescapeLabel,
} from "../../../util/plantuml_utils.mjs";

/**
 * Parse usecase with parentheses notation (Use Case Name).
 * @param {string} line
 * @returns {{type: string, id: string, title: string, stereotype: string}|null}
 */
function parseParenthesisUsecase(line) {
  // Match (Use Case Name) or (Use Case Name) as Alias
  const match = line.match(
    /^\(([^)]+)\)\/?(?:\s+as\s+(?:\(([^)]+)\)|(\w+)))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+#[^;]+(?:;.*)?)?$/,
  );
  if (!match) return null;

  const name = unescapeLabel(match[1].trim());
  const alias = match[2] || match[3] || slug(name);

  return {
    type: "usecase",
    id: alias,
    title: normalisePlantUmlText(name),
    stereotype: match[4] || "",
  };
}

/**
 * Parse usecase keyword declaration.
 * @param {string} line
 * @returns {{type: string, id: string, title: string, stereotype: string}|null}
 */
function parseKeywordUsecase(line) {
  // Match: usecase "Name" as Alias, usecase Alias as "Description", usecase/ Business
  const match = line.match(
    /^usecase\/?\s+(?:\(([^)]+)\)|"([^"]+)"|([^\s<#]+))(?:\s+as\s+(?:\(([^)]+)\)|"([^"]+)"|(\w+)))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+#[^;]+(?:;.*)?)?$/i,
  );
  if (!match) return null;

  const left = unescapeLabel((match[1] || match[2] || match[3]).trim());
  const right = match[4] || match[5] || match[6] || "";
  const rightIsDescription = Boolean(match[5]);
  const name = rightIsDescription ? unescapeLabel(stripQuotes(right)) : left;
  const alias = rightIsDescription ? left : right || slug(left);

  return {
    type: "usecase",
    id: alias,
    title: normalisePlantUmlText(name),
    stereotype: match[7] || "",
  };
}

/**
 * Parse quoted usecase shorthand: `"Use the application" as (Use)`.
 * @param {string} line
 * @returns {{type: string, id: string, title: string, stereotype: string}|null}
 */
function parseQuotedUsecase(line) {
  const match = line.match(
    /^"([^"]+)"\s+as\s+\(([^)]+)\)(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+#[^;]+(?:;.*)?)?$/,
  );
  if (!match) return null;
  return {
    type: "usecase",
    id: match[2],
    title: normalisePlantUmlText(unescapeLabel(stripQuotes(match[1]))),
    stereotype: match[3] || "",
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
        stereotype: parenUsecase.stereotype,
      });
      return true;
    }

    const quotedUsecase = parseQuotedUsecase(cleanLine);
    if (quotedUsecase) {
      ctx.addBox({
        id: quotedUsecase.id,
        title: quotedUsecase.title,
        shape: "usecase",
        stereotype: quotedUsecase.stereotype,
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
        stereotype: keywordUsecase.stereotype,
      });
      return true;
    }

    return false;
  },
};
