/**
 * Object-diagram specific syntax plugins.
 * @module diagrams/object/plugins/syntax
 */

import {
  classifyArrow,
  slug,
  stripQuotes,
  STEREOTYPE,
  unescapeLabel,
} from "../../../util/plantuml_utils.mjs";

const OBJECT_HEADER = /^object\s+(.+?)(\s*\{)?$/i;
const MAP_HEADER = /^map\s+(.+?)(\s*\{)?$/i;
const DIAMOND_DECLARATION = /^diamond\s+(.+)$/i;
const OBJECT_FIELD = /^("[^"]+"|[A-Za-z_][\w.-]*)\s*:\s*(.+)$/;
const MAP_ASSIGNMENT = /^(.+?)\s*=>\s*(.*)$/;
const MAP_ROW_CONNECTION =
  /^(.+?)\s+([-.*o<|>]+(?:\[[^\]]+\])?(?:up|down|left|right|UP|DOWN|LEFT|RIGHT)?[-.*o<|>]*)\s+(.+)$/;

/**
 * @typedef {{id:string,title:string,stereotype:string}} ParsedDeclaration
 */

/**
 * Parse an aliasable PlantUML declaration tail such as `"User One" as u1`.
 * @param {string} raw Raw declaration body after the keyword.
 * @returns {ParsedDeclaration|null}
 */
function parseDeclaration(raw) {
  let body = raw.replace(/\s*\{\s*$/, "").trim();
  if (!body) return null;

  let stereotype = "";
  const stereotypeMatch = body.match(STEREOTYPE);
  if (stereotypeMatch) {
    stereotype = stereotypeMatch[1].trim();
    body = body.replace(stereotypeMatch[0], "").trim();
  }

  const aliasMatch = body.match(/^("[^"]+"|.+?)\s+as\s+([A-Za-z_][\w.-]*)$/i);
  if (aliasMatch) {
    const title = stripQuotes(aliasMatch[1].trim());
    return { id: aliasMatch[2], title, stereotype };
  }

  const title = stripQuotes(body);
  const id = body.startsWith('"') ? slug(title) : body.split(/\s+/)[0];
  return { id, title, stereotype };
}

/**
 * @param {string} raw Raw endpoint token.
 * @returns {{id:string,shorthand:boolean,portId:string|null}}
 */
function normaliseEndpoint(raw) {
  const token = raw.trim();
  const portMatch = token.match(/^([^:]+)::(.+)$/);
  if (portMatch) return { id: portMatch[1], shorthand: false, portId: portMatch[2] };
  if (token.startsWith("[") && token.endsWith("]")) {
    return { id: slug(token.slice(1, -1)), shorthand: true, portId: null };
  }
  if (token.startsWith("(") && token.endsWith(")")) {
    return { id: slug(token.slice(1, -1)), shorthand: true, portId: null };
  }
  if (token.startsWith('"') && token.endsWith('"')) {
    return { id: slug(token.slice(1, -1)), shorthand: true, portId: null };
  }
  return { id: token, shorthand: false, portId: null };
}

/**
 * @param {string} raw Raw map key.
 * @returns {string}
 */
function portId(raw) {
  return stripQuotes(raw.trim());
}

/**
 * @param {Record<string, any>} ctx Parse context.
 * @param {string} id Box id.
 * @param {string} member Member row to append.
 * @param {"object"|"map"} shape Shape used if the box must be auto-declared.
 * @returns {void}
 */
function appendMember(ctx, id, member, shape) {
  const title = stripQuotes(id);
  const box = ctx.boxes.get(id) || ctx.addBox({ id, title, shape });
  if (!box.members.includes(member)) box.members.push(member);
}

/**
 * @param {Record<string, any>} ctx Parse context.
 * @param {string} boxId Owning map id.
 * @param {string} key Raw row key.
 * @returns {void}
 */
function addMapPort(ctx, boxId, key) {
  const id = portId(key);
  if (!id) return;
  ctx.addPort({ boxId, portId: id, side: "right", direction: "out" });
}

/**
 * Handle an object body member line.
 * @param {string} line Input line inside an object block.
 * @param {Record<string, any>} ctx Parse context.
 * @param {string} objectId Owning object id.
 * @returns {void}
 */
function handleObjectBodyLine(line, ctx, objectId) {
  if (!line || line === "--") return;
  appendMember(ctx, objectId, unescapeLabel(line), "object");
}

/**
 * Handle a map body row.
 * @param {string} line Input line inside a map block.
 * @param {Record<string, any>} ctx Parse context.
 * @param {string} mapId Owning map id.
 * @returns {void}
 */
function handleMapBodyLine(line, ctx, mapId) {
  if (!line || line === "--") return;

  const assignment = line.match(MAP_ASSIGNMENT);
  if (assignment) {
    const [, key, value] = assignment;
    const row = `${key.trim()} => ${value.trim()}`.trim();
    appendMember(ctx, mapId, unescapeLabel(row), "map");
    addMapPort(ctx, mapId, key);
    return;
  }

  const rowConnection = line.match(MAP_ROW_CONNECTION);
  if (rowConnection) {
    const [, key, op, rawTarget] = rowConnection;
    const arrow = classifyArrow(op);
    if (arrow) {
      const target = normaliseEndpoint(rawTarget);
      appendMember(ctx, mapId, unescapeLabel(key.trim()), "map");
      addMapPort(ctx, mapId, key);
      ctx.queueConnection({
        fromId: mapId,
        toId: target.id,
        fromPort: portId(key),
        toPort: target.portId,
        fromShorthand: false,
        toShorthand: target.shorthand,
        label: "",
        ...arrow,
      });
      return;
    }
  }

  appendMember(ctx, mapId, unescapeLabel(line), "map");
  addMapPort(ctx, mapId, line);
}

/** @type {import("../../../util/parser_engine.mjs").Plugin} */
export const objectDeclarationPlugin = {
  name: "object.object",
  tryStart(line, ctx) {
    const match = line.match(OBJECT_HEADER);
    if (!match || !match[2]) return null;
    const parsed = parseDeclaration(match[1]);
    if (!parsed) return null;
    ctx.addBox({ ...parsed, shape: "object" });
    return {
      onLine(bodyLine, bodyCtx) {
        handleObjectBodyLine(bodyLine, bodyCtx, parsed.id);
      },
      tryEnd(bodyLine) {
        return /^}$/.test(bodyLine);
      },
    };
  },
  tryLine(line, ctx) {
    const match = line.match(OBJECT_HEADER);
    if (!match || match[2]) return false;
    const parsed = parseDeclaration(match[1]);
    if (!parsed) return false;
    ctx.addBox({ ...parsed, shape: "object" });
    return true;
  },
};

/** @type {import("../../../util/parser_engine.mjs").Plugin} */
export const mapDeclarationPlugin = {
  name: "object.map",
  tryStart(line, ctx) {
    const match = line.match(MAP_HEADER);
    if (!match || !match[2]) return null;
    const parsed = parseDeclaration(match[1]);
    if (!parsed) return null;
    ctx.addBox({ ...parsed, shape: "map" });
    return {
      onLine(bodyLine, bodyCtx) {
        handleMapBodyLine(bodyLine, bodyCtx, parsed.id);
      },
      tryEnd(bodyLine) {
        return /^}$/.test(bodyLine);
      },
    };
  },
  tryLine(line, ctx) {
    const match = line.match(MAP_HEADER);
    if (!match || match[2]) return false;
    const parsed = parseDeclaration(match[1]);
    if (!parsed) return false;
    ctx.addBox({ ...parsed, shape: "map" });
    return true;
  },
};

/** @type {import("../../../util/parser_engine.mjs").Plugin} */
export const objectFieldPlugin = {
  name: "object.field",
  tryLine(line, ctx) {
    const match = line.match(OBJECT_FIELD);
    if (!match) return false;
    const [, rawTarget, field] = match;
    const target = stripQuotes(rawTarget.trim());
    const id = rawTarget.startsWith('"') ? slug(target) : target;
    appendMember(ctx, id, unescapeLabel(field.trim()), "object");
    return true;
  },
};

/** @type {import("../../../util/parser_engine.mjs").Plugin} */
export const diamondDeclarationPlugin = {
  name: "object.diamond",
  tryLine(line, ctx) {
    const match = line.match(DIAMOND_DECLARATION);
    if (!match) return false;
    const parsed = parseDeclaration(match[1]);
    if (!parsed) return false;
    ctx.addBox({ ...parsed, shape: "diamond" });
    return true;
  },
};
