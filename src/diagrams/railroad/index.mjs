/**
 * Railroad diagrams for EBNF grammars (`@startebnf`) and regular expressions
 * (`@startregex`), sharing one layout/draw engine.
 * @module diagrams/railroad
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle } from "../../draw/theme.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { ParseError, LimitError } from "../../core/errors.mjs";

/**
 * @typedef {(
 *  | { k: "term" | "nonterm" | "special" | "comment" | "anchor", text: string }
 *  | { k: "seq" | "choice", items: Rail[] }
 *  | { k: "opt", item: Rail }
 *  | { k: "rep", item: Rail, sep: Rail | null, min: number, label: string | null }
 *  | { k: "group", item: Rail, text: string }
 *  | { k: "skip" }
 * )} Rail
 */

// ── EBNF ──────────────────────────────────────────────────────────────

/**
 * @param {string} src
 * @returns {{ name: string, body: Rail, comment: string | null }[]}
 */
export function parseEbnf(src) {
  const text = src;
  let i = 0;
  /** @type {{ name: string, body: Rail, comment: string | null }[]} */
  const rules = [];
  /** @type {string | null} */
  let pendingComment = null;
  const ws = () => {
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text.startsWith("(*", i)) {
        const end = text.indexOf("*)", i + 2);
        pendingComment = text.slice(i + 2, end < 0 ? text.length : end).trim();
        i = end < 0 ? text.length : end + 2;
        continue;
      }
      return;
    }
  };
  /** @returns {Rail} */
  const alt = () => {
    const items = [seq()];
    ws();
    while (text[i] === "|" || text[i] === "/" || text[i] === "!") {
      i++;
      items.push(seq());
      ws();
    }
    return items.length === 1 ? items[0] : { k: "choice", items };
  };
  /** @returns {Rail} */
  const seq = () => {
    const items = [factor()];
    ws();
    while (text[i] === ",") {
      i++;
      items.push(factor());
      ws();
    }
    return items.length === 1 ? items[0] : { k: "seq", items };
  };
  /** @returns {Rail} */
  const factor = () => {
    ws();
    let rep = /** @type {number | null} */ (null);
    const num = /^(\d+)\s*\*/.exec(text.slice(i));
    if (num) {
      rep = Number(num[1]);
      i += num[0].length;
      ws();
    }
    let base = primary();
    ws();
    if (text[i] === "-" && text[i + 1] !== "-") {
      i++;
      const except = primary();
      base = { k: "seq", items: [base, { k: "comment", text: `except ${railText(except)}` }] };
    }
    if (text[i] === "*" || text[i] === "+" || text[i] === "?") {
      const op = text[i++];
      base = op === "?" ? { k: "opt", item: base } : op === "+" ? { k: "rep", item: base, sep: null, min: 1, label: null } : { k: "opt", item: { k: "rep", item: base, sep: null, min: 1, label: null } };
    }
    if (rep !== null) base = { k: "rep", item: base, sep: null, min: 1, label: `${rep}×` };
    return base;
  };
  /** @returns {Rail} */
  const primary = () => {
    ws();
    const c = text[i];
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      if (end < 0) throw new ParseError("Unterminated EBNF string");
      const s = text.slice(i + 1, end);
      i = end + 1;
      return { k: "term", text: s };
    }
    if (c === "?") {
      const end = text.indexOf("?", i + 1);
      const s = text.slice(i + 1, end < 0 ? text.length : end).trim();
      i = end < 0 ? text.length : end + 1;
      return { k: "special", text: s };
    }
    if (c === "[" || c === "{" || c === "(") {
      const close = c === "[" ? "]" : c === "{" ? "}" : ")";
      i++;
      const inner = alt();
      ws();
      if (text[i] !== close) throw new ParseError(`Expected '${close}' in EBNF`);
      i++;
      if (c === "[") return { k: "opt", item: inner };
      if (c === "{") {
        if (text[i] === "-") {
          i++;
          return { k: "rep", item: inner, sep: null, min: 1, label: null };
        }
        return { k: "opt", item: { k: "rep", item: inner, sep: null, min: 1, label: null } };
      }
      return inner;
    }
    // Identifiers may contain inner spaces; a greedy scan keeps this linear.
    const m = /^[A-Za-z_][\w \t-]*/.exec(text.slice(i));
    if (m && m[0].trim()) {
      i += m[0].length;
      return { k: "nonterm", text: m[0].trim() };
    }
    throw new ParseError(`Unexpected '${c ?? "end of input"}' in EBNF`);
  };
  for (;;) {
    ws();
    if (i >= text.length) break;
    const m = /^([A-Za-z_][\w \t-]*)(::=|=|:)/.exec(text.slice(i));
    if (!m) throw new ParseError(`Expected rule name near "${text.slice(i, i + 20)}"`);
    const comment = pendingComment;
    pendingComment = null;
    i += m[0].length;
    const body = alt();
    ws();
    if (text[i] === ";" || text[i] === ".") i++;
    rules.push({ name: m[1].trim(), body, comment });
    if (rules.length > 500) throw new LimitError("Too many EBNF rules");
  }
  return rules;
}

/** @param {Rail} r @returns {string} */
function railText(r) {
  if ("text" in r) return r.text;
  return "…";
}

// ── Regex ─────────────────────────────────────────────────────────────

const ESCAPES = new Map(
  Object.entries({
    d: "digit",
    D: "non-digit",
    w: "word char",
    W: "non-word char",
    s: "whitespace",
    S: "non-whitespace",
    b: "word boundary",
    B: "non-word boundary",
    n: "new line",
    t: "tab",
    r: "carriage return",
  }),
);

/**
 * Parse a regular expression into rails. Supports alternation, groups
 * (capturing, non-capturing, named, lookaround), classes, escapes,
 * anchors and quantifiers.
 * @param {string} src
 * @returns {Rail}
 */
export function parseRegex(src) {
  let i = 0;
  let groups = 0;
  /** @returns {Rail} */
  const alt = () => {
    const items = [seq()];
    while (src[i] === "|") {
      i++;
      items.push(seq());
    }
    return items.length === 1 ? items[0] : { k: "choice", items };
  };
  /** @returns {Rail} */
  const seq = () => {
    /** @type {Rail[]} */
    const items = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") {
      let atom = primary();
      atom = quantify(atom);
      const last = items[items.length - 1];
      if (atom.k === "term" && last?.k === "term" && !/^\[/.test(atom.text)) last.text += atom.text;
      else items.push(atom);
    }
    if (!items.length) return { k: "skip" };
    return items.length === 1 ? items[0] : { k: "seq", items };
  };
  /** @param {Rail} atom @returns {Rail} */
  const quantify = (atom) => {
    const c = src[i];
    let min = -1;
    let max = -1;
    if (c === "*") [min, max] = [0, Infinity];
    else if (c === "+") [min, max] = [1, Infinity];
    else if (c === "?") [min, max] = [0, 1];
    else if (c === "{") {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
      if (m) {
        min = Number(m[1]);
        max = m[2] ? (m[3] ? Number(m[3]) : Infinity) : min;
        i += m[0].length - 1;
      }
    }
    if (min < 0) return atom;
    i++;
    if (src[i] === "?" || src[i] === "+") i++;
    // A quantifier applies to the last character of a literal run only.
    if (atom.k === "term" && atom.text.length > 1) {
      const head = { k: "term", text: atom.text.slice(0, -1) };
      return /** @type {Rail} */ ({ k: "seq", items: [head, quantified({ k: "term", text: atom.text.slice(-1) }, min, max)] });
    }
    return quantified(atom, min, max);
  };
  /** @param {Rail} atom @param {number} min @param {number} max @returns {Rail} */
  const quantified = (atom, min, max) => {
    if (max === 1 && min === 0) return { k: "opt", item: atom };
    const label = max === Infinity ? (min > 1 ? `${min}+ times` : null) : min === max ? `${min} times` : `${min}–${max} times`;
    const rep = { k: "rep", item: atom, sep: null, min: Math.max(1, min), label };
    return min === 0 ? { k: "opt", item: /** @type {Rail} */ (rep) } : /** @type {Rail} */ (rep);
  };
  /** @returns {Rail} */
  const primary = () => {
    const c = src[i];
    if (c === "(") {
      i++;
      let text = `group #${++groups}`;
      if (src[i] === "?") {
        const m = /^\?(:|=|!|<=|<!|<([A-Za-z_]\w*)>|P<([A-Za-z_]\w*)>)/.exec(src.slice(i));
        if (m) {
          i += m[0].length;
          groups--;
          text = m[1] === ":" ? "" : m[1] === "=" ? "followed by" : m[1] === "!" ? "not followed by" : m[1] === "<=" ? "preceded by" : m[1] === "<!" ? "not preceded by" : `group <${m[2] ?? m[3]}>`;
          if (m[2] || m[3]) groups++;
        }
      }
      const inner = alt();
      if (src[i] === ")") i++;
      return text ? { k: "group", item: inner, text } : inner;
    }
    if (c === "[") {
      let j = i + 1;
      if (src[j] === "^") j++;
      if (src[j] === "]") j++;
      while (j < src.length && src[j] !== "]") j += src[j] === "\\" ? 2 : 1;
      const body = src.slice(i + 1, j);
      i = j + 1;
      return { k: "nonterm", text: body.startsWith("^") ? `none of ${body.slice(1)}` : `one of ${body}` };
    }
    if (c === "\\") {
      const n = src[i + 1] ?? "";
      i += 2;
      const named = ESCAPES.get(n);
      if (named) return { k: "nonterm", text: named };
      if (/\d/.test(n)) return { k: "nonterm", text: `back-reference #${n}` };
      if (n === "u") {
        const hex = src.slice(i, i + 4);
        i += 4;
        return { k: "term", text: String.fromCodePoint(parseInt(hex, 16) || 63) };
      }
      return { k: "term", text: n };
    }
    if (c === ".") {
      i++;
      return { k: "nonterm", text: "any character" };
    }
    if (c === "^" || c === "$") {
      i++;
      return { k: "anchor", text: c === "^" ? "start of line" : "end of line" };
    }
    i++;
    return { k: "term", text: c };
  };
  const out = alt();
  if (i < src.length) throw new ParseError(`Unbalanced ')' in regex at ${i}`);
  return out;
}

// ── layout ────────────────────────────────────────────────────────────

/**
 * @typedef {{ w: number, up: number, down: number, draw: (c: import("../../draw/canvas.mjs").Canvas, x: number, y: number) => void }} Box
 */

const GAP = 14;
const BRANCH = 18;

/**
 * @param {Rail} r
 * @param {number} fs
 * @param {import("../../draw/theme.mjs").Theme} theme
 * @returns {Box}
 */
function box(r, fs, theme) {
  const ink = theme.ink;
  const track = { stroke: theme.muted, strokeWidth: 2 };
  /** @param {import("../../draw/canvas.mjs").Canvas} c @param {[number, number][]} pts */
  const path = (c, pts) => c.line(pts, { ...track, roughness: Math.min(theme.roughness, 0.8) });
  switch (r.k) {
    case "skip":
      return { w: 0, up: 0, down: 0, draw: () => {} };
    case "term":
    case "nonterm":
    case "special":
    case "anchor":
    case "comment": {
      const t = layoutText(r.k === "term" ? r.text.replace(/ /g, "␣") : r.text, { fontSize: r.k === "comment" ? fs * 0.8 : fs });
      const w = t.width + (r.k === "comment" ? 8 : 24);
      const h = t.height + 12;
      const role = r.k === "term" ? "action" : r.k === "nonterm" ? "class" : "decision";
      return {
        w,
        up: h / 2,
        down: h / 2,
        draw: (c, x, y) => {
          const s = roleStyle(theme, role);
          if (r.k === "comment") {
            c.richText(t, x + 4, y - t.height / 2, { color: theme.muted });
            return;
          }
          if (r.k === "special" || r.k === "anchor") {
            c.line([[x, y], [x + 8, y - h / 2], [x + w - 8, y - h / 2], [x + w, y], [x + w - 8, y + h / 2], [x + 8, y + h / 2]], { closed: true, fill: s.fill, stroke: s.stroke });
          } else c.rect(x, y - h / 2, w, h, { fill: s.fill, stroke: s.stroke, rounded: r.k === "term" });
          c.richText(t, x + (w - t.width) / 2, y - t.height / 2, { color: ink });
        },
      };
    }
    case "seq": {
      const parts = r.items.map((it) => box(it, fs, theme));
      const w = parts.reduce((s, p) => s + p.w, 0) + GAP * Math.max(0, parts.length - 1);
      return {
        w,
        up: Math.max(0, ...parts.map((p) => p.up)),
        down: Math.max(0, ...parts.map((p) => p.down)),
        draw: (c, x, y) => {
          let cx = x;
          parts.forEach((p, k) => {
            if (k > 0) path(c, [[cx - GAP, y], [cx, y]]);
            p.draw(c, cx, y);
            cx += p.w + GAP;
          });
        },
      };
    }
    case "choice":
    case "opt": {
      const items = r.k === "opt" ? [/** @type {Rail} */ ({ k: "skip" }), r.item] : r.items;
      const parts = items.map((it) => box(it, fs, theme));
      const inner = Math.max(...parts.map((p) => p.w));
      const w = inner + BRANCH * 2 + 8;
      /** @type {number[]} */
      const offsets = [0];
      for (let k = 1; k < parts.length; k++) offsets.push(offsets[k - 1] + parts[k - 1].down + 12 + parts[k].up);
      return {
        w,
        up: parts[0].up,
        down: offsets[offsets.length - 1] + parts[parts.length - 1].down,
        draw: (c, x, y) => {
          parts.forEach((p, k) => {
            const by = y + offsets[k];
            const px = x + BRANCH + 4 + (inner - p.w) / 2;
            if (k === 0) path(c, [[x, y], [px, y]]);
            else path(c, [[x, y], [x + BRANCH / 2, y + 6], [x + BRANCH / 2, by - 6], [x + BRANCH, by], [px, by]]);
            p.draw(c, px, by);
            if (k === 0) path(c, [[px + p.w, y], [x + w, y]]);
            else path(c, [[px + p.w, by], [x + w - BRANCH, by], [x + w - BRANCH / 2, by - 6], [x + w - BRANCH / 2, y + 6], [x + w, y]]);
          });
        },
      };
    }
    case "rep": {
      const p = box(r.item, fs, theme);
      const sep = r.sep ? box(r.sep, fs, theme) : null;
      const lbl = r.label ? layoutText(r.label, { fontSize: fs * 0.7 }) : null;
      const back = p.down + 14 + (sep ? sep.up + sep.down : 0);
      const w = Math.max(p.w, sep?.w ?? 0) + BRANCH * 2;
      return {
        w,
        up: p.up,
        down: back + 4 + (lbl ? lbl.height : 0),
        draw: (c, x, y) => {
          path(c, [[x, y], [x + BRANCH, y]]);
          p.draw(c, x + BRANCH + (w - BRANCH * 2 - p.w) / 2, y);
          path(c, [[x + BRANCH + (w - BRANCH * 2 + p.w) / 2, y], [x + w, y]]);
          const by = y + back;
          c.arrow([[x + w - BRANCH / 2, y + 6], [x + w - BRANCH / 2, by - 4], [x + w - BRANCH, by], [x + BRANCH, by], [x + BRANCH / 2, by - 4], [x + BRANCH / 2, y + 6]], {
            ...track,
            strokeWidth: 1.5,
            end: "arrow",
            roughness: Math.min(theme.roughness, 0.8),
          });
          if (lbl) c.richText(lbl, x + (w - lbl.width) / 2, by + 2, { color: theme.muted });
        },
      };
    }
    case "group": {
      const p = box(r.item, fs, theme);
      const t = layoutText(r.text, { fontSize: fs * 0.7 });
      const w = Math.max(p.w, t.width) + 20;
      return {
        w,
        up: p.up + t.height + 8,
        down: p.down + 8,
        draw: (c, x, y) => {
          c.rect(x, y - p.up - 6, w, p.up + p.down + 12, { stroke: theme.muted, strokeWidth: 1, strokeStyle: "dashed", rounded: true });
          c.richText(t, x + 4, y - p.up - 8 - t.height, { color: theme.muted, align: "left" });
          path(c, [[x, y], [x + (w - p.w) / 2, y]]);
          p.draw(c, x + (w - p.w) / 2, y);
          path(c, [[x + (w + p.w) / 2, y], [x + w, y]]);
        },
      };
    }
  }
}

/**
 * @param {{ rules: { name: string, body: Rail, comment: string | null }[] }} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutRail(model, ctx) {
  const fs = ctx.theme.fontSize * 0.85;
  return { rows: model.rules.map((r) => ({ name: r.name, comment: r.comment, box: box(r.body, fs, ctx.theme) })), fs };
}

/**
 * @param {ReturnType<typeof layoutRail>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawRail(laid, c) {
  const theme = c.theme;
  let y = 0;
  for (const row of laid.rows) {
    if (row.name) {
      const t = layoutText(row.name, { fontSize: laid.fs * 1.1, bold: true });
      c.richText(t, 0, y, { color: theme.ink, align: "left" });
      y += t.height + 4;
    }
    if (row.comment) {
      const t = layoutText(row.comment, { fontSize: laid.fs * 0.8 });
      c.richText(t, 0, y, { color: theme.muted, align: "left" });
      y += t.height + 4;
    }
    const base = y + row.box.up + 6;
    const track = { stroke: theme.muted, strokeWidth: 2 };
    c.line([[0, base - 8], [0, base + 8]], track);
    c.line([[5, base - 8], [5, base + 8]], track);
    c.line([[5, base], [20, base]], track);
    row.box.draw(c, 20, base);
    const end = 20 + row.box.w;
    c.line([[end, base], [end + 15, base]], track);
    c.line([[end + 15, base - 8], [end + 15, base + 8]], track);
    c.line([[end + 20, base - 8], [end + 20, base + 8]], track);
    y = base + row.box.down + 36;
  }
}

/**
 * Collect the diagram source text and shared commands.
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 */
function collect(lines) {
  const meta = createMeta();
  const reader = new LineReader(lines);
  /** @type {string[]} */
  const body = [];
  while (!reader.done) {
    const l = reader.next();
    const t = l.text.trim();
    if (/^(title|caption|header|footer|legend|skinparam|scale)\b/i.test(t) && parseCommon(t, meta, reader)) continue;
    body.push(l.text);
  }
  return { meta, text: body.join("\n") };
}

export const ebnfDiagram = defineDiagram({
  kind: "ebnf",
  title: "EBNF railroad",
  starts: ["ebnf"],
  raw: true,
  parse: (lines) => {
    const { meta, text } = collect(lines);
    return { meta, rules: parseEbnf(text) };
  },
  layout: layoutRail,
  draw: drawRail,
});

export const regexDiagram = defineDiagram({
  kind: "regex",
  title: "Regex railroad",
  starts: ["regex"],
  raw: true,
  parse: (lines, module) => {
    const { meta, text } = collect(lines);
    const rules = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (l.length > module.limits.maxTextLength) throw new LimitError("Regex too long");
        return { name: "", body: parseRegex(l.replace(/^\/(.*)\/[a-z]*$/, "$1")), comment: null };
      });
    return { meta, rules };
  },
  layout: layoutRail,
  draw: drawRail,
});
