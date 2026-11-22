/**
 * Salt wireframes (`@startsalt` or `salt` inside `@startuml`): grids with
 * border styles (`{+`, `{#`, `{!`, `{-`), buttons, text fields, check boxes,
 * radio buttons, drop-downs, separators, trees (`{T`), tabs (`{/`), menus
 * (`{*`), scroll areas (`{S`) and group boxes (`{^"title"`).
 * @module diagrams/salt
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { label } from "../../syntax/text.mjs";
import { LimitError } from "../../core/errors.mjs";
import { score } from "../detect.mjs";

/** @typedef {import("../../layout/measure.mjs").RichLayout} RichLayout */

/**
 * @typedef {(
 *  | { t: "grid", border: string, kind: "grid" | "tree" | "tabs" | "menu" | "scroll" | "group", title: string | null, rows: Widget[][], w: number, h: number, colW: number[], rowH: number[] }
 *  | { t: "text" | "button" | "field" | "check" | "radio" | "drop" | "sep" | "empty" | "treeitem", text: string, on?: boolean, depth?: number, sep?: string, laid: RichLayout | null, w: number, h: number }
 * )} Widget
 */

/** Inset of a group caption from the frame's left edge, and its plate padding. */
const GROUP_TITLE_INSET = 10;
const GROUP_TITLE_PAD = 8;

/**
 * Split on top-level `|` (outside `{}` and `[]`/`""`).
 * @param {string} s
 */
function splitCells(s) {
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let quote = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quote = !quote;
    else if (quote) continue;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "|" && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/**
 * Parse block content (text between the braces).
 * @param {string} head Text after `{` on the opening line (border/kind marker).
 * @param {string[]} lines Content lines.
 * @param {{ n: number, max: number }} budget
 * @returns {Widget}
 */
function parseBlock(head, lines, budget) {
  const marker = head.trim();
  /** @type {Widget & { t: "grid" }} */
  const grid = {
    t: "grid",
    border: "",
    kind: "grid",
    title: null,
    rows: [],
    w: 0,
    h: 0,
    colW: [],
    rowH: [],
  };
  if (marker.startsWith("T")) grid.kind = "tree";
  else if (marker.startsWith("/")) grid.kind = "tabs";
  else if (marker.startsWith("*")) grid.kind = "menu";
  else if (marker.startsWith("S")) grid.kind = "scroll";
  else if (marker.startsWith("^")) {
    grid.kind = "group";
    grid.title = label(/^\^\s*"([^"]*)"/.exec(marker)?.[1] ?? "");
  } else if (/^[+#!-]/.test(marker)) grid.border = marker[0];
  const inline = marker.replace(/^(T|\/|\*|S[IV-]?|\^\s*"[^"]*"|[+#!-])/, "").trim();
  const all = inline ? [inline, ...lines] : lines;
  for (let i = 0; i < all.length; i++) {
    let line = all[i];
    if (!line.trim()) continue;
    // gather nested blocks spanning lines
    let depth = 0;
    for (const ch of line) depth += ch === "{" ? 1 : ch === "}" ? -1 : 0;
    while (depth > 0 && i + 1 < all.length) {
      i++;
      line += `\n${all[i]}`;
      for (const ch of all[i]) depth += ch === "{" ? 1 : ch === "}" ? -1 : 0;
    }
    if (++budget.n > budget.max) throw new LimitError("Salt wireframe too large");
    if (grid.kind === "tree") {
      const m = /^(\++)\s*(.*)$/.exec(line.trim());
      grid.rows.push([widget(m ? m[2] : line.trim(), budget, m ? m[1].length : 1, true)]);
      continue;
    }
    const cells =
      grid.kind === "tabs" || grid.kind === "menu" ? splitCells(line) : splitCells(line);
    grid.rows.push(cells.map((cell) => widget(cell.trim(), budget, 0, false)));
  }
  return grid;
}

/**
 * @param {string} cell
 * @param {{ n: number, max: number }} budget
 * @param {number} depth
 * @param {boolean} treeItem
 * @returns {Widget}
 */
function widget(cell, budget, depth, treeItem) {
  /** @param {Widget["t"]} t @param {string} text @param {Partial<Widget>} [extra] @returns {Widget} */
  const w = (t, text, extra = {}) =>
    /** @type {Widget} */ ({ t, text: label(text), laid: null, w: 0, h: 0, ...extra });
  if (cell.startsWith("{")) {
    const close = cell.lastIndexOf("}");
    const inner = cell.slice(1, close < 0 ? undefined : close);
    const nl = inner.indexOf("\n");
    const head = nl < 0 ? inner : inner.slice(0, nl);
    const isMarker = /^(T|\/|\*|S[IV-]?|\^|[+#!-])/.test(head.trim());
    const rest = nl < 0 ? [] : inner.slice(nl + 1).split("\n");
    if (nl < 0) return parseBlock(isMarker ? head : "", isMarker ? [] : [head], budget);
    return parseBlock(isMarker ? head : "", isMarker ? rest : [head, ...rest], budget);
  }
  if (treeItem) return w("treeitem", cell, { depth });
  if (cell === "." || cell === "") return w("empty", "");
  if (/^(==|\.\.|~~|--)+$/.test(cell)) return w("sep", "", { sep: cell.slice(0, 2) });
  let m;
  if (
    (m = /^\[\s*([Xx ]?)\s*\]\s*(.*)$/.exec(cell)) &&
    (m[1] !== "" || m[2] !== "" || cell === "[]")
  ) {
    if (m[1] || cell.startsWith("[]") || /^\[\s\]/.test(cell))
      return w("check", m[2], { on: /x/i.test(m[1]) });
  }
  if ((m = /^\[(.*)\]$/.exec(cell))) return w("button", m[1].trim());
  if ((m = /^\(\s*([Xx]?)\s*\)\s*(.*)$/.exec(cell))) return w("radio", m[2], { on: !!m[1] });
  if ((m = /^"(.*)"$/.exec(cell))) return w("field", m[1]);
  if ((m = /^\^(.*)\^$/.exec(cell))) return w("drop", m[1].trim());
  return w("text", cell);
}

/**
 * @param {Widget} wd
 * @param {number} fs
 */
function measure(wd, fs) {
  if (wd.t === "grid") {
    for (const row of wd.rows) for (const cell of row) measure(cell, fs);
    const cols = Math.max(1, ...wd.rows.map((r) => r.length));
    const pad = wd.border ? 8 : 4;
    if (wd.kind === "tabs" || wd.kind === "menu") {
      wd.colW = [];
      const row = wd.rows[0] ?? [];
      wd.w = row.reduce((s, c) => s + c.w + 20, 0);
      wd.h =
        Math.max(0, ...row.map((c) => c.h)) +
        10 +
        wd.rows.slice(1).reduce((s, r) => s + Math.max(...r.map((c) => c.h)) + 6, 0);
      wd.w = Math.max(wd.w, ...wd.rows.slice(1).map((r) => r.reduce((s, c) => s + c.w + 10, 0)));
      return;
    }
    wd.colW = Array.from(
      { length: cols },
      (_, i) => Math.max(0, ...wd.rows.map((r) => (r[i] ? r[i].w : 0))) + pad * 2,
    );
    wd.rowH = wd.rows.map((r) => Math.max(...r.map((c) => c.h)) + pad * 2);
    wd.w = wd.colW.reduce((s, x) => s + x, 0);
    wd.h = wd.rowH.reduce((s, x) => s + x, 0) + (wd.kind === "group" ? fs * 1.4 : 0);
    if (wd.kind === "scroll") wd.w += 14;
    if (wd.kind === "group" && wd.title) {
      // The caption plate sits 10px in from the left edge and needs 10px on its right.
      const t = layoutText(wd.title, { fontSize: fs * 0.9 });
      wd.w = Math.max(wd.w, t.width + GROUP_TITLE_INSET * 2 + GROUP_TITLE_PAD);
    }
    return;
  }
  wd.laid = wd.text ? layoutText(wd.text, { fontSize: fs, align: "left" }) : null;
  const tw = wd.laid?.width ?? 0;
  const th = wd.laid?.height ?? fs * 1.25;
  switch (wd.t) {
    case "button":
      wd.w = tw + 24;
      wd.h = th + 10;
      break;
    case "field":
      wd.w = Math.max(60, tw + 14);
      wd.h = th + 8;
      break;
    case "check":
    case "radio":
      wd.w = tw + 24;
      wd.h = th;
      break;
    case "drop":
      wd.w = tw + 34;
      wd.h = th + 8;
      break;
    case "sep":
      wd.w = 20;
      wd.h = 8;
      break;
    case "treeitem":
      wd.w = tw + 20 + ((wd.depth ?? 1) - 1) * 18;
      wd.h = th + 2;
      break;
    default:
      wd.w = tw;
      wd.h = th;
  }
}

/**
 * @param {import("../../draw/canvas.mjs").Canvas} c
 * @param {Widget} wd
 * @param {number} x
 * @param {number} y
 * @param {number} cw Cell width.
 * @param {number} fs
 */
function draw(c, wd, x, y, cw, fs) {
  const theme = c.theme;
  const ink = theme.ink;
  const line = { stroke: ink, strokeWidth: 1.2 };
  const soft = { stroke: theme.muted, strokeWidth: 1 };
  const text = (/** @type {number} */ tx, /** @type {number} */ ty) =>
    wd.t !== "grid" && wd.laid && c.richText(wd.laid, tx, ty, { color: ink, align: "left" });
  switch (wd.t) {
    case "grid": {
      let top = y;
      if (wd.kind === "group") {
        // Square like the other salt frames: Excalidraw's adaptive corner radius would
        // turn a narrow, tall group into a pill.
        c.rect(x, y + fs * 0.6, wd.w, wd.h - fs * 0.6, { ...soft, rounded: false });
        if (wd.title) {
          const t = layoutText(wd.title, { fontSize: fs * 0.9 });
          c.rect(x + GROUP_TITLE_INSET, y, t.width + GROUP_TITLE_PAD, t.height, {
            fill: theme.surface ?? theme.background,
            stroke: "transparent",
            strokeWidth: 1,
            roughness: 0,
          });
          c.richText(t, x + GROUP_TITLE_INSET + GROUP_TITLE_PAD / 2, y, { color: ink });
        }
        top += fs * 1.4;
      }
      if (wd.kind === "tabs" || wd.kind === "menu") {
        let tx = x;
        const row = wd.rows[0] ?? [];
        const th = Math.max(0, ...row.map((r) => r.h)) + 10;
        row.forEach((cell, i) => {
          const w = cell.w + 20;
          if (wd.kind === "tabs")
            c.rect(tx, y, w, th, {
              ...line,
              fill: i === 0 ? (theme.surface ?? theme.background) : theme.roles.muted.fill,
              rounded: false,
            });
          draw(c, cell, tx + 10, y + 5, cell.w, fs);
          tx += w;
        });
        if (wd.kind === "menu")
          c.line(
            [
              [x, y + th],
              [Math.max(tx, x + wd.w), y + th],
            ],
            soft,
          );
        else c.rect(x, y + th, Math.max(wd.w, tx - x), wd.h - th, line);
        let ry = y + th + 4;
        for (const r of wd.rows.slice(1)) {
          let rx = x + 6;
          for (const cell of r) {
            draw(c, cell, rx, ry, cell.w, fs);
            rx += cell.w + 10;
          }
          ry += Math.max(...r.map((cc) => cc.h)) + 6;
        }
        return;
      }
      if (wd.kind === "scroll") {
        c.rect(x, y, wd.w, wd.h, line);
        c.rect(x + wd.w - 14, y, 14, wd.h, { ...soft, fill: theme.roles.muted.fill });
        c.rect(x + wd.w - 12, y + 16, 10, Math.max(10, wd.h * 0.3), {
          ...soft,
          fill: theme.muted,
          fillStyle: "solid",
        });
      }
      if (wd.border === "+" || wd.border === "#") c.rect(x, top, wd.w, wd.h - (top - y), line);
      let ry = top;
      wd.rows.forEach((row, ri) => {
        let rx = x;
        const rh = wd.rowH[ri];
        if (ri > 0 && (wd.border === "#" || wd.border === "-"))
          c.line(
            [
              [x, ry],
              [x + wd.w, ry],
            ],
            soft,
          );
        row.forEach((cell, ci) => {
          const cwid = wd.colW[ci] ?? cell.w;
          if (ci > 0 && (wd.border === "#" || wd.border === "!"))
            c.line(
              [
                [rx, ry],
                [rx, ry + rh],
              ],
              soft,
            );
          const pad = wd.border ? 8 : 4;
          if (cell.t === "sep") {
            const style = cell.sep === ".." ? "dotted" : cell.sep === "~~" ? "dashed" : "solid";
            c.line(
              [
                [x + 4, ry + rh / 2],
                [x + wd.w - 4, ry + rh / 2],
              ],
              { ...soft, strokeStyle: style, strokeWidth: cell.sep === "==" ? 2 : 1 },
            );
          } else draw(c, cell, rx + pad, ry + (rh - cell.h) / 2, cwid - pad * 2, fs);
          rx += cwid;
        });
        ry += rh;
      });
      return;
    }
    case "button":
      c.rect(x, y, Math.max(wd.w, cw), wd.h, {
        ...line,
        fill: theme.roles.muted.fill,
        rounded: true,
      });
      if (wd.laid)
        c.richText(wd.laid, x + (Math.max(wd.w, cw) - wd.laid.width) / 2, y + 5, { color: ink });
      return;
    case "field":
      c.rect(x, y, Math.max(wd.w, cw), wd.h, { ...line, fill: theme.surface ?? theme.background });
      text(x + 7, y + 4);
      return;
    case "check":
      c.rect(x, y + wd.h / 2 - 7, 14, 14, { ...line, fill: theme.surface ?? theme.background });
      if (wd.on)
        c.line(
          [
            [x + 3, y + wd.h / 2],
            [x + 6, y + wd.h / 2 + 4],
            [x + 12, y + wd.h / 2 - 5],
          ],
          { stroke: ink, strokeWidth: 2 },
        );
      text(x + 22, y);
      return;
    case "radio":
      c.ellipse(x, y + wd.h / 2 - 7, 14, 14, { ...line, fill: theme.surface ?? theme.background });
      if (wd.on)
        c.ellipse(x + 4, y + wd.h / 2 - 3, 6, 6, { fill: ink, stroke: ink, fillStyle: "solid" });
      text(x + 22, y);
      return;
    case "drop": {
      const w = Math.max(wd.w, cw);
      c.rect(x, y, w, wd.h, { ...line, fill: theme.surface ?? theme.background });
      c.line(
        [
          [x + w - 22, y],
          [x + w - 22, y + wd.h],
        ],
        soft,
      );
      c.line(
        [
          [x + w - 16, y + wd.h / 2 - 3],
          [x + w - 11, y + wd.h / 2 + 3],
          [x + w - 6, y + wd.h / 2 - 3],
        ],
        { stroke: ink, strokeWidth: 1.5 },
      );
      text(x + 7, y + 4);
      return;
    }
    case "treeitem": {
      const indent = ((wd.depth ?? 1) - 1) * 18;
      if ((wd.depth ?? 1) > 1)
        c.line(
          [
            [x + indent - 12, y - 4],
            [x + indent - 12, y + wd.h / 2],
            [x + indent - 2, y + wd.h / 2],
          ],
          soft,
        );
      c.rect(x + indent, y + wd.h / 2 - 4, 8, 8, { ...soft, fill: theme.roles.muted.fill });
      text(x + indent + 14, y + 1);
      return;
    }
    default:
      text(x, y);
  }
}

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 */
function parseSalt(lines, module) {
  const meta = createMeta();
  /** @type {string[]} */
  const body = [];
  for (const l of lines) {
    const t = l.text.trim();
    if (/^salt$/i.test(t)) continue;
    if (body.length === 0 && /^(title|caption|header|footer|scale|skinparam)\b/i.test(t)) {
      parseCommon(t, meta, /** @type {any} */ ({ until: () => [], braceBlock: () => [] }));
      continue;
    }
    body.push(l.text);
  }
  const text = body.join("\n").trim();
  const open = text.indexOf("{");
  const close = text.lastIndexOf("}");
  if (open < 0 || close < 0)
    return {
      meta,
      root: parseBlock("", text.split("\n"), { n: 0, max: module.limits.maxNodes * 4 }),
    };
  const inner = text.slice(open + 1, close);
  const nl = inner.indexOf("\n");
  const head = nl < 0 ? inner : inner.slice(0, nl);
  const rest = nl < 0 ? [] : inner.slice(nl + 1).split("\n");
  const isMarker = /^(T|\/|\*|S[IV-]?|\^|[+#!-])/.test(head.trim());
  return {
    meta,
    root: parseBlock(isMarker ? head : "", isMarker ? rest : [head, ...rest], {
      n: 0,
      max: module.limits.maxNodes * 4,
    }),
  };
}

export default defineDiagram({
  kind: "salt",
  title: "Salt wireframe",
  starts: ["salt", "uml"],
  detect: (lines) => score(lines.slice(0, 3), [[/^salt$/i, 20]]),
  parse: parseSalt,
  layout: (model, ctx) => {
    measure(model.root, ctx.theme.fontSize * 0.9);
    return { root: model.root, fs: ctx.theme.fontSize * 0.9 };
  },
  draw: (laid, c) => {
    const root = laid.root;
    c.rect(-10, -10, root.w + 20, root.h + 20, {
      stroke: c.theme.muted,
      strokeWidth: 1.5,
      fill: c.theme.surface ?? c.theme.background,
      rounded: true,
    });
    draw(c, root, 0, 0, root.w, laid.fs);
  },
});
