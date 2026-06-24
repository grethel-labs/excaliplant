/**
 * Actor plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/actors
 */

import {
  normalisePlantUmlText,
  stripComment,
  stripQuotes,
  slug,
  unescapeLabel,
} from "../../../util/plantuml_utils.mjs";

/**
 * Parse actor declaration with colon notation :Actor Name:.
 * @param {string} line
 * @returns {{type: string, id: string, title: string, stereotype: string}|null}
 */
function parseColonActor(line) {
  // Match :Actor Name: or :Actor Name:/ as Alias
  const match = line.match(
    /^:([^:]+):\/?(?:\s+as\s+(\w+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+#[^;]+(?:;.*)?)?$/,
  );
  if (!match) return null;

  const name = unescapeLabel(match[1].trim());
  const alias = match[2] || slug(name);

  return {
    type: "actor",
    id: alias,
    title: normalisePlantUmlText(name),
    stereotype: match[3] || "",
  };
}

/**
 * Parse actor keyword declaration.
 * @param {string} line
 * @returns {{type: string, id: string, title: string, stereotype: string}|null}
 */
function parseKeywordActor(line) {
  // Match: actor "Name" as Alias, actor :Name: as Alias, actor/ Business
  const match = line.match(
    /^actor\/?\s+(?::([^:]+):\/?|"([^"]+)"|([^\s<#]+))(?:\s+as\s+(\w+))?(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+#[^;]+(?:;.*)?)?$/i,
  );
  if (!match) return null;

  const name = unescapeLabel((match[1] || match[2] || match[3]).trim());
  const alias = match[4] || slug(name);

  return {
    type: "actor",
    id: alias,
    title: normalisePlantUmlText(name),
    stereotype: match[5] || "",
  };
}

/**
 * Parse quoted actor shorthand: `"Main Admin" as Admin`.
 * @param {string} line
 * @returns {{type: string, id: string, title: string, stereotype: string}|null}
 */
function parseQuotedActor(line) {
  const match = line.match(
    /^"([^"]+)"\s+as\s+(\w+)(?:\s*<<\s*([^>]+?)\s*>>)?(?:\s+#[^;]+(?:;.*)?)?$/,
  );
  if (!match || /^\(.+\)$/.test(match[2])) return null;
  return {
    type: "actor",
    id: match[2],
    title: normalisePlantUmlText(unescapeLabel(stripQuotes(match[1]))),
    stereotype: match[3] || "",
  };
}

/**
 * Parse actorStyle directive.
 * @param {string} line
 * @returns {{type: string, style: string}|null}
 */
function parseActorStyle(line) {
  const match = line.match(/^skinparam\s+actorStyle\s+(\w+)$/i);
  if (!match) return null;

  return {
    type: "actorStyle",
    style: match[1].toLowerCase(), // awesome, hollow, default
  };
}

/** @public */
export const actorPlugin = {
  name: "use-case.actor",

  /**
   * Try to parse an actor line.
   * @param {string} line
   * @param {ReturnType<import("../../shared/graph_context.mjs").createComponentContext>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    // Try actorStyle first
    const style = parseActorStyle(cleanLine);
    if (style) {
      // Store actor style in diagram metadata if needed
      return true;
    }

    // Try colon notation :Actor:
    const colonActor = parseColonActor(cleanLine);
    if (colonActor) {
      ctx.addBox({
        id: colonActor.id,
        title: colonActor.title,
        shape: "actor",
        stereotype: colonActor.stereotype,
      });
      return true;
    }

    const quotedActor = parseQuotedActor(cleanLine);
    if (quotedActor) {
      ctx.addBox({
        id: quotedActor.id,
        title: quotedActor.title,
        shape: "actor",
        stereotype: quotedActor.stereotype,
      });
      return true;
    }

    // Try keyword actor
    const keywordActor = parseKeywordActor(cleanLine);
    if (keywordActor) {
      ctx.addBox({
        id: keywordActor.id,
        title: keywordActor.title,
        shape: "actor",
        stereotype: keywordActor.stereotype,
      });
      return true;
    }

    return false;
  },
};
