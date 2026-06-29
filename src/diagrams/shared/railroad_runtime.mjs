/**
 * Shared parser/runtime helpers for railroad-like grammar diagrams.
 * @module diagrams/shared/railroad_runtime
 */

import { Box, Connection, Diagram, Plane } from "../../general/model/diagram.mjs";
import { slug, stripQuotes } from "../../util/plantuml_utils.mjs";
import { GRAPH_RENDERERS, layoutGraphModel } from "./graph_runtime.mjs";

const MAX_TOKENS = 1_000;

/** @public */
export const railroadRenderers = GRAPH_RENDERERS;

/** @public */
export const layoutRailroadDiagram = layoutGraphModel;

/**
 * @param {string} text Source text.
 * @param {string} startDirective Start directive.
 * @param {string} endDirective End directive.
 * @returns {boolean}
 */
export function detectRailroadDiagram(text, startDirective, endDirective) {
  const lower = text.toLowerCase();
  return lower.includes(startDirective) || lower.includes(endDirective);
}

/**
 * @param {string[]} lines Raw source lines.
 * @param {string} startDirective Start directive.
 * @param {string} endDirective End directive.
 * @returns {string[]}
 */
export function prepareRailroadLines(lines, startDirective, endDirective) {
  return lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return trimmed !== startDirective && trimmed !== endDirective && trimmed !== "@enduml";
  });
}

/**
 * @param {"regex"|"ebnf"} kind Diagram kind.
 * @returns {Record<string, any>}
 */
export function createRailroadParseContext(kind) {
  const diagram = new Diagram();
  diagram.kind = kind;
  diagram.title = "";
  const plane = diagram.addPlane(new Plane({ id: `${kind}-plane`, title: kind.toUpperCase() }));
  /** @type {Record<string, any>} */
  const ctx = { diagram, plane, kind, title: "", body: [], styles: [], options: [] };
  ctx.finalize = () => {
    ctx.result = finalizeRailroadDiagram(ctx, kind);
  };
  return ctx;
}

/**
 * @param {Record<string, any>} ctx Parse context.
 * @param {string} line Source line.
 * @returns {boolean}
 */
export function collectRailroadLine(ctx, line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^title\s+/i.test(trimmed)) {
    ctx.title = trimmed.replace(/^title\s+/i, "").trim();
    ctx.diagram.title = ctx.title;
    return true;
  }
  if (/^!option\s+/i.test(trimmed) || /^!pragma\s+/i.test(trimmed)) {
    ctx.options.push(trimmed);
    return true;
  }
  if (/^<style>/i.test(trimmed) || ctx.inStyle) {
    ctx.styles.push(line);
    ctx.inStyle = !/<\/style>/i.test(trimmed);
    return true;
  }
  ctx.body.push(line);
  return true;
}

/**
 * @param {Record<string, any>} ctx Parse context.
 * @param {"regex"|"ebnf"} kind Diagram kind.
 * @returns {Diagram}
 */
export function finalizeRailroadDiagram(ctx, kind) {
  const expressions = kind === "regex" ? parseRegexBody(ctx.body) : parseEbnfBody(ctx.body);
  buildRailroadGraph(ctx, expressions, kind);
  return ctx.diagram;
}

/**
 * @param {string[]} lines Regex source body.
 * @returns {Array<{name:string, tokens:Array<{label:string,type:string}>}>}
 */
export function parseRegexBody(lines) {
  const source = lines.join("\n").trim();
  return [{ name: "pattern", tokens: tokenizeRegex(source) }];
}

/**
 * @param {string[]} lines EBNF source body.
 * @returns {Array<{name:string, tokens:Array<{label:string,type:string}>}>}
 */
export function parseEbnfBody(lines) {
  const source = lines.join("\n");
  const rules = splitEbnfRules(source);
  if (!rules.length) return [{ name: "grammar", tokens: [] }];
  return rules.map((rule) => ({ name: rule.name, tokens: tokenizeEbnf(rule.body) }));
}

/** @param {string} source @returns {Array<{label:string,type:string}>} */
function tokenizeRegex(source) {
  /** @type {Array<{label:string,type:string}>} */
  const tokens = [];
  let i = 0;
  while (i < source.length && tokens.length < MAX_TOKENS) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "\\") {
      if (source.startsWith("\\Q", i)) {
        const end = source.indexOf("\\E", i + 2);
        const literal = end >= 0 ? source.slice(i + 2, end) : source.slice(i + 2);
        tokens.push({ label: literal || "\\Q\\E", type: "literal" });
        i = end >= 0 ? end + 2 : source.length;
        continue;
      }
      const unicode = source
        .slice(i)
        .match(/^\\(?:u[0-9a-fA-F]{4}|x\{[^}]+\}|p\{[^}]+\}|P\{[^}]+\}|[0-7]{2,4}|.)/);
      const label = unicode ? unicode[0] : source.slice(i, i + 2);
      tokens.push({ label, type: "escape" });
      i += label.length;
      continue;
    }
    if (ch === "[") {
      const end = findClosing(source, i, "[", "]");
      tokens.push({ label: end >= 0 ? source.slice(i, end + 1) : source.slice(i), type: "class" });
      i = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (ch === "(") {
      const end = findClosing(source, i, "(", ")");
      const raw = end >= 0 ? source.slice(i, end + 1) : source.slice(i);
      tokens.push({ label: raw, type: /^(?:\(\?[:=!<])/.test(raw) ? "assertion" : "group" });
      i = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (ch === "|") {
      tokens.push({ label: "or", type: "alternative" });
      i++;
      continue;
    }
    if ("?+*".includes(ch)) {
      tokens.push({ label: ch, type: "quantifier" });
      i++;
      continue;
    }
    if (ch === "{") {
      const end = findClosing(source, i, "{", "}");
      tokens.push({
        label: end >= 0 ? source.slice(i, end + 1) : source.slice(i),
        type: "quantifier",
      });
      i = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if ("^$.".includes(ch)) {
      tokens.push({
        label: ch === "." ? "any character" : ch,
        type: ch === "." ? "class" : "anchor",
      });
      i++;
      continue;
    }
    let end = i + 1;
    while (end < source.length && !/[\\[\](){}|?+*^$.\s]/.test(source[end])) end++;
    tokens.push({ label: source.slice(i, end), type: "literal" });
    i = end;
  }
  return tokens;
}

/** @param {string} source @returns {Array<{name:string,body:string}>} */
function splitEbnfRules(source) {
  const rules = [];
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== ";") continue;
    const chunk = source.slice(start, i).trim();
    start = i + 1;
    const eq = chunk.indexOf("=");
    if (eq <= 0) continue;
    rules.push({ name: chunk.slice(0, eq).trim(), body: chunk.slice(eq + 1).trim() });
  }
  return rules;
}

/** @param {string} source @returns {Array<{label:string,type:string}>} */
function tokenizeEbnf(source) {
  /** @type {Array<{label:string,type:string}>} */
  const tokens = [];
  let i = 0;
  while (i < source.length && tokens.length < MAX_TOKENS) {
    const ch = source[i];
    if (/\s|,/.test(ch)) {
      i++;
      continue;
    }
    if (source.startsWith("(*", i)) {
      const end = source.indexOf("*)", i + 2);
      tokens.push({
        label: end >= 0 ? source.slice(i + 2, end).trim() : source.slice(i + 2),
        type: "note",
      });
      i = end >= 0 ? end + 2 : source.length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = findQuoteEnd(source, i, ch);
      tokens.push({
        label: stripQuotes(end >= 0 ? source.slice(i, end + 1) : source.slice(i)),
        type: "terminal",
      });
      i = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (ch === "?") {
      const end = source.indexOf("?", i + 1);
      tokens.push({
        label: end >= 0 ? source.slice(i + 1, end).trim() : source.slice(i + 1),
        type: "special",
      });
      i = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (ch === "[" || ch === "{" || ch === "(") {
      const close = ch === "[" ? "]" : ch === "{" ? "}" : ")";
      const end = findClosing(source, i, ch, close);
      const label = end >= 0 ? source.slice(i + 1, end).trim() : source.slice(i + 1).trim();
      tokens.push({ label, type: ch === "[" ? "optional" : ch === "{" ? "repeat" : "group" });
      i = end >= 0 ? end + 1 : source.length;
      continue;
    }
    if (ch === "|") {
      tokens.push({ label: "or", type: "alternative" });
      i++;
      continue;
    }
    if (ch === "*") {
      tokens.push({ label: "repeat count", type: "quantifier" });
      i++;
      continue;
    }
    let end = i + 1;
    while (end < source.length && !/[\s,;"'?[{(|*)}]/.test(source[end])) end++;
    tokens.push({ label: source.slice(i, end), type: "nonterminal" });
    i = end;
  }
  return tokens;
}

/**
 * @param {Record<string, any>} ctx Context.
 * @param {Array<{name:string,tokens:Array<{label:string,type:string}>}>} expressions Expressions.
 * @param {string} kind Diagram kind.
 */
function buildRailroadGraph(ctx, expressions, kind) {
  let boxIndex = 0;
  for (const expression of expressions) {
    const start = addBox(ctx, `${expression.name} start`, "start", boxIndex++);
    const nameBox = addBox(ctx, expression.name, "rectangle", boxIndex++);
    connect(ctx, start, nameBox, "");
    let previous = nameBox;
    for (const token of expression.tokens.length
      ? expression.tokens
      : [{ label: "(empty)", type: "terminal" }]) {
      const box = addBox(ctx, token.label, shapeForToken(token.type), boxIndex++, token.type);
      connect(ctx, previous, box, token.type === "alternative" ? "branch" : "");
      previous = box;
    }
    const end = addBox(ctx, `${expression.name} end`, "end", boxIndex++);
    connect(ctx, previous, end, "");
  }
  if (ctx.title) ctx.plane.title = `${kind.toUpperCase()}: ${ctx.title}`;
}

/** @param {Record<string, any>} ctx @param {string} title @param {string} shape @param {number} index @param {string} [description] */
function addBox(ctx, title, shape, index, description = "") {
  const box = new Box({
    id: `${ctx.kind}-${index}-${slug(title || "empty")}`,
    title: title || "(empty)",
    description,
    shape,
  });
  ctx.plane.addBox(box);
  return box;
}

/** @param {Record<string, any>} ctx @param {Box} from @param {Box} to @param {string} label */
function connect(ctx, from, to, label) {
  const connection = new Connection({
    id: `${from.id}-to-${to.id}`,
    from,
    to,
    label,
    directionHint: "right",
  });
  ctx.diagram.addConnection(connection);
}

/** @param {string} type */
function shapeForToken(type) {
  if (type === "alternative") return "diamond";
  if (type === "note") return "note";
  if (type === "anchor") return "fork";
  return "rectangle";
}

/** @param {string} source @param {number} start @param {string} open @param {string} close */
function findClosing(source, start, open, close) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "\\") {
      i++;
      continue;
    }
    if (source[i] === open) depth++;
    else if (source[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** @param {string} source @param {number} start @param {string} quote */
function findQuoteEnd(source, start, quote) {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i;
  }
  return -1;
}
