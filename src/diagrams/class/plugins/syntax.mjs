/**
 * Class-diagram specific syntax that does not belong in the shared graph
 * plugins.
 * @module diagrams/class/plugins/syntax
 */

import {
  classifyArrow,
  extractPlantUmlLink,
  normalisePlantUmlText,
  slug,
  stripQuotes,
} from "../../../util/plantuml_utils.mjs";

const CLASS_MEMBER_LINE = /^("[^"]+"|[A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*)\s+:\s*(.+)$/;
const JSON_HEADER = /^(json|object)\s+(.+?)(\s*\{)?$/;
const QUALIFIED_ASSOCIATION =
  /^("[^"]+"|[A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*)\s+\[([^\]]+)]\s+([-.*o<|>]+(?:\[[^\]]+\])?(?:up|down|left|right|UP|DOWN|LEFT|RIGHT)?[-.*o<|>]*)\s+(?:"([^"]*)"\s+)?("[^"]+"|[A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*)(?:\s*:\s*(.+))?$/;

/**
 * @param {string} raw
 * @returns {{id:string,title:string}}
 */
function parseAliasableName(raw) {
  const body = raw.trim();
  const alias = body.match(/^("[^"]+"|.+?)\s+as\s+([A-Za-z_$][\w$.-]*)$/i);
  if (alias) {
    const title = stripQuotes(alias[1].trim());
    return { id: alias[2], title };
  }
  const title = stripQuotes(body);
  return { id: body.startsWith('"') ? slug(title) : body.split(/\s+/)[0], title };
}

/**
 * @param {string} raw
 * @returns {{id:string,portId:string|null}}
 */
function parseEndpoint(raw) {
  const token = raw.trim();
  const member = token.match(/^(.+?)::(.+)$/);
  if (member) return { id: stripQuotes(member[1].trim()), portId: stripQuotes(member[2].trim()) };
  const title = stripQuotes(token);
  return { id: token.startsWith('"') ? slug(title) : token, portId: null };
}

/**
 * Append a member row to a class-like box, creating the class when PlantUML
 * implicitly declares it through `Class : member`.
 * @param {any} ctx
 * @param {string} rawTarget
 * @param {string} rawMember
 */
function appendClassMember(ctx, rawTarget, rawMember) {
  const target = parseEndpoint(rawTarget);
  const title = stripQuotes(rawTarget.trim());
  const box =
    ctx.boxes.get(target.id) ||
    ctx.addBox({ id: target.id, title: normalisePlantUmlText(title), shape: "class" });
  const member = normalisePlantUmlText(rawMember.trim());
  if (member && !box.members.includes(member)) box.members.push(member);
}

/**
 * Official class syntax allows `Class : fieldOrMethod` outside the block.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const classMemberLinePlugin = {
  name: "class.memberLine",
  tryLine(line, ctx) {
    const match = line.match(CLASS_MEMBER_LINE);
    if (!match) return false;
    appendClassMember(ctx, match[1], match[2]);
    return true;
  },
};

/**
 * Display JSON data inside a class diagram. The graph model has no JSON table
 * primitive, so JSON rows are represented as deterministic members on a map
 * box. Object blocks use the existing object shape.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const classJsonObjectPlugin = {
  name: "class.jsonObject",
  tryStart(line, ctx) {
    const match = line.match(JSON_HEADER);
    if (!match || !match[3]) return null;
    const [, keyword, body] = match;
    const parsed = parseAliasableName(body.replace(/\s*\{\s*$/, ""));
    const shape = keyword.toLowerCase() === "json" ? "map" : "object";
    const box = ctx.addBox({
      id: parsed.id,
      title: normalisePlantUmlText(parsed.title),
      shape,
      members: [],
    });
    return {
      onLine(bodyLine) {
        if (!bodyLine || bodyLine === "--") return;
        const member = normalisePlantUmlText(bodyLine.trim());
        if (member) box.members.push(member);
      },
      tryEnd(bodyLine) {
        return bodyLine === "}";
      },
    };
  },
  tryLine(line, ctx) {
    const match = line.match(JSON_HEADER);
    if (!match || match[3]) return false;
    const [, keyword, body] = match;
    const parsed = parseAliasableName(body);
    ctx.addBox({
      id: parsed.id,
      title: normalisePlantUmlText(parsed.title),
      shape: keyword.toLowerCase() === "json" ? "map" : "object",
    });
    return true;
  },
};

/**
 * Qualified associations: `Class [qualifier] -- Other`. The qualifier is
 * exposed as a source-side port so renderers can anchor the edge close to the
 * named qualifier/member.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const qualifiedAssociationPlugin = {
  name: "class.qualifiedAssociation",
  tryLine(line, ctx) {
    const match = line.match(QUALIFIED_ASSOCIATION);
    if (!match) return false;
    const [, rawFrom, qualifier, op, toMul, rawTo, label] = match;
    const arrow = classifyArrow(op);
    if (!arrow) return false;
    const from = parseEndpoint(rawFrom);
    const to = parseEndpoint(rawTo);
    const parsedLabel = extractPlantUmlLink(label?.trim() || "");
    ctx.addPort({ boxId: from.id, portId: qualifier.trim(), side: "right", direction: "out" });
    ctx.queueConnection({
      fromId: from.id,
      toId: to.id,
      fromPort: qualifier.trim(),
      toPort: to.portId,
      label: normalisePlantUmlText(parsedLabel.text),
      link: parsedLabel.link,
      tooltip: parsedLabel.tooltip,
      toMul: normalisePlantUmlText(toMul || ""),
      ...arrow,
    });
    return true;
  },
};
