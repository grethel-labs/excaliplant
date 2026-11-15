/**
 * Activity diagram (new syntax) parser. Produces a block tree:
 * sequences of actions and control structures (if/switch/while/repeat/
 * fork/split/partition), plus swimlane assignments.
 * @module diagrams/activity/parse
 */

import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColor, parseColorSpec } from "../../syntax/color.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { LimitError } from "../../core/errors.mjs";

/**
 * @typedef {object} ArrowStyle
 * @property {string | null} label
 * @property {string | null} color
 * @property {"solid" | "dashed" | "dotted"} lineStyle
 * @property {boolean} hidden
 */

/**
 * @typedef {(
 *  | { t: "start" | "stop" | "end" | "kill" | "detach" | "break", lane: string | null }
 *  | { t: "action", text: string, shape: string, fill: string | null, lane: string | null, stereotypes: string[] }
 *  | { t: "if", branches: { cond: string, label: string | null, body: Item[] }[], elseLabel: string | null, elseBody: Item[] | null, lane: string | null }
 *  | { t: "switch", test: string, cases: { label: string, body: Item[] }[], lane: string | null }
 *  | { t: "while", cond: string, label: string | null, endLabel: string | null, body: Item[], backward: Item[], lane: string | null }
 *  | { t: "repeat", body: Item[], cond: string, label: string | null, notLabel: string | null, startLabel: string | null, backward: Item[], lane: string | null }
 *  | { t: "fork", kind: "fork" | "split", merge: boolean, branches: Item[][], lane: string | null }
 *  | { t: "group", kind: string, text: string, fill: string | null, body: Item[] }
 *  | { t: "note", text: string, side: "left" | "right", fill: string | null, floating: boolean }
 *  | { t: "arrow", style: ArrowStyle }
 *  | { t: "connector", text: string, fill: string | null, lane: string | null }
 * )} Item
 */

/**
 * @typedef {object} ActivityModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {Item[]} body
 * @property {{ id: string, label: string, fill: string | null }[]} lanes
 */

/**
 * @typedef {object} ActivityContext
 * @property {LineReader} reader
 * @property {ActivityModel} model
 * @property {import("../../core/registry.mjs").ModuleContext} module
 * @property {string | null} lane
 * @property {number} count
 */

const ACTION_END = /[;|<>/\]}]\s*$/;

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 * @returns {ActivityModel}
 */
export function parseActivity(lines, module) {
  /** @type {ActivityModel} */
  const model = { meta: createMeta(), body: [], lanes: [] };
  /** @type {ActivityContext} */
  const ctx = { reader: new LineReader(lines), model, module, lane: null, count: 0 };
  model.body = parseSeq(ctx, () => false);
  return model;
}

/**
 * Parse items until `stop(line)` matches (the matching line is left unread).
 * @param {ActivityContext} ctx
 * @param {(line: string) => boolean} stop
 * @returns {Item[]}
 */
function parseSeq(ctx, stop) {
  /** @type {Item[]} */
  const items = [];
  const { reader } = ctx;
  while (!reader.done) {
    const src = /** @type {import("../../core/source.mjs").SourceLine} */ (reader.peek());
    const line = src.text.trim();
    if (!line) {
      reader.next();
      continue;
    }
    if (stop(line)) return items;
    reader.next();
    if (++ctx.count > ctx.module.limits.maxNodes * 4)
      throw new LimitError("Activity diagram too large");
    const item = parseItem(ctx, line, src.line);
    if (item) items.push(item);
  }
  return items;
}

/**
 * @param {ActivityContext} ctx
 * @param {string} line
 * @param {number} lineNo
 * @returns {Item | null}
 */
function parseItem(ctx, line, lineNo) {
  const { model, reader } = ctx;
  let m;
  const lane = () => ctx.lane;
  if (/^(start|stop|end|kill|detach|break)$/i.test(line)) {
    return { t: /** @type {any} */ (line.toLowerCase()), lane: lane() };
  }
  // swimlanes: |Lane|, |#color|Lane|, |alias| Label
  if ((m = /^\|(#[^|]+\|)?([^|]+)\|\s*(.*)$/.exec(line))) {
    const id = m[2].trim();
    if (!model.lanes.some((l) => l.id === id)) {
      model.lanes.push({
        id,
        label: label(m[3] || id),
        fill: m[1] ? parseColor(m[1].slice(0, -1)) : null,
      });
    }
    ctx.lane = id;
    return null;
  }
  // actions (possibly multi-line), optional colour prefix and stereotype
  if ((m = /^(#[\w#;:./|\\-]+?)?\s*(<<[^>]*>>)?\s*:(.*)$/s.exec(line))) {
    let text = m[3];
    while (!ACTION_END.test(text) && !reader.done) text += `\n${reader.next().text}`;
    const end = text.trimEnd().slice(-1);
    text = text.trimEnd().slice(0, -1);
    const fill = m[1] ? (parseColorSpec(m[1]).fill ?? null) : null;
    return {
      t: "action",
      text: label(text.replace(/^\s+|\s+$/g, "")),
      shape: end,
      fill,
      lane: lane(),
      stereotypes: m[2] ? [m[2].slice(2, -2)] : [],
    };
  }
  if ((m = /^-+(?:\[([^\]]*)\])?-*>\s*(.*?);?$/.exec(line))) {
    /** @type {ArrowStyle} */
    const style = {
      label: m[2] ? label(m[2]) : null,
      color: null,
      lineStyle: "solid",
      hidden: false,
    };
    for (const part of (m[1] ?? "").split(/[,;]/)) {
      const p = part.trim().toLowerCase();
      if (p === "dashed" || p === "dotted") style.lineStyle = p;
      else if (p === "hidden") style.hidden = true;
      else if (p) style.color = parseColor(part.trim()) ?? style.color;
    }
    return { t: "arrow", style };
  }
  if (
    (m = /^if\s*\((.*)\)\s*(?:(?:is|equals)\s*\((.*?)\)\s*)?then\s*(?:\((.*)\))?\s*$/i.exec(line))
  ) {
    /** @type {Extract<Item, { t: "if" }>} */
    const node = { t: "if", branches: [], elseLabel: null, elseBody: null, lane: lane() };
    let cond = label(m[1] + (m[2] ? ` = ${m[2]}` : ""));
    let lbl = m[3] ? label(m[3]) : null;
    for (;;) {
      const body = parseSeq(ctx, (l) => /^(elseif\b|else\b|endif\b|end\s+if\b)/i.test(l));
      node.branches.push({ cond, label: lbl, body });
      if (reader.done) break;
      const next = reader.next().text.trim();
      const ei =
        /^else\s*if\s*\((.*)\)\s*(?:(?:is|equals)\s*\((.*?)\)\s*)?then\s*(?:\((.*)\))?\s*$/i.exec(
          next,
        );
      if (ei) {
        cond = label(ei[1] + (ei[2] ? ` = ${ei[2]}` : ""));
        lbl = ei[3] ? label(ei[3]) : null;
        continue;
      }
      const el = /^else\s*(?:\((.*)\))?\s*$/i.exec(next);
      if (el) {
        node.elseLabel = el[1] ? label(el[1]) : null;
        node.elseBody = parseSeq(ctx, (l) => /^(endif|end\s+if)\b/i.test(l));
        if (!reader.done) reader.next();
      }
      break;
    }
    return node;
  }
  if ((m = /^switch\s*\((.*)\)\s*$/i.exec(line))) {
    /** @type {Extract<Item, { t: "switch" }>} */
    const node = { t: "switch", test: label(m[1]), cases: [], lane: lane() };
    parseSeq(ctx, (l) => /^(case\b|endswitch\b|end\s+switch\b)/i.test(l));
    while (!reader.done) {
      const next = reader.next().text.trim();
      const c = /^case\s*\((.*)\)\s*$/i.exec(next);
      if (!c) break;
      node.cases.push({
        label: label(c[1]),
        body: parseSeq(ctx, (l) => /^(case\b|endswitch\b|end\s+switch\b)/i.test(l)),
      });
    }
    return node;
  }
  if ((m = /^while\s*\((.*?)\)\s*(?:is\s*\((.*)\))?\s*$/i.exec(line))) {
    const body = parseSeq(ctx, (l) => /^(endwhile|end\s+while|backward\b)/i.test(l));
    /** @type {Item[]} */
    let backward = [];
    let next = reader.done ? "" : reader.next().text.trim();
    if (/^backward\b/i.test(next)) {
      const act = parseItem(ctx, next.replace(/^backward\s*/i, ""), lineNo);
      backward = act ? [act] : [];
      parseSeq(ctx, (l) => /^(endwhile|end\s+while)/i.test(l));
      next = reader.done ? "" : reader.next().text.trim();
    }
    const end = /\((.*)\)/.exec(next);
    return {
      t: "while",
      cond: label(m[1]),
      label: m[2] ? label(m[2]) : null,
      endLabel: end ? label(end[1]) : null,
      body,
      backward,
      lane: lane(),
    };
  }
  if ((m = /^repeat\s*(?::(.*);)?\s*$/i.exec(line))) {
    const body = parseSeq(ctx, (l) => /^(repeat\s*while|repeatwhile|backward\b)/i.test(l));
    /** @type {Item[]} */
    let backward = [];
    let next = reader.done ? "" : reader.next().text.trim();
    if (/^backward\b/i.test(next)) {
      const act = parseItem(ctx, next.replace(/^backward\s*/i, ""), lineNo);
      backward = act ? [act] : [];
      parseSeq(ctx, (l) => /^(repeat\s*while|repeatwhile)/i.test(l));
      next = reader.done ? "" : reader.next().text.trim();
    }
    const rw =
      /^repeat\s*while\s*(?:\((.*?)\))?\s*(?:is\s*\((.*?)\))?\s*(?:not\s*\((.*?)\))?\s*$/i.exec(
        next,
      );
    return {
      t: "repeat",
      body,
      cond: rw?.[1] ? label(rw[1]) : "",
      label: rw?.[2] ? label(rw[2]) : null,
      notLabel: rw?.[3] ? label(rw[3]) : null,
      startLabel: m[1] ? label(m[1]) : null,
      backward,
      lane: lane(),
    };
  }
  if ((m = /^(fork|split)\s*$/i.exec(line))) {
    const kind = /** @type {"fork" | "split"} */ (m[1].toLowerCase());
    /** @type {Item[][]} */
    const branches = [];
    let merge = false;
    for (;;) {
      branches.push(
        parseSeq(ctx, (l) =>
          new RegExp(`^(${kind}\\s+again|end\\s*${kind}|end\\s*merge)\\b`, "i").test(l),
        ),
      );
      if (reader.done) break;
      const next = reader.next().text.trim();
      if (/again/i.test(next)) continue;
      merge = /merge/i.test(next);
      break;
    }
    return { t: "fork", kind, merge, branches, lane: lane() };
  }
  if ((m = /^(partition|group|package|rectangle|card)\s+(#\S+\s+)?(.*?)\s*(\{)?\s*$/i.exec(line))) {
    const kind = m[1].toLowerCase();
    const text = label(m[3].replace(/^"|"$/g, ""));
    const fill = m[2] ? (parseColorSpec(m[2].trim()).fill ?? null) : null;
    const body = m[4]
      ? parseSeq(ctx, (l) => /^}\s*$/.test(l))
      : parseSeq(ctx, (l) => new RegExp(`^end\\s*${kind}\\b`, "i").test(l));
    if (!reader.done) reader.next();
    return { t: "group", kind, text, fill, body };
  }
  if ((m = /^(floating\s+)?note\s*(left|right)?\s*(#\S+)?\s*(?::\s*(.*))?$/i.exec(line))) {
    const text =
      m[4] ??
      reader
        .until(/^\s*end\s*note\s*$/i)
        .map((l) => l.text.trim())
        .join("\n");
    return {
      t: "note",
      text: label(text),
      side: /** @type {any} */ ((m[2] ?? "right").toLowerCase()),
      fill: m[3] ? (parseColorSpec(m[3]).fill ?? null) : null,
      floating: !!m[1],
    };
  }
  if ((m = /^(#\S+\s*)?\((.{1,3})\)\s*$/.exec(line))) {
    return {
      t: "connector",
      text: m[2],
      fill: m[1] ? (parseColorSpec(m[1].trim()).fill ?? null) : null,
      lane: lane(),
    };
  }
  if (parseCommon(line, model.meta, reader)) return null;
  ctx.module.diagnostics.unknown(line, lineNo);
  return null;
}
