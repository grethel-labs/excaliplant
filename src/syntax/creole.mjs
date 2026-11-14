/**
 * Creole and HTML-like markup used in PlantUML labels, converted into a small
 * rich-text model that the drawing layer can measure and render.
 * @module syntax/creole
 */

import { parseColor } from "./color.mjs";

/**
 * @typedef {object} Run
 * @property {string} text
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {boolean} [mono]
 * @property {boolean} [strike]
 * @property {boolean} [underline]
 * @property {boolean} [wave]
 * @property {string} [color]
 * @property {string} [background]
 * @property {number} [size] Absolute font size override.
 * @property {"sub" | "sup"} [script]
 * @property {string} [link]
 */

/**
 * @typedef {object} Block
 * @property {"line" | "bullet" | "numbered" | "heading" | "hr" | "table"} kind
 * @property {Run[]} runs
 * @property {number} [level] Nesting level for lists / heading level.
 * @property {number} [number] Item number for numbered lists.
 * @property {{ header: boolean, cells: Run[][] }[]} [rows] Table rows.
 */

/** @typedef {{ blocks: Block[] }} RichText */

/** @typedef {Omit<Run, "text">} Style */

const ICONS = new Map(
  Object.entries({
    "&check": "✓",
    "&x": "✗",
    "&star": "★",
    "&heart": "♥",
    "&warning": "⚠",
    "&info": "ℹ",
    "&person": "☺",
    "&lock-locked": "🔒",
    "&key": "⚿",
    "&cloud": "☁",
    "&home": "⌂",
    "&envelope-closed": "✉",
    "&clock": "◷",
    "&flag": "⚑",
    "&bolt": "⚡",
    "&plus": "+",
    "&minus": "−",
    "&arrow-right": "→",
    "&arrow-left": "←",
    "&arrow-top": "↑",
    "&arrow-bottom": "↓",
  }),
);

/**
 * Parse a label into rich text. Plain labels without markup produce one
 * `line` block per text line with a single run.
 * @param {string} text
 * @returns {RichText}
 * @public
 */
export function parseCreole(text) {
  /** @type {Block[]} */
  const blocks = [];
  const lines = text.split("\n");
  /** @type {number[]} */
  const counters = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");
    if (/^\s*(-{4,}|={4,}|\.{4,}|_{4,})\s*$/.test(line)) {
      blocks.push({ kind: "hr", runs: [] });
      continue;
    }
    if (/^\s*\|/.test(line) && /\|\s*$/.test(line)) {
      const last = blocks[blocks.length - 1];
      const row = parseTableRow(line);
      if (last?.kind === "table") /** @type {any[]} */ (last.rows).push(row);
      else blocks.push({ kind: "table", runs: [], rows: [row] });
      continue;
    }
    const bullet = /^\s*(\*+)\s+(.*)$/.exec(line);
    if (bullet) {
      blocks.push({ kind: "bullet", level: bullet[1].length, runs: parseInline(bullet[2]) });
      continue;
    }
    const numbered = /^\s*(#+)\s+(.*)$/.exec(line);
    if (numbered) {
      const level = numbered[1].length;
      counters.length = level;
      counters[level - 1] = (counters[level - 1] ?? 0) + 1;
      blocks.push({
        kind: "numbered",
        level,
        number: counters[level - 1],
        runs: parseInline(numbered[2]),
      });
      continue;
    }
    const heading = /^\s*(={1,4})\s+(.*?)\s*=*\s*$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        runs: parseInline(heading[2], { bold: true }),
      });
      continue;
    }
    counters.length = 0;
    blocks.push({ kind: "line", runs: parseInline(line) });
  }
  return { blocks };
}

/**
 * @param {string} line
 * @returns {{ header: boolean, cells: Run[][] }}
 */
function parseTableRow(line) {
  const inner = line.trim().slice(1, -1);
  const header = inner.startsWith("=");
  const cells = inner.split("|").map((c) => {
    const cell = c.replace(/^=\s*/, "").trim();
    return parseInline(cell, header ? { bold: true } : {});
  });
  return { header, cells };
}

/** Markup pairs toggled by doubled characters. */
const TOGGLES = /** @type {const} */ ([
  ["**", "bold"],
  ["//", "italic"],
  ['""', "mono"],
  ["--", "strike"],
  ["__", "underline"],
  ["~~", "wave"],
]);

/**
 * Parse inline markup into runs.
 * @param {string} text
 * @param {Style} [base]
 * @returns {Run[]}
 */
export function parseInline(text, base = {}) {
  /** @type {Run[]} */
  const runs = [];
  /** @type {Style[]} */
  const stack = [{ ...base }];
  let buf = "";
  const style = () => stack[stack.length - 1];
  const flush = () => {
    if (!buf) return;
    const s = style();
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, s)) last.text += buf;
    else runs.push({ text: buf, ...s });
    buf = "";
  };
  /** @param {Style} patch */
  const push = (patch) => {
    flush();
    stack.push({ ...style(), ...patch });
  };
  const pop = () => {
    flush();
    if (stack.length > 1) stack.pop();
  };

  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === "~" && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (c === "<") {
      const close = text.indexOf(">", i);
      if (close > i) {
        const tag = text.slice(i + 1, close);
        const handled = applyTag(tag, { push, pop, flush, append: (s) => (buf += s), style });
        if (handled) {
          i = close + 1;
          continue;
        }
      }
    }
    if (c === "[" && text[i + 1] === "[") {
      const close = text.indexOf("]]", i);
      if (close > 0) {
        const inner = text.slice(i + 2, close).trim();
        const m = /^(\S+)(?:\s+(.*))?$/.exec(inner);
        const url = m?.[1] ?? inner;
        const labelText = (m?.[2] ?? url).replace(/^\{[^}]*\}\s*/, "");
        push({ link: safeUrl(url), underline: true, color: style().color ?? "#1971c2" });
        buf += labelText;
        pop();
        i = close + 2;
        continue;
      }
    }
    let toggled = false;
    for (const [marker, prop] of TOGGLES) {
      if (text.startsWith(marker, i)) {
        // Avoid treating URLs ("http://") and arrows ("-->") as markup.
        if (marker === "//" && text[i - 1] === ":") break;
        if (marker === "--" && (text[i + 2] === ">" || text[i - 1] === "<" || text[i + 2] === "-"))
          break;
        if (style()[prop]) pop();
        else if (text.indexOf(marker, i + 2) > i + 2) push({ [prop]: true });
        else break;
        i += 2;
        toggled = true;
        break;
      }
    }
    if (toggled) continue;
    buf += c;
    i++;
  }
  flush();
  return runs.length ? runs : [{ text: "", ...base }];
}

/**
 * @param {string} tag
 * @param {{ push: (s: Style) => void, pop: () => void, flush: () => void, append: (s: string) => void, style: () => Style }} ops
 * @returns {boolean}
 */
function applyTag(tag, ops) {
  const t = tag.trim();
  const lower = t.toLowerCase();
  if (/^\/(b|i|u|s|strike|del|w|color|size|back|font|sub|sup|plain|code|strong|em)$/.test(lower)) {
    ops.pop();
    return true;
  }
  if (lower === "b" || lower === "strong") return (ops.push({ bold: true }), true);
  if (lower === "i" || lower === "em") return (ops.push({ italic: true }), true);
  if (lower === "u") return (ops.push({ underline: true }), true);
  if (lower === "s" || lower === "strike" || lower === "del")
    return (ops.push({ strike: true }), true);
  if (lower === "w") return (ops.push({ wave: true }), true);
  if (lower === "sub") return (ops.push({ script: "sub" }), true);
  if (lower === "sup") return (ops.push({ script: "sup" }), true);
  if (lower === "plain") return (ops.push({ bold: false, italic: false }), true);
  if (lower === "code") return (ops.push({ mono: true }), true);
  const color = /^color\s*[:= ]\s*#?([\w#]+)$/i.exec(t);
  if (color) {
    const c = parseColor(color[1]);
    ops.push(c ? { color: c } : {});
    return true;
  }
  const back = /^back\s*[:= ]\s*#?([\w#]+)$/i.exec(t);
  if (back) {
    const c = parseColor(back[1]);
    ops.push(c ? { background: c } : {});
    return true;
  }
  const size = /^size\s*[:= ]\s*(\d+)$/i.exec(t);
  if (size) {
    ops.push({ size: Math.max(6, Math.min(72, Number(size[1]))) });
    return true;
  }
  const font = /^font\b(.*)$/i.exec(t);
  if (font) {
    const c = /color\s*=\s*["']?#?([\w]+)/i.exec(font[1]);
    const s = /size\s*=\s*["']?(\d+)/i.exec(font[1]);
    /** @type {Style} */
    const patch = {};
    const pc = c ? parseColor(c[1]) : null;
    if (pc) patch.color = pc;
    if (s) patch.size = Math.max(6, Math.min(72, Number(s[1])));
    ops.push(patch);
    return true;
  }
  if (lower.startsWith("&")) {
    ops.append(ICONS.get(lower.split(/[\s{]/)[0]) ?? "◆");
    return true;
  }
  if (lower.startsWith("$")) {
    ops.append("◼");
    return true;
  }
  const uni = /^u\+([0-9a-f]{2,6})$/i.exec(t);
  if (uni) {
    const cp = parseInt(uni[1], 16);
    if (cp <= 0x10ffff) ops.append(String.fromCodePoint(cp));
    return true;
  }
  if (/^img\b/i.test(t) || /^(latex|math)\b/i.test(t) || /^\/(latex|math)$/i.test(t)) return true;
  return false;
}

/**
 * Only http(s) and mailto links survive; everything else is dropped.
 * @param {string} url
 */
function safeUrl(url) {
  return /^(https?:|mailto:)/i.test(url) ? url : "";
}

/**
 * @param {Run} run
 * @param {Style} s
 */
function sameStyle(run, s) {
  const keys = [
    "bold",
    "italic",
    "mono",
    "strike",
    "underline",
    "wave",
    "color",
    "background",
    "size",
    "script",
    "link",
  ];
  return keys.every((k) => /** @type {any} */ (run)[k] === /** @type {any} */ (s)[k]);
}

/**
 * Plain text of rich text (markup stripped).
 * @param {RichText} rich
 * @returns {string}
 */
export function plainText(rich) {
  return rich.blocks
    .map((b) => {
      if (b.kind === "table")
        return (b.rows ?? []).map((r) => r.cells.map(runsText).join(" | ")).join("\n");
      if (b.kind === "hr") return "";
      return runsText(b.runs);
    })
    .join("\n");
}

/** @param {Run[]} runs */
export function runsText(runs) {
  return runs.map((r) => r.text).join("");
}

/**
 * Strip creole markup from a string (convenience).
 * @param {string} text
 */
export function stripMarkup(text) {
  return plainText(parseCreole(text));
}
