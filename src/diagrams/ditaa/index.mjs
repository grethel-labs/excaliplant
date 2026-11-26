/**
 * Ditaa ASCII-art diagrams (`@startditaa` or `ditaa` inside `@startuml`).
 * The character grid is traced into boxes (filled, with colour tags such as
 * `cBLU` / `c8AF`, rounded corners `/ \`), line segments (dashed with `:`
 * and `=`), arrowheads (`< > ^ v`), points (`*`) and text runs.
 * @module diagrams/ditaa
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta } from "../../syntax/commons.mjs";
import { roleStyle, themeColor } from "../../draw/theme.mjs";
import { LimitError } from "../../core/errors.mjs";

const CW = 11;
const CH = 22;
const TAGS = new Map(
  Object.entries({
    RED: "special.ditaa-red.fill",
    GRE: "special.ditaa-gre.fill",
    BLU: "special.ditaa-blu.fill",
    YEL: "special.ditaa-yel.fill",
    PNK: "special.ditaa-pnk.fill",
    BLK: "special.ditaa-blk.fill",
    WHI: "special.ditaa-whi.fill",
  }),
);
const CORNER = new Set(["+", "/", "\\"]);
const H = new Set(["-", "=", "+", "/", "\\"]);
const V = new Set(["|", ":", "+", "/", "\\"]);

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 */
function parseDitaa(lines, module) {
  const rows = lines
    .map((l) => l.text.replace(/\t/g, "    "))
    .filter(
      (l, i, a) =>
        !(i === 0 && /^ditaa\b/i.test(l.trim())) &&
        !(/^\s*$/.test(l) && (i === 0 || i === a.length - 1)),
    );
  if (rows.length > 500 || rows.some((r) => r.length > 500))
    throw new LimitError("Ditaa grid too large");
  void module;
  return { meta: createMeta(), grid: rows.map((r) => [...r]) };
}

/**
 * @param {{ grid: string[][] }} model
 */
function trace(model) {
  const g = model.grid;
  const at = (/** @type {number} */ r, /** @type {number} */ c) => g[r]?.[c] ?? " ";
  /** @type {{ x1: number, y1: number, x2: number, y2: number, dashed: boolean, startHead: boolean, endHead: boolean }[]} */
  const segments = [];
  /** @type {boolean[][]} */
  const used = g.map((r) => r.map(() => false));
  // Line runs. Arrowhead characters at either end belong to the run, so the
  // segment becomes a real arrow whose tip reaches the neighbouring border.
  /** @param {number} r @param {number} c */
  const isH = (r, c) => H.has(at(r, c));
  /** @param {number} r @param {number} c */
  const isV = (r, c) => V.has(at(r, c));
  for (let r = 0; r < g.length; r++) {
    let c = 0;
    while (c < g[r].length) {
      const ch = at(r, c);
      const opensWithHead = ch === "<" && /[-=]/.test(at(r, c + 1));
      if (!opensWithHead && !(isH(r, c) && (/[-=]/.test(ch) || /[-=]/.test(at(r, c + 1))))) {
        c++;
        continue;
      }
      const start = c;
      let dashed = false;
      if (opensWithHead) c++;
      while (isH(r, c)) {
        if (at(r, c) === "=") dashed = true;
        c++;
      }
      const endHead = at(r, c) === ">" && /[-=]/.test(at(r, c - 1));
      if (endHead) c++;
      if (c - start >= 2 || /[-=]/.test(at(r, start))) {
        segments.push({
          x1: start,
          y1: r,
          x2: c - 1,
          y2: r,
          dashed,
          startHead: opensWithHead,
          endHead,
        });
        for (let k = start; k < c; k++) if (!CORNER.has(at(r, k))) used[r][k] = true;
      }
    }
  }
  for (let c = 0; c < Math.max(...g.map((row) => row.length), 0); c++) {
    let r = 0;
    while (r < g.length) {
      const ch = at(r, c);
      const opensWithHead = ch === "^" && /[|:]/.test(at(r + 1, c));
      if (!opensWithHead && !(isV(r, c) && (/[|:]/.test(ch) || /[|:]/.test(at(r + 1, c))))) {
        r++;
        continue;
      }
      const start = r;
      let dashed = false;
      if (opensWithHead) r++;
      while (isV(r, c)) {
        if (at(r, c) === ":") dashed = true;
        r++;
      }
      const endHead = at(r, c) === "v" && /[|:]/.test(at(r - 1, c));
      if (endHead) r++;
      if (r - start >= 2 || /[|:]/.test(at(start, c))) {
        segments.push({
          x1: c,
          y1: start,
          x2: c,
          y2: r - 1,
          dashed,
          startHead: opensWithHead,
          endHead,
        });
        for (let k = start; k < r; k++) if (!CORNER.has(at(k, c))) used[k][c] = true;
      }
    }
  }
  // boxes: '+' (or rounded corner) top-left with matching corners
  /** @type {{ r1: number, c1: number, r2: number, c2: number, rounded: boolean, color: string | null, dashed: boolean, shape: string | null }[]} */
  const boxes = [];
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[r].length; c++) {
      if (!CORNER.has(at(r, c)) || !/[-=]/.test(at(r, c + 1)) || !/[|:+]/.test(at(r + 1, c)))
        continue;
      // Edges may pass through '+' junctions: try every candidate corner pair.
      let found = null;
      for (let c2 = c + 1; c2 < g[r].length && H.has(at(r, c2)) && !found; c2++) {
        if (!CORNER.has(at(r, c2)) || !/[|:+]/.test(at(r + 1, c2))) continue;
        for (let r2 = r + 1; r2 < g.length && V.has(at(r2, c)); r2++) {
          if (!CORNER.has(at(r2, c)) || !CORNER.has(at(r2, c2)) || r2 === r + 1) continue;
          let ok = true;
          for (let k = c + 1; k < c2 && ok; k++) ok = H.has(at(r2, k));
          for (let k = r + 1; k < r2 && ok; k++) ok = V.has(at(k, c2));
          if (ok) {
            found = { r2, c2 };
            break;
          }
        }
      }
      if (!found) continue;
      const { r2, c2 } = found;
      let color = null;
      let shape = null;
      let dashed = false;
      for (let rr = r + 1; rr < r2; rr++) {
        const line = g[rr].slice(c + 1, c2).join("");
        const tag = /c([A-Z]{3}|[0-9A-Fa-f]{3})\b/.exec(line);
        if (tag) {
          const named = TAGS.get(tag[1]);
          color =
            named ??
            `#${tag[1]
              .split("")
              .map((d) => d + d)
              .join("")}`;
          for (let k = 0; k < tag[0].length; k++) g[rr][c + 1 + tag.index + k] = " ";
        }
        const sh = /\{(d|s|io|c|mo|tr|o)\}/.exec(line);
        if (sh) {
          shape = sh[1];
          for (let k = 0; k < sh[0].length; k++) g[rr][c + 1 + sh.index + k] = " ";
        }
      }
      for (let k = c; k <= c2; k++) if (at(r, k) === "=" || at(r2, k) === "=") dashed = true;
      boxes.push({
        r1: r,
        c1: c,
        r2,
        c2,
        rounded: at(r, c) === "/" || at(r, c2) === "\\",
        color,
        dashed,
        shape,
      });
    }
  }
  // arrowheads and points
  /** @type {{ r: number, c: number, dir: string }[]} */
  const heads = [];
  /** @type {{ r: number, c: number }[]} */
  const points = [];
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[r].length; c++) {
      const ch = at(r, c);
      if (used[r][c]) continue;
      if (ch === ">" && H.has(at(r, c - 1))) heads.push({ r, c, dir: "right" });
      else if (ch === "<" && H.has(at(r, c + 1))) heads.push({ r, c, dir: "left" });
      else if (ch === "^" && V.has(at(r + 1, c))) heads.push({ r, c, dir: "up" });
      else if (ch === "v" && V.has(at(r - 1, c)) && !/\w/.test(at(r, c - 1) + at(r, c + 1)))
        heads.push({ r, c, dir: "down" });
      else if (
        ch === "*" &&
        (H.has(at(r, c - 1)) || H.has(at(r, c + 1)) || V.has(at(r - 1, c)) || V.has(at(r + 1, c)))
      )
        points.push({ r, c });
      else continue;
      used[r][c] = true;
    }
  }
  // text runs
  /** @type {{ r: number, c: number, text: string }[]} */
  const texts = [];
  for (let r = 0; r < g.length; r++) {
    let c = 0;
    while (c < g[r].length) {
      const ch = at(r, c);
      if (
        ch === " " ||
        used[r][c] ||
        CORNER.has(ch) ||
        (V.has(ch) && ch !== "/" && ch !== "\\") ||
        (/[-=]/.test(ch) && (H.has(at(r, c + 1)) || H.has(at(r, c - 1))))
      ) {
        c++;
        continue;
      }
      const start = c;
      let text = "";
      while (
        c < g[r].length &&
        !used[r][c] &&
        !(at(r, c) === "|" || (at(r, c) === "+" && /[-|]/.test(at(r, c + 1) + at(r + 1, c)))) &&
        !(at(r, c) === " " && at(r, c + 1) === " ")
      )
        text += at(r, c++);
      if (text.trim()) texts.push({ r, c: start, text: text.trim() });
      else c++;
    }
  }
  return { segments, boxes, heads, points, texts, grid: g };
}

/**
 * @param {ReturnType<typeof trace>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawDitaa(laid, c) {
  const theme = c.theme;
  const ink = theme.ink;
  const base = roleStyle(theme, "default");
  const px = (/** @type {number} */ col) => col * CW + CW / 2;
  const py = (/** @type {number} */ row) => row * CH + CH / 2;
  for (const b of laid.boxes) {
    const x = px(b.c1);
    const y = py(b.r1);
    const w = px(b.c2) - x;
    const h = py(b.r2) - y;
    const style = {
      fill: (b.color?.startsWith("special.") ? themeColor(theme, b.color) : b.color) ?? base.fill,
      stroke: ink,
      strokeStyle: /** @type {any} */ (b.dashed ? "dashed" : "solid"),
      rounded: b.rounded,
    };
    if (b.shape === "d") {
      c.line(
        [
          [x, y],
          [x + w, y],
          [x + w, y + h - 6],
          [x + w * 0.75, y + h - 10],
          [x + w / 2, y + h],
          [x + w / 4, y + h + 4],
          [x, y + h - 2],
        ],
        { ...style, closed: true, curved: true },
      );
    } else if (b.shape === "s") {
      c.ellipse(x, y - 6, w, 12, style);
      c.rect(x, y, w, h, style);
    } else if (b.shape === "io") {
      c.line(
        [
          [x + 8, y],
          [x + w, y],
          [x + w - 8, y + h],
          [x, y + h],
        ],
        { ...style, closed: true },
      );
    } else if (b.shape === "c") {
      c.diamond(x, y, w, h, style);
    } else if (b.shape === "o") {
      c.ellipse(x, y, w, h, style);
    } else c.rect(x, y, w, h, style);
  }
  for (const s of laid.segments) {
    const inBox = laid.boxes.some(
      (b) =>
        (s.y1 === s.y2 && (s.y1 === b.r1 || s.y1 === b.r2) && s.x1 >= b.c1 && s.x2 <= b.c2) ||
        (s.x1 === s.x2 && (s.x1 === b.c1 || s.x1 === b.c2) && s.y1 >= b.r1 && s.y2 <= b.r2),
    );
    if (inBox) continue;
    const horizontal = s.y1 === s.y2;
    /** @type {[number, number]} */
    const a = [px(s.x1), py(s.y1)];
    /** @type {[number, number]} */
    const b = [px(s.x2), py(s.y2)];
    // Arrow tips reach the edge of their cell, or the border line right behind it.
    const tip = (
      /** @type {[number, number]} */ p,
      /** @type {number} */ dir,
      /** @type {number} */ r,
      /** @type {number} */ col,
    ) => {
      const nr = horizontal ? r : r + dir;
      const nc = horizontal ? col + dir : col;
      const border = /[|+\-=:]/.test(laid.grid[nr]?.[nc] ?? " ");
      const reach = border ? (horizontal ? CW : CH) : (horizontal ? CW : CH) / 2;
      return /** @type {[number, number]} */ (
        horizontal ? [p[0] + dir * reach, p[1]] : [p[0], p[1] + dir * reach]
      );
    };
    if (s.startHead) {
      const t = tip(a, -1, s.y1, s.x1);
      a[0] = t[0];
      a[1] = t[1];
    }
    if (s.endHead) {
      const t = tip(b, 1, s.y2, s.x2);
      b[0] = t[0];
      b[1] = t[1];
    }
    const style = {
      stroke: ink,
      strokeWidth: 1.5,
      strokeStyle: /** @type {"dashed" | "solid"} */ (s.dashed ? "dashed" : "solid"),
      roughness: c.theme.edgeRoughness,
    };
    if (s.startHead || s.endHead)
      c.arrow([a, b], {
        ...style,
        start: s.startHead ? "triangle" : null,
        end: s.endHead ? "triangle" : null,
      });
    else c.line([a, b], style);
  }
  for (const h of laid.heads) {
    const x = px(h.c);
    const y = py(h.r);
    const d = 6;
    /** @type {Record<string, [number, number][]>} */
    const shapes = {
      right: [
        [x - d, y - d],
        [x + d / 2, y],
        [x - d, y + d],
      ],
      left: [
        [x + d, y - d],
        [x - d / 2, y],
        [x + d, y + d],
      ],
      up: [
        [x - d, y + d],
        [x, y - d / 2],
        [x + d, y + d],
      ],
      down: [
        [x - d, y - d],
        [x, y + d / 2],
        [x + d, y - d],
      ],
    };
    c.line(shapes[h.dir], {
      closed: true,
      fill: ink,
      stroke: ink,
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: theme.edgeRoughness,
    });
  }
  for (const p of laid.points)
    c.ellipse(px(p.c) - 4, py(p.r) - 4, 8, 8, {
      fill: theme.surface ?? theme.background,
      stroke: ink,
      strokeWidth: 1.5,
    });
  for (const t of laid.texts)
    c.text(t.text, t.c * CW, t.r * CH + (CH - 16 * 1.25) / 2, { size: 16, color: ink });
}

export default defineDiagram({
  kind: "ditaa",
  title: "Ditaa ASCII art",
  starts: ["ditaa", "uml"],
  raw: true,
  detect: (lines) => (lines.slice(0, 3).some((l) => /^ditaa\b/i.test(l.text.trim())) ? 50 : 0),
  parse: parseDitaa,
  layout: (model) => trace(model),
  draw: drawDitaa,
});
