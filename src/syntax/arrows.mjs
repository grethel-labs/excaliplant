/**
 * Link grammar for graph-like diagrams (class, component, use case, state …):
 *
 *   A "1" <|--[#red,dashed]up-- "many" B : label >
 *
 * The scanner masks quoted strings and bracketed names first, then locates the
 * arrow body (`-`, `.`, `=`, `~` runs with optional `[style]` and direction)
 * and reads the heads glued to either side. No backtracking-heavy regexes.
 * @module syntax/arrows
 */

import { parseColor } from "./color.mjs";

/**
 * @typedef {object} ArrowSpec
 * @property {string | null} left Left head token (`<|`, `*`, `o`, …).
 * @property {string | null} right Right head token (`|>`, `>`, …).
 * @property {"solid" | "dashed" | "dotted"} lineStyle
 * @property {boolean} bold
 * @property {boolean} hidden
 * @property {string | null} color
 * @property {number | null} thickness
 * @property {"up" | "down" | "left" | "right" | null} direction
 * @property {number} length Number of body characters (1 = short / horizontal).
 * @property {string} raw
 */

/**
 * @typedef {object} LinkSpec
 * @property {string} from Raw left endpoint text.
 * @property {string} to Raw right endpoint text.
 * @property {string | null} fromLabel Quoted multiplicity near `from`.
 * @property {string | null} toLabel Quoted multiplicity near `to`.
 * @property {ArrowSpec} arrow
 * @property {string | null} label Text after `:`.
 */

const LEFT_HEADS = ["<|", "<<", "}o", "}|", "|o", "||", "<", "*", "o", "#", "x", "}", "+", "^", "(", ")", "0", "|", "/", "\\"];
const RIGHT_HEADS = ["|>", ">>", "o{", "|{", "o|", "||", ">", "*", "o", "#", "x", "{", "+", "^", "(", ")", "0", "|", "/", "\\"];
const DIRECTIONS = new Map([
  ["up", "up"],
  ["u", "up"],
  ["down", "down"],
  ["do", "down"],
  ["d", "down"],
  ["left", "left"],
  ["le", "left"],
  ["l", "left"],
  ["right", "right"],
  ["ri", "right"],
  ["r", "right"],
]);

/**
 * Replace quoted strings and bracketed/parenthesised names with filler so the
 * arrow scanner never looks inside them.
 * @param {string} line
 */
function mask(line) {
  let out = "";
  /** @type {string | null} */
  let close = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (close) {
      out += c === close ? c : "\u0001";
      if (c === close) close = null;
      continue;
    }
    const prev = i > 0 ? line[i - 1] : " ";
    if (c === '"') close = '"';
    else if (c === "[" && !/[-.=~]/.test(prev) && line[i + 1] !== "[") close = "]";
    else if (c === "(" && /[\s]/.test(prev) && line[i + 1] !== ")") close = ")";
    out += c;
  }
  return out;
}

const BODY_CHARS = new Set(["-", ".", "=", "~"]);

/**
 * Parse a link line. Returns null when no arrow is present.
 * @param {string} line Trimmed line.
 * @returns {LinkSpec | null}
 */
export function parseLink(line) {
  const masked = mask(line);
  // Labels come after the first ':' outside quotes that is not part of '::'.
  let labelAt = -1;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ":" && masked[i + 1] !== ":" && masked[i - 1] !== ":") {
      labelAt = i;
      break;
    }
  }
  const head = labelAt >= 0 ? masked.slice(0, labelAt) : masked;
  /** @type {{ spec: LinkSpec, spaced: boolean }[]} */
  const candidates = [];
  for (let i = 0; i < head.length; i++) {
    if (!BODY_CHARS.has(head[i])) continue;
    const body = scanBody(head, i);
    if (!body) continue;
    // A single '.' or '=' alone is not an arrow (e.g. `a.b`), require context.
    let leftHead = longestSuffix(head.slice(0, i), LEFT_HEADS);
    let rightHead = longestPrefix(head.slice(body.end), RIGHT_HEADS);
    const bodyLen = body.end - i;
    const plainDots = /^[.=~]+$/.test(head.slice(i, body.end)) && bodyLen < 2 && !leftHead && !rightHead;
    if (plainDots) continue;
    let start = i - (leftHead?.length ?? 0);
    let end = body.end + (rightHead?.length ?? 0);
    // Heads like 'o' / 'x' must not eat an identifier character.
    if (leftHead && /^[ox0]$/.test(leftHead) && start > 0 && /\w/.test(head[start - 1])) {
      start += leftHead.length;
      leftHead = null;
    }
    if (rightHead && /^[ox0]$/.test(rightHead) && /\w/.test(head[end] ?? "")) {
      end -= rightHead.length;
      rightHead = null;
    }
    const from = line.slice(0, start).trim();
    const rest = line.slice(end, labelAt >= 0 ? labelAt : line.length).trim();
    if (!from || !rest) continue;
    const fromSplit = trailingQuoted(from);
    const toSplit = leadingQuoted(rest);
    if (!fromSplit.text || !toSplit.text) continue;
    candidates.push({
      spec: {
        from: fromSplit.text,
        to: toSplit.text,
        fromLabel: fromSplit.quoted,
        toLabel: toSplit.quoted,
        arrow: describe(line.slice(i, body.end), leftHead, rightHead, line.slice(start, end)),
        label: labelAt >= 0 ? line.slice(labelAt + 1).trim() : null,
      },
      // Arrows separated by whitespace win over dashes inside names (`my-service`).
      spaced: /\s/.test(head[start - 1] ?? " ") || /\s/.test(head[end] ?? " "),
    });
    i = body.end;
  }
  return (candidates.find((c) => c.spaced) ?? candidates[0])?.spec ?? null;
}

/**
 * Scan an arrow body starting at `i`: body chars, optional `[style]`, optional
 * direction word, more body chars.
 * @param {string} s
 * @param {number} i
 * @returns {{ end: number } | null}
 */
function scanBody(s, i) {
  let j = i;
  while (j < s.length && BODY_CHARS.has(s[j])) j++;
  if (s[j] === "[") {
    const close = s.indexOf("]", j);
    if (close < 0) return null;
    j = close + 1;
    while (j < s.length && BODY_CHARS.has(s[j])) j++;
  }
  const word = /^(up|down|left|right|do|le|ri|u|d|l|r)(?=[-.=~\[])/.exec(s.slice(j));
  if (word && j > i) {
    j += word[1].length;
    if (s[j] === "[") {
      const close = s.indexOf("]", j);
      if (close > 0) j = close + 1;
    }
    while (j < s.length && BODY_CHARS.has(s[j])) j++;
  }
  return j > i ? { end: j } : null;
}

/**
 * @param {string} s
 * @param {string[]} list
 */
function longestSuffix(s, list) {
  for (const h of list) if (s.endsWith(h)) return h;
  return null;
}

/**
 * @param {string} s
 * @param {string[]} list
 */
function longestPrefix(s, list) {
  for (const h of list) if (s.startsWith(h)) return h;
  return null;
}

/**
 * @param {string} text
 * @returns {{ text: string, quoted: string | null }}
 */
function trailingQuoted(text) {
  const m = /^(.*?)\s+"([^"]*)"$/.exec(text);
  if (m && m[1].trim()) return { text: m[1].trim(), quoted: m[2] };
  return { text: text.trim(), quoted: null };
}

/**
 * @param {string} text
 * @returns {{ text: string, quoted: string | null }}
 */
function leadingQuoted(text) {
  const m = /^"([^"]*)"\s+(.+)$/.exec(text);
  if (m && m[2].trim()) return { text: m[2].trim(), quoted: m[1] };
  return { text: text.trim(), quoted: null };
}

/**
 * @param {string} body
 * @param {string | null} left
 * @param {string | null} right
 * @param {string} raw
 * @returns {ArrowSpec}
 */
function describe(body, left, right, raw) {
  /** @type {ArrowSpec} */
  const spec = {
    left,
    right,
    lineStyle: "solid",
    bold: false,
    hidden: false,
    color: null,
    thickness: null,
    direction: null,
    length: 0,
    raw,
  };
  const style = /\[([^\]]*)\]/.exec(body);
  const core = body.replace(/\[[^\]]*\]/g, "");
  const dir = /(up|down|left|right|do|le|ri|u|d|l|r)/.exec(core.replace(/[-.=~]/g, " ").trim());
  if (dir) spec.direction = /** @type {any} */ (DIRECTIONS.get(dir[1]) ?? null);
  const chars = core.replace(/[a-z]/gi, "");
  spec.length = chars.length;
  if (chars.includes(".")) spec.lineStyle = "dashed";
  if (chars.includes("~")) spec.lineStyle = "dotted";
  if (chars.includes("=")) spec.bold = true;
  if (style) {
    for (const part of style[1].split(/[,;]/)) {
      const p = part.trim().toLowerCase();
      if (!p) continue;
      if (p === "dashed") spec.lineStyle = "dashed";
      else if (p === "dotted") spec.lineStyle = "dotted";
      else if (p === "bold") spec.bold = true;
      else if (p === "hidden") spec.hidden = true;
      else if (p === "plain") spec.lineStyle = "solid";
      else if (p.startsWith("thickness")) spec.thickness = Math.max(0.5, Math.min(12, Number(p.split("=")[1]) || 1));
      else {
        const c = parseColor(part.trim().split(/[;,]/)[0].replace(/^#/, ""));
        if (c) spec.color = c;
      }
    }
  }
  return spec;
}

/** PlantUML head token → canvas head name (for the right/target end). */
const RIGHT_MAP = new Map([
  [">", "arrow"],
  [">>", "arrow"],
  ["|>", "triangle_outline"],
  ["^", "triangle_outline"],
  ["*", "diamond"],
  ["o", "diamond_outline"],
  ["#", "bar"],
  ["x", "cross"],
  ["+", "plus"],
  ["(", "socket"],
  [")", "socket"],
  ["0", "circle_outline"],
  ["{", "crowfoot_many"],
  ["o{", "zero_many"],
  ["|{", "crowfoot_one_or_many"],
  ["||", "one_one"],
  ["o|", "zero_one"],
  ["|", "crowfoot_one"],
  ["/", "half_top"],
  ["\\", "half_bottom"],
]);

const LEFT_MAP = new Map([
  ["<", "arrow"],
  ["<<", "arrow"],
  ["<|", "triangle_outline"],
  ["^", "triangle_outline"],
  ["*", "diamond"],
  ["o", "diamond_outline"],
  ["#", "bar"],
  ["x", "cross"],
  ["+", "plus"],
  ["(", "socket"],
  [")", "socket"],
  ["0", "circle_outline"],
  ["}", "crowfoot_many"],
  ["}o", "zero_many"],
  ["}|", "crowfoot_one_or_many"],
  ["||", "one_one"],
  ["|o", "zero_one"],
  ["|", "crowfoot_one"],
  ["/", "half_bottom"],
  ["\\", "half_top"],
]);

/**
 * Canvas head names for an arrow spec.
 * @param {ArrowSpec} arrow
 * @returns {{ start: string | null, end: string | null }}
 */
export function headsOf(arrow) {
  return {
    start: arrow.left ? (LEFT_MAP.get(arrow.left) ?? null) : null,
    end: arrow.right ? (RIGHT_MAP.get(arrow.right) ?? null) : null,
  };
}
