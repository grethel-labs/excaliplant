/**
 * MindMap and WBS diagrams built on the shared outline parser.
 * @module diagrams/tree
 */

import { defineDiagram } from "../../core/registry.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { paletteAt } from "../../draw/theme.mjs";
import { parseOutline } from "./parse.mjs";

/** @typedef {import("./parse.mjs").TreeNode} TreeNode */
/** @typedef {import("../../layout/measure.mjs").RichLayout} RichLayout */

/**
 * @typedef {TreeNode & { x: number, y: number, w: number, h: number, laid: RichLayout, kids: Placed[] }} Placed
 */

const H_GAP = 44;
const V_GAP = 14;

/**
 * Measure a node (and its subtree) for drawing.
 * @param {TreeNode} n
 * @param {number} fs
 * @returns {Placed}
 */
function measure(n, fs) {
  const root = n.depth === 0;
  const laid = layoutText(n.text, { fontSize: root ? fs * 1.15 : fs * (n.depth > 1 ? 0.9 : 1), bold: root, maxWidth: 260 });
  const w = n.boxless ? laid.width + 8 : laid.width + 30;
  const h = n.boxless ? laid.height + 6 : laid.height + 16;
  return { ...n, x: 0, y: 0, w, h, laid, kids: n.children.map((c) => measure(c, fs)) };
}

/** @param {Placed} n @returns {number} */
function span(n) {
  if (!n.kids.length) return n.h;
  return Math.max(n.h, n.kids.reduce((s, k) => s + span(k), 0) + V_GAP * (n.kids.length - 1));
}

/**
 * Place a horizontal subtree. `edge` is the inner x edge (left edge for the right side).
 * @param {Placed} n
 * @param {number} edge
 * @param {number} top
 * @param {1 | -1} dir
 */
function placeHorizontal(n, edge, top, dir) {
  const s = span(n);
  n.y = top + s / 2;
  n.x = edge + (dir * n.w) / 2;
  let y = top + (s - (n.kids.reduce((a, k) => a + span(k), 0) + V_GAP * Math.max(0, n.kids.length - 1))) / 2;
  for (const k of n.kids) {
    placeHorizontal(k, n.x + (dir * n.w) / 2 + dir * H_GAP, y, dir);
    y += span(k) + V_GAP;
  }
}

/**
 * @param {import("./parse.mjs").TreeModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutMindmap(model, ctx) {
  const fs = ctx.theme.fontSize;
  const roots = model.roots.map((r) => measure(r, fs));
  let offsetY = 0;
  for (const root of roots) {
    const right = root.kids.filter((k) => k.side !== "left");
    const left = root.kids.filter((k) => k.side === "left");
    const total = (/** @type {Placed[]} */ list) => list.reduce((s, k) => s + span(k), 0) + V_GAP * Math.max(0, list.length - 1);
    const h = Math.max(root.h, total(right), total(left));
    root.x = 0;
    root.y = offsetY + h / 2;
    let y = offsetY + (h - total(right)) / 2;
    for (const k of right) {
      placeHorizontal(k, root.w / 2 + H_GAP, y, 1);
      y += span(k) + V_GAP;
    }
    y = offsetY + (h - total(left)) / 2;
    for (const k of left) {
      placeHorizontal(k, -root.w / 2 - H_GAP, y, -1);
      y += span(k) + V_GAP;
    }
    offsetY += h + 60;
  }
  return { roots, kind: "mindmap" };
}

/**
 * WBS: first level in a row below the root, deeper levels as indented lists.
 * @param {import("./parse.mjs").TreeModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutWbs(model, ctx) {
  const fs = ctx.theme.fontSize;
  const roots = model.roots.map((r) => measure(r, fs));
  let offsetY = 0;
  /** @param {Placed} n @param {number} x @param {number} y @returns {{ w: number, h: number }} */
  const list = (n, x, y) => {
    n.x = x + n.w / 2;
    n.y = y + n.h / 2;
    let w = n.w;
    let cy = y + n.h + 12;
    for (const k of n.kids) {
      const r = list(k, x + 24, cy);
      w = Math.max(w, r.w + 24);
      cy += r.h + 12;
    }
    return { w, h: cy - y - 12 };
  };
  for (const root of roots) {
    const top = offsetY + root.h + 40;
    const sizes = root.kids.map((k) => {
      const tmp = list(k, 0, 0);
      return tmp;
    });
    const total = sizes.reduce((s, z) => s + z.w, 0) + 30 * Math.max(0, sizes.length - 1);
    let x = -total / 2;
    root.kids.forEach((k, i) => {
      list(k, x, top);
      x += sizes[i].w + 30;
    });
    root.x = 0;
    root.y = offsetY + root.h / 2;
    offsetY = top + Math.max(0, ...sizes.map((z) => z.h)) + 60;
  }
  return { roots, kind: "wbs" };
}

/**
 * @param {{ roots: Placed[], kind: string }} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawTree(laid, c) {
  const theme = c.theme;
  /** @type {Map<Placed, string>} */
  const ids = new Map();
  /** @param {Placed} n */
  const drawNode = (n) => {
    const pal = n.depth === 0 ? { fill: theme.roles.muted.fill ?? theme.background, stroke: theme.ink } : paletteAt(theme, n.branch);
    const fill = n.colors.fill ?? (n.depth > 1 && laid.kind === "mindmap" ? mixLight(pal.fill, theme.background) : pal.fill);
    const stroke = n.colors.stroke ?? pal.stroke;
    const x = n.x - n.w / 2;
    const y = n.y - n.h / 2;
    let id;
    if (n.boxless) {
      id = c.line(
        [
          [x, y + n.h],
          [x + n.w, y + n.h],
        ],
        { stroke, strokeWidth: 1.5 },
      );
    } else id = c.rect(x, y, n.w, n.h, { fill, stroke, rounded: true, strokeWidth: n.depth === 0 ? 2.5 : 2 });
    ids.set(n, id);
    c.richText(n.laid, n.x - n.laid.width / 2, n.y - n.laid.height / 2, { color: n.colors.text ?? theme.ink });
    n.kids.forEach(drawNode);
  };
  /** @param {Placed} n */
  const drawEdges = (n) => {
    for (const k of n.kids) {
      const stroke = paletteAt(theme, k.branch).stroke;
      if (laid.kind === "mindmap") {
        const dir = k.x >= n.x ? 1 : -1;
        const a = /** @type {[number, number]} */ ([n.x + (dir * n.w) / 2, n.y]);
        const b = /** @type {[number, number]} */ ([k.x - (dir * k.w) / 2, k.y + (k.boxless ? k.h / 2 : 0)]);
        const mx = (a[0] + b[0]) / 2;
        c.line([a, [mx, a[1]], [mx, b[1]], b], { stroke, strokeWidth: Math.max(1.5, 3 - k.depth * 0.5), curved: true });
      } else if (n.depth === 0) {
        const busY = n.y + n.h / 2 + 20;
        c.line(
          [
            [n.x, n.y + n.h / 2],
            [n.x, busY],
            [k.x, busY],
            [k.x, k.y - k.h / 2],
          ],
          { stroke: theme.muted, strokeWidth: 1.5 },
        );
      } else {
        const sx = n.x - n.w / 2 + 12;
        c.line(
          [
            [sx, n.y + n.h / 2],
            [sx, k.y],
            [k.x - k.w / 2, k.y],
          ],
          { stroke: theme.muted, strokeWidth: 1.5 },
        );
      }
      drawEdges(k);
    }
  };
  for (const r of laid.roots) drawEdges(r);
  for (const r of laid.roots) drawNode(r);
}

/**
 * @param {string} color
 * @param {string} bg
 */
function mixLight(color, bg) {
  if (!/^#[0-9a-f]{6}/i.test(color) || !/^#[0-9a-f]{6}/i.test(bg)) return color;
  const a = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * 0.5).toString(16).padStart(2, "0")).join("")}`;
}

export const mindmapDiagram = defineDiagram({
  kind: "mindmap",
  title: "MindMap",
  starts: ["mindmap"],
  parse: parseOutline,
  layout: layoutMindmap,
  draw: drawTree,
});

export const wbsDiagram = defineDiagram({
  kind: "wbs",
  title: "Work breakdown structure",
  starts: ["wbs"],
  parse: parseOutline,
  layout: layoutWbs,
  draw: drawTree,
});
