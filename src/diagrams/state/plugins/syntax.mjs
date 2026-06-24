/**
 * State-diagram specific syntax plugins.
 * @module diagrams/state/plugins/syntax
 */

import {
  classifyArrow,
  normalisePlantUmlText,
  slug,
  stripQuotes,
  STEREOTYPE,
} from "../../../util/plantuml_utils.mjs";

const STATE_HEADER = /^state\s+(.+?)(?:\s+as\s+([A-Za-z_][\w.-]*))?(?:\s+#[^\s{]+)?(\s*\{)?$/i;
const STATE_DESCRIPTION = /^([A-Za-z_][\w.-]*)\s*:\s*(.+)$/;
const STATE_TRANSITION =
  /^(\[\*\]|\[H\*?]|\S+)\s+([-.*o<|>]+(?:\[[^\]]+\])?(?:up|down|left|right|UP|DOWN|LEFT|RIGHT)?[-.*o<|>]*)\s+(\[\*\]|\[H\*?]|\S+)(?:\s*:\s*(.+))?$/;
const PSEUDOSTATE_PATTERN = /^\[\*\]|^\[H\]|^\[H\*\]/i;
const CONCURRENT_SEPARATOR = /^\s*(--|\|\|)\s*$/;

/**
 * @typedef {{id:string,title:string,kind:string,stereotype:string}} ParsedState
 */

/**
 * Parse a state declaration.
 * @param {string} raw Raw declaration body after the keyword.
 * @returns {ParsedState|null}
 */
function parseStateDeclaration(raw) {
  let body = raw.replace(/\s*\{\s*$/, "").trim();
  if (!body) return null;

  let stereotype = "";
  const stereotypeMatch = body.match(STEREOTYPE);
  if (stereotypeMatch) {
    stereotype = stereotypeMatch[1].trim();
    body = body.replace(stereotypeMatch[0], "").trim();
  }
  body = body.replace(/\s+#[^\s{]+$/u, "").trim();

  // Check for pseudostate stereotypes
  let kind = "state";
  if (stereotype) {
    const lower = stereotype.toLowerCase();
    if (
      [
        "start",
        "end",
        "choice",
        "fork",
        "join",
        "history",
        "history*",
        "entrypoint",
        "exitpoint",
        "inputpin",
        "outputpin",
      ].includes(lower)
    ) {
      kind = lower.replace("*", "_deep");
    }
  }

  const aliasMatch = body.match(/^("[^"]+"|.+?)\s+as\s+([A-Za-z_][\w.-]*)$/i);
  if (aliasMatch) {
    const title = stripQuotes(aliasMatch[1].trim());
    return { id: aliasMatch[2], title, kind, stereotype };
  }

  const title = stripQuotes(body);
  const id = body.startsWith('"') ? slug(title) : body.split(/\s+/)[0];
  return { id, title, kind, stereotype };
}

/**
 * @param {Record<string, any>} ctx
 * @param {string} raw
 * @param {"from"|"to"} side
 * @returns {{id:string,shorthand:boolean}}
 */
function stateEndpoint(ctx, raw, side) {
  if (raw === "[*]") {
    const id = side === "from" ? "state_start" : "state_end";
    if (!ctx.boxes.has(id)) {
      ctx.addBox({ id, title: "", shape: side === "from" ? "start" : "end" });
    }
    return { id, shorthand: false };
  }
  if (/^\[H\*?]$/i.test(raw)) {
    const deep = /\*/.test(raw);
    const id = deep ? "history_deep" : "history";
    if (!ctx.boxes.has(id)) ctx.addBox({ id, title: deep ? "H*" : "H", shape: id });
    return { id, shorthand: false };
  }
  return { id: stripQuotes(raw), shorthand: false };
}

/**
 * @param {string} line
 * @param {Record<string, any>} ctx
 * @returns {boolean}
 */
function queueStateTransition(line, ctx) {
  const match = line.match(STATE_TRANSITION);
  if (!match) return false;
  const [, rawFrom, op, rawTo, label] = match;
  const arrow = classifyArrow(op);
  if (!arrow) return false;
  const from = stateEndpoint(ctx, rawFrom, "from");
  const to = stateEndpoint(ctx, rawTo, "to");
  ctx.queueConnection({
    fromId: from.id,
    toId: to.id,
    fromShorthand: false,
    toShorthand: false,
    label: normalisePlantUmlText(label || ""),
    ...arrow,
  });
  return true;
}

/**
 * State declaration plugin.
 * Handles: state Name, state "Long Name" as alias, state Name { ... }
 * @public
 */
export const stateDeclarationPlugin = {
  name: "state.declaration",
  /**
   * @param {string} line
   * @param {Record<string, any>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const match = line.match(STATE_HEADER);
    if (!match) return false;

    const parsed = parseStateDeclaration(match[1]);
    if (!parsed) return false;

    const id = match[2] || parsed.id;
    const isBlock = !!match[3];
    if (isBlock) return false;

    ctx.addBox({
      id,
      title: parsed.title,
      shape: parsed.kind,
      stereotype: parsed.stereotype,
    });

    if (isBlock) {
      ctx.enterBlock(id, {
        onLine: (/** @type {string} */ innerLine, /** @type {Record<string, any>} */ innerCtx) => {
          // Handle state body content
          if (innerLine.trim() === "}") return { endBlock: true };

          // Handle state descriptions inside block
          const descMatch = innerLine.match(STATE_DESCRIPTION);
          if (descMatch && descMatch[1] === id) {
            const box = innerCtx.boxes.get(id);
            if (box) {
              if (!box.members) box.members = [];
              box.members.push(descMatch[2]);
            }
            return true;
          }

          // Handle nested states
          const nestedMatch = innerLine.match(STATE_HEADER);
          if (nestedMatch) {
            const nestedParsed = parseStateDeclaration(nestedMatch[1]);
            if (nestedParsed) {
              const nestedId = nestedMatch[2] || nestedParsed.id;
              innerCtx.addBox({
                id: nestedId,
                title: nestedParsed.title,
                shape: nestedParsed.kind,
                stereotype: nestedParsed.stereotype,
                parent: id,
              });
            }
            return true;
          }

          return false;
        },
        tryEnd: (/** @type {string} */ endLine) => endLine.trim() === "}",
      });
    }

    return true;
  },
};

/**
 * Pseudostate declaration plugin.
 * Handles: [*], [H], [H*] and their shorthand forms
 * @public
 */
export const pseudostateDeclarationPlugin = {
  name: "state.pseudostate",
  /**
   * @param {string} line
   * @param {Record<string, any>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    // Handle [*] as start/end state
    if (line.trim() === "[*]") {
      // [*] is typically used in transitions, not as standalone declaration
      // But we can create an implicit start state if needed
      return false;
    }

    // Handle [H] and [H*] history states
    const historyMatch = line.match(/^\[H\*?\]\s*$/i);
    if (historyMatch) {
      const isDeep = line.includes("H*");
      ctx.addBox({
        id: `history_${ctx.boxes.size}`,
        title: isDeep ? "H*" : "H",
        shape: isDeep ? "history_deep" : "history",
      });
      return true;
    }

    return false;
  },
};

/**
 * Composite state plugin.
 * Handles nested state blocks and concurrent regions.
 * @public
 */
export const compositeStatePlugin = {
  name: "state.composite",
  /**
   * @param {string} line
   * @param {Record<string, any>} ctx
   * @returns {boolean|object}
   */
  tryStart(line, ctx) {
    const match = line.match(STATE_HEADER);
    if (!match || !match[3]) return false;

    const parsed = parseStateDeclaration(match[1]);
    if (!parsed) return false;

    const id = match[2] || parsed.id;

    ctx.addBox({
      id,
      title: parsed.title,
      shape: parsed.kind,
      stereotype: parsed.stereotype,
      isContainer: true,
    });

    return {
      onLine: (/** @type {string} */ innerLine, /** @type {Record<string, any>} */ innerCtx) => {
        const trimmed = innerLine.trim();
        if (trimmed === "}") return { endBlock: true };

        // Handle concurrent region separator
        if (CONCURRENT_SEPARATOR.test(trimmed)) {
          const box = innerCtx.boxes.get(id);
          if (box) {
            if (!box.regions) box.regions = [];
            box.regions.push({ separator: trimmed });
          }
          return true;
        }

        // Handle state descriptions
        const descMatch = innerLine.match(STATE_DESCRIPTION);
        if (descMatch) {
          const targetId = descMatch[1];
          const box = innerCtx.boxes.get(targetId);
          if (box) {
            if (!box.members) box.members = [];
            box.members.push(descMatch[2]);
          }
          return true;
        }

        if (queueStateTransition(trimmed, innerCtx)) return true;

        return false;
      },
      tryEnd: (/** @type {string} */ endLine) => endLine.trim() === "}",
    };
  },
};

/**
 * State description plugin.
 * Handles: StateName : description text
 * @public
 */
export const stateDescriptionPlugin = {
  name: "state.description",
  /**
   * @param {string} line
   * @param {Record<string, any>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    const match = line.match(STATE_DESCRIPTION);
    if (!match) return false;

    const id = match[1];
    const box =
      ctx.boxes.get(id) ||
      ctx.addBox({ id, title: normalisePlantUmlText(id), shape: "state", members: [] });

    if (!box.members) box.members = [];
    box.members.push(normalisePlantUmlText(match[2]));
    return true;
  },
};

/**
 * State transition plugin. Handles state pseudo endpoints such as `[*]`.
 * @public
 */
export const stateTransitionPlugin = {
  name: "state.transition",
  /**
   * @param {string} line
   * @param {Record<string, any>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    return queueStateTransition(line, ctx);
  },
};

/**
 * Concurrent region plugin.
 * Handles -- and || separators within composite states.
 * @public
 */
export const concurrentRegionPlugin = {
  name: "state.concurrent",
  /**
   * @param {string} line
   * @param {Record<string, any>} ctx
   * @returns {boolean}
   */
  tryLine(line, ctx) {
    if (!CONCURRENT_SEPARATOR.test(line.trim())) return false;

    // Mark current container as having concurrent regions
    const currentContainer = ctx.currentContainer;
    if (currentContainer) {
      const box = ctx.boxes.get(currentContainer);
      if (box) {
        box.hasConcurrentRegions = true;
      }
    }

    return true;
  },
};
