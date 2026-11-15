/**
 * Activity diagrams (new syntax) with swimlanes, partitions and notes.
 * @module diagrams/activity
 */

import { defineDiagram } from "../../core/registry.mjs";
import { roleStyle } from "../../draw/theme.mjs";
import { SHAPES } from "../../draw/shapes.mjs";
import { mixColors, TRANSPARENT } from "../../syntax/color.mjs";
import { score } from "../detect.mjs";
import { parseActivity } from "./parse.mjs";
import { layoutActivity } from "./layout.mjs";

/** @typedef {import("../../draw/canvas.mjs").Canvas} Canvas */
/** @typedef {import("./layout.mjs").LNode} LNode */

/**
 * @param {ReturnType<typeof layoutActivity>} laid
 * @param {Canvas} c
 */
function drawActivity(laid, c) {
  const theme = c.theme;
  const ink = theme.ink;
  // swimlanes
  if (laid.lanes.length) {
    const s = roleStyle(theme, "swimlane");
    const total = laid.lanes.reduce((m, l) => Math.max(m, l.x + l.w), 0);
    for (const l of laid.lanes) {
      if (l.fill)
        c.rect(l.x, 0, l.w, laid.height, {
          fill: l.fill,
          stroke: TRANSPARENT,
          roughness: 0,
          opacity: 50,
        });
      c.richText(l.label, l.x + (l.w - l.label.width) / 2, 8, { color: s.text });
      c.line(
        [
          [l.x, 0],
          [l.x, laid.height],
        ],
        { stroke: s.stroke, strokeWidth: 1 },
      );
    }
    c.line(
      [
        [total, 0],
        [total, laid.height],
      ],
      { stroke: s.stroke, strokeWidth: 1 },
    );
    c.line(
      [
        [0, laid.laneHeader],
        [total, laid.laneHeader],
      ],
      { stroke: s.stroke, strokeWidth: 1 },
    );
  }
  for (const g of laid.groups) {
    const s = roleStyle(theme, "partition");
    c.rect(g.x, g.y, g.w, g.h, {
      stroke: s.stroke,
      strokeWidth: 1,
      fill: g.fill ?? TRANSPARENT,
      rounded: g.kind !== "partition",
      strokeStyle: g.kind === "group" ? "dashed" : "solid",
    });
    c.richText(g.text, g.x + 10, g.y + 6, { color: s.text, align: "left" });
    if (g.kind === "partition") {
      c.line(
        [
          [g.x, g.y + g.text.height + 12],
          [g.x + g.text.width + 20, g.y + g.text.height + 12],
          [g.x + g.text.width + 30, g.y],
        ],
        { stroke: s.stroke, strokeWidth: 1 },
      );
    }
  }
  /** @type {Map<number, string>} */
  const ids = new Map();
  for (const n of laid.nodes) {
    const id = c.group(() => drawNode(n, c));
    if (id) ids.set(n.id, id);
  }
  const edgeStyle = roleStyle(theme, "edge");
  for (const e of laid.edges) {
    if (e.style?.hidden || e.points.length < 2) continue;
    const intoJunction = e.to.kind === "junction" || e.to.kind === "kill";
    c.arrow(e.points, {
      stroke: e.style?.color ?? edgeStyle.stroke,
      strokeWidth: 1.5,
      strokeStyle: e.style?.lineStyle ?? "solid",
      end: intoJunction ? null : "triangle",
      roughness: theme.edgeRoughness,
      from: ids.get(e.from.id) ?? null,
      to: ids.get(e.to.id) ?? null,
    });
    if (e.label) {
      const [a, b] = e.points;
      const horizontal = Math.abs(a[1] - b[1]) < 0.5;
      const lx = horizontal ? (b[0] > a[0] ? a[0] + 6 : a[0] - e.label.width - 6) : a[0] + 6;
      const ly = horizontal ? a[1] - e.label.height - 2 : a[1] + 4;
      c.richText(e.label, lx, ly, { color: ink, align: "left" });
    }
  }
}

/**
 * @param {LNode} n
 * @param {Canvas} c
 * @returns {string | null}
 */
function drawNode(n, c) {
  const theme = c.theme;
  const ink = theme.ink;
  const x = n.x - n.w / 2;
  const y = n.y - n.h / 2;
  switch (n.kind) {
    case "start":
      return c.ellipse(x, y, n.w, n.h, { fill: ink, stroke: ink, fillStyle: "solid" });
    case "stop": {
      const id = c.ellipse(x, y, n.w, n.h, { fill: theme.background, stroke: ink });
      c.ellipse(x + 6, y + 6, n.w - 12, n.h - 12, { fill: ink, stroke: ink, fillStyle: "solid" });
      return id;
    }
    case "end": {
      const id = c.ellipse(x, y, n.w, n.h, { fill: theme.background, stroke: ink });
      const d = n.w * 0.22;
      c.line(
        [
          [x + d, y + d],
          [x + n.w - d, y + n.h - d],
        ],
        { stroke: ink },
      );
      c.line(
        [
          [x + n.w - d, y + d],
          [x + d, y + n.h - d],
        ],
        { stroke: ink },
      );
      return id;
    }
    case "kill":
      if (!n.w) return null;
      c.line(
        [
          [x, y],
          [x + n.w, y + n.h],
        ],
        { stroke: ink },
      );
      return c.line(
        [
          [x + n.w, y],
          [x, y + n.h],
        ],
        { stroke: ink },
      );
    case "bar":
      return c.rect(x, y, n.w, n.h, { fill: ink, stroke: ink, fillStyle: "solid", strokeWidth: 1 });
    case "junction":
      return null;
    case "merge": {
      const s = roleStyle(theme, "decision");
      return c.diamond(x, y, n.w, n.h, { fill: s.fill, stroke: s.stroke });
    }
    case "diamond": {
      const s = roleStyle(theme, "decision");
      let id;
      if (n.text) {
        const d = 14;
        id = c.line(
          [
            [x, n.y],
            [x + d, y],
            [x + n.w - d, y],
            [x + n.w, n.y],
            [x + n.w - d, y + n.h],
            [x + d, y + n.h],
          ],
          { closed: true, fill: s.fill, stroke: s.stroke },
        );
        c.richText(n.text, n.x - n.text.width / 2, n.y - n.text.height / 2, { color: s.text });
      } else id = c.diamond(x, y, n.w, n.h, { fill: s.fill, stroke: s.stroke });
      return id;
    }
    case "note": {
      const s = roleStyle(theme, "note", { fill: n.fill ?? undefined });
      const id = SHAPES.note.draw(c, x, y, n.w, n.h, {
        fill: s.fill,
        stroke: s.stroke,
        strokeWidth: 1,
      });
      if (n.text) c.richText(n.text, x + 10, y + 8, { color: s.text, align: "left" });
      return id;
    }
    case "connector": {
      const s = roleStyle(theme, "action", { fill: n.fill ?? undefined });
      const id = c.ellipse(x, y, n.w, n.h, { fill: s.fill, stroke: s.stroke });
      if (n.text)
        c.richText(n.text, n.x - n.text.width / 2, n.y - n.text.height / 2, { color: s.text });
      return id;
    }
    default: {
      const s = roleStyle(theme, "action", { fill: n.fill ?? undefined });
      const style = { fill: s.fill, stroke: n.fill ? mixColors(n.fill, ink, 0.5) : s.stroke };
      const id = actionShape(c, n.shape, x, y, n.w, n.h, style);
      if (n.text)
        c.richText(n.text, n.x - n.text.width / 2, n.y - n.text.height / 2, { color: s.text });
      return id;
    }
  }
}

/**
 * SDL-style action shapes selected by the closing character.
 * @param {Canvas} c
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {import("../../draw/canvas.mjs").Style} style
 */
function actionShape(c, kind, x, y, w, h, style) {
  const d = 12;
  /** @param {[number, number][]} pts */
  const poly = (pts) => c.line(pts, { ...style, closed: true });
  switch (kind) {
    case "|":
    case "]":
      return c.rect(x, y, w, h, style);
    case "<":
      return poly([
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x + d, y + h / 2],
      ]);
    case ">":
      return poly([
        [x, y],
        [x + w - d, y],
        [x + w, y + h / 2],
        [x + w - d, y + h],
        [x, y + h],
      ]);
    case "/":
      return poly([
        [x + d, y],
        [x + w, y],
        [x + w - d, y + h],
        [x, y + h],
      ]);
    case "}":
      return poly([
        [x + d, y],
        [x + w - d, y],
        [x + w, y + h / 2],
        [x + w - d, y + h],
        [x + d, y + h],
        [x, y + h / 2],
      ]);
    default:
      return c.rect(x, y, w, h, { ...style, rounded: true });
  }
}

export default defineDiagram({
  kind: "activity",
  title: "Activity diagram",
  starts: ["uml", "activity"],
  detect: (lines) =>
    score(lines, [
      [/^(start|stop|end|kill|detach)$/i, 3],
      [/^(#\S+)?:.*[;|<>/\]}]$/, 2],
      [/^:/, 1.5],
      [/^(if\s*\(.*\)\s*(then|is|equals)|elseif|endif|end\s+if)\b/i, 3],
      [
        /^(while\s*\(|endwhile|repeat|repeat\s*while|fork|fork\s+again|end\s+fork|split|end\s+split|switch\s*\(|endswitch|case\s*\()/i,
        3,
      ],
      [/^\|[^|]+\|/, 2],
      [/^partition\s/i, 2],
      [/^-+(\[.*\])?->/, 1],
    ]),
  parse: parseActivity,
  layout: (model, ctx) => layoutActivity(model, ctx),
  draw: (laid, canvas) => drawActivity(laid, canvas),
});
