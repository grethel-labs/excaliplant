/**
 * Actor plugin for use-case diagrams.
 * @module diagrams/use-case/plugins/actors
 */

import { stripComment, stripQuotes, slug } from "../../../util/plantuml_utils.mjs";

const ACTOR_KEYWORDS = ["actor"];
const ACTOR_STYLE_KEYWORDS = ["actorStyle"];

/**
 * Parse actor declaration with colon notation :Actor Name:.
 * @param {string} line
 * @returns {object|null}
 */
function parseColonActor(line) {
  // Match :Actor Name: or :Actor Name: as Alias
  const match = line.match(/^:([^:]+):(?:\s+as\s+(\w+))?$/);
  if (!match) return null;

  const name = match[1].trim();
  const alias = match[2] || slug(name);

  return {
    type: "actor",
    id: alias,
    title: name,
    isBusiness: name.endsWith("/"),
  };
}

/**
 * Parse actor keyword declaration.
 * @param {string} line
 * @returns {object|null}
 */
function parseKeywordActor(line) {
  // Match: actor "Name" as Alias or actor :Name: as Alias
  const match = line.match(/^actor\s+(?::([^:]+):|"([^"]+)"|(\w+))(?:\s+as\s+(\w+))?$/i);
  if (!match) return null;

  const name = (match[1] || match[2] || match[3]).trim();
  const alias = match[4] || slug(name);

  return {
    type: "actor",
    id: alias,
    title: name,
    isBusiness: name.endsWith("/"),
  };
}

/**
 * Parse actorStyle directive.
 * @param {string} line
 * @returns {object|null}
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
   * @param {object} context
   * @returns {boolean}
   */
  tryLine(line, context) {
    const cleanLine = stripComment(line).trim();
    if (!cleanLine) return false;

    // Try actorStyle first
    const style = parseActorStyle(cleanLine);
    if (style) {
      if (context?.diagram) {
        context.diagram.actorStyle = style.style;
      }
      return true;
    }

    // Try colon notation :Actor:
    const colonActor = parseColonActor(cleanLine);
    if (colonActor) {
      const box = context.addBox({
        id: colonActor.id,
        title: colonActor.title,
        shape: "actor",
      });
      if (box) {
        box.isBusiness = colonActor.isBusiness;
        box.style = context.diagram?.actorStyle || "default";
      }
      return true;
    }

    // Try keyword actor
    const keywordActor = parseKeywordActor(cleanLine);
    if (keywordActor) {
      const box = context.addBox({
        id: keywordActor.id,
        title: keywordActor.title,
        shape: "actor",
      });
      if (box) {
        box.isBusiness = keywordActor.isBusiness;
        box.style = context.diagram?.actorStyle || "default";
      }
      return true;
    }

    return false;
  },
};
