// Box / shape declarations: bracket shorthand, usecase parens, and the
// keyword-prefixed forms (component / actor / database / cloud / interface
// / entity / class / rectangle / boundary / control / queue / artifact / node-without-brace
// / usecase).
//
// `class X { … }` is a special case: the brace introduces a member list
// rather than a nested container, so this plugin uses the engine's block
// mode to consume the body.

import { STEREOTYPE, slug, unescapeLabel, normaliseShape } from "../../../util/plantuml_utils.mjs";

const BOX_BRACKET = /^\[([^\]]+)\](?:\s*<<\s*[^>]+\s*>>)?(?:\s+as\s+(\S+))?(?:\s*:\s*(.+))?$/;
const USECASE_PARENS = /^\(([^)]+)\)(?:\s+as\s+(\S+))?(?:\s*:\s*(.+))?$/;
const INTERFACE_CIRCLE = /^\(\)\s+(?:"([^"]+)"|(\S+))(?:\s+as\s+(\S+))?(?:\s*:\s*(.+))?$/;

const SHAPE_KEYWORDS = [
  "component",
  "actor",
  "usecase",
  "database",
  "node",
  "cloud",
  "interface",
  "entity",
  "class",
  "rectangle",
  "boundary",
  "control",
  "queue",
  "artifact",
];
const SHAPE_LINE = new RegExp(
  `^(${SHAPE_KEYWORDS.join("|")})\\s+(?:"([^"]+)"|(\\S+))` +
    `(?:\\s*<<\\s*[^>]+\\s*>>)?` +
    `(?:\\s+as\\s+(\\S+))?` +
    `(?:\\s*:\\s*(.+))?` +
    `(\\s*\\{)?$`,
);

/**
 * Bracket shorthand: `[Label] [as alias] [: description]`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const bracketBoxPlugin = {
  name: "component.bracketBox",
  tryLine(line, ctx) {
    const m = line.match(BOX_BRACKET);
    if (!m) return false;
    const [, label, alias, description] = m;
    const stereo = (line.match(STEREOTYPE) || [])[1] || "";
    ctx.addBox({
      id: alias || slug(label),
      title: unescapeLabel(label),
      description: unescapeLabel(description?.trim() || ""),
      shape: "rectangle",
      stereotype: stereo,
    });
    return true;
  },
};

/**
 * Use-case parens shorthand: `(Label) [as alias]`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const usecaseParensPlugin = {
  name: "component.usecaseParens",
  tryLine(line, ctx) {
    const circle = line.match(INTERFACE_CIRCLE);
    if (circle) {
      const [, qTitle, bareId, alias, description] = circle;
      ctx.addBox({
        id: alias || bareId || slug(qTitle),
        title: unescapeLabel(qTitle || bareId || alias),
        description: unescapeLabel(description?.trim() || ""),
        shape: "interface",
      });
      return true;
    }

    const m = line.match(USECASE_PARENS);
    if (!m) return false;
    const [, label, alias, description] = m;
    ctx.addBox({
      id: alias || slug(label),
      title: unescapeLabel(label),
      description: unescapeLabel(description?.trim() || ""),
      shape: "usecase",
    });
    return true;
  },
};

/**
 * Keyword-prefixed shape (`component`, `actor`, `database`, …) plus
 * the special-cased `class X { … }` member block.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const shapeKeywordPlugin = {
  name: "component.shapeKeyword",
  tryStart(line, ctx) {
    const m = line.match(SHAPE_LINE);
    if (!m) return null;
    const [, shapeKw, qTitle, bareId, alias, description, opensBrace] = m;
    // `class X { … }` → enter member-collection block.
    if (opensBrace && shapeKw === "class") {
      const stereo = (line.match(STEREOTYPE) || [])[1] || "";
      const id = alias || bareId || slug(qTitle);
      const box = ctx.addBox({
        id,
        title: unescapeLabel(qTitle || bareId || alias),
        description: unescapeLabel(description?.trim() || ""),
        shape: "class",
        stereotype: stereo,
        members: [],
      });
      /** @type {string[]} */
      const collected = [];
      return {
        onLine(memberLine) {
          collected.push(memberLine);
        },
        tryEnd(memberLine) {
          if (memberLine !== "}") return false;
          box.members = collected;
          return true;
        },
      };
    }
    return null;
  },
  tryLine(line, ctx) {
    const m = line.match(SHAPE_LINE);
    if (!m) return false;
    const [, shapeKw, qTitle, bareId, alias, description, opensBrace] = m;
    // Non-class brace forms (e.g. `node X { … }`) become containers.
    if (opensBrace) {
      ctx.openContainer({
        id: alias || bareId || slug(qTitle),
        title: qTitle || bareId || alias,
        kind: shapeKw,
      });
      return true;
    }
    const stereo = (line.match(STEREOTYPE) || [])[1] || "";
    ctx.addBox({
      id: alias || bareId || slug(qTitle),
      title: unescapeLabel(qTitle || bareId || alias),
      description: unescapeLabel(description?.trim() || ""),
      shape: normaliseShape(shapeKw),
      stereotype: stereo,
    });
    return true;
  },
};
