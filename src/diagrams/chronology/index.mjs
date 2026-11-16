/**
 * Chronology diagrams (`@startchronology`): events (`happens on`) and spans
 * (`lasts from … to …`) on a horizontal time line, with labelled links.
 * @module diagrams/chronology
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { runRules } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle, paletteAt } from "../../draw/theme.mjs";
import { parseDay, dayDate } from "../gantt/index.mjs";

/**
 * @typedef {object} ChronoEvent
 * @property {string} id
 * @property {string} label
 * @property {number} start
 * @property {number} end
 * @property {boolean} span
 * @property {string | null} color
 */

/**
 * @typedef {object} ChronoModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {ChronoEvent[]} events
 * @property {{ from: string, to: string, label: string | null }[]} links
 * @property {number | null} min
 * @property {number | null} max
 */

/**
 * Find an event by full label or by label prefix before `:`.
 * @param {ChronoModel} model
 * @param {string} name
 */
function findEvent(model, name) {
  return (
    model.events.find((e) => e.id === name) ??
    model.events.find((e) => e.id.split(":")[0].trim() === name.trim())
  );
}

/** @type {import("../../syntax/reader.mjs").Rule<{ model: ChronoModel }>[]} */
const RULES = [
  (line, ctx, reader) => parseCommon(line, ctx.model.meta, reader),
  (line, ctx) => {
    const m = /^(starts|ends)\s+(?:on\s+)?(\S+)$/i.exec(line);
    if (!m) return false;
    const d = parseDay(m[2]);
    if (m[1].toLowerCase() === "starts") ctx.model.min = d;
    else ctx.model.max = d;
    return true;
  },
  (line, ctx) => {
    const m =
      /^\[([^\]]+)\]\s+happens\s+(?:on|at)\s+(\S+)(?:\s+(?:is\s+colou?red\s+in\s+)?(#\S+))?/i.exec(
        line,
      );
    if (!m) return false;
    const d = parseDay(m[2]);
    if (d === null) return false;
    ctx.model.events.push({
      id: m[1],
      label: label(m[1]),
      start: d,
      end: d,
      span: false,
      color: parseColorSpec(m[3]).fill ?? null,
    });
    return true;
  },
  (line, ctx) => {
    const m =
      /^\[([^\]]+)\]\s+(?:lasts\s+)?from\s+(\S+)\s+to\s+(\S+)(?:\s+(?:is\s+colou?red\s+in\s+)?(#\S+))?/i.exec(
        line,
      );
    if (!m) return false;
    const a = parseDay(m[2]);
    const b = parseDay(m[3]);
    if (a === null || b === null) return false;
    ctx.model.events.push({
      id: m[1],
      label: label(m[1]),
      start: Math.min(a, b),
      end: Math.max(a, b),
      span: true,
      color: parseColorSpec(m[4]).fill ?? null,
    });
    return true;
  },
  (line, ctx) => {
    const m = /^\[([^\]]+)\]\s*->\s*\[([^\]]+)\](?:\s*:\s*(.*))?$/.exec(line);
    if (!m) return false;
    ctx.model.links.push({ from: m[1], to: m[2], label: m[3] ? label(m[3]) : null });
    return true;
  },
];

/**
 * @param {ChronoModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutChrono(model, ctx) {
  const fs = ctx.theme.fontSize * 0.85;
  const days = model.events.flatMap((e) => [e.start, e.end]);
  const min = model.min ?? (days.length ? Math.min(...days) - 3 : 0);
  const max = Math.max(model.max ?? -Infinity, ...days.map((d) => d + 3), min + 1);
  const span = Math.max(1, max - min);
  const width = Math.max(700, Math.min(2400, model.events.length * 150));
  const scale = width / span;
  const items = model.events
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((e, i) => {
      const text = layoutText(e.label, { fontSize: fs, maxWidth: 200 });
      return { e, text, x1: (e.start - min) * scale, x2: (e.end - min) * scale, lane: 0, index: i };
    });
  // Alternate above/below the axis; push further out when labels collide.
  /** @type {{ x1: number, x2: number }[][]} */
  const lanes = [[], [], [], [], [], []];
  for (const it of items) {
    const side = it.index % 2;
    const lx1 = (it.x1 + it.x2) / 2 - it.text.width / 2 - 6;
    const lx2 = lx1 + it.text.width + 12;
    let lane = side;
    while (lane < lanes.length - 2 && lanes[lane].some((r) => r.x1 < lx2 && lx1 < r.x2)) lane += 2;
    lanes[lane].push({ x1: lx1, x2: lx2 });
    it.lane = lane;
  }
  return { model, items, min, max, scale, width, fs };
}

/**
 * @param {ReturnType<typeof layoutChrono>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawChrono(laid, c) {
  const { items, min, max, scale, width, fs, model } = laid;
  const theme = c.theme;
  const axis = roleStyle(theme, "axis");
  const y0 = 200;
  c.arrow(
    [
      [-20, y0],
      [width + 30, y0],
    ],
    { stroke: axis.stroke, strokeWidth: 2, end: "arrow" },
  );
  /** @type {(() => void)[]} Tick dates are drawn last, above spans and connectors. */
  const tickLabels = [];
  // ticks at month starts
  for (let d = min; d <= max; d++) {
    const date = dayDate(d);
    if (date.getUTCDate() !== 1 && d !== min) continue;
    const x = (d - min) * scale;
    c.line(
      [
        [x, y0 - 5],
        [x, y0 + 5],
      ],
      { stroke: axis.stroke, strokeWidth: 1.5 },
    );
    tickLabels.push(() => {
      const label = date.toISOString().slice(0, 10);
      const w = layoutText(label, { fontSize: fs * 0.7 }).width;
      c.rect(x - w / 2 - 2, y0 + 12, w + 4, fs * 0.7 * 1.25, {
        fill: theme.background,
        stroke: "transparent",
        strokeWidth: 1,
        roughness: 0,
      });
      c.text(label, x, y0 + 12, { size: fs * 0.7, color: theme.muted, align: "center" });
    });
  }
  /** @type {Map<string, { x: number, y: number }>} */
  const anchors = new Map();
  items.forEach((it, i) => {
    const pal = paletteAt(theme, i);
    const color = it.e.color ?? pal.stroke;
    const above = it.lane % 2 === 0;
    const level = Math.floor(it.lane / 2);
    const cx = (it.x1 + it.x2) / 2;
    const labelY = above ? y0 - 70 - level * 52 - it.text.height : y0 + 60 + level * 52;
    if (it.e.span) {
      c.rect(it.x1, y0 - 7, Math.max(6, it.x2 - it.x1), 14, {
        fill: it.e.color ?? pal.fill,
        stroke: color,
        rounded: true,
      });
    } else c.ellipse(cx - 7, y0 - 7, 14, 14, { fill: color, stroke: color, fillStyle: "solid" });
    const ly1 = above ? labelY + it.text.height + 8 : labelY - 4;
    c.line(
      [
        [cx, above ? y0 - 8 : y0 + 8],
        [cx, ly1],
      ],
      { stroke: color, strokeWidth: 1, strokeStyle: "dotted" },
    );
    c.rect(cx - it.text.width / 2 - 8, labelY - 4, it.text.width + 16, it.text.height + 8, {
      fill: pal.fill,
      stroke: color,
      rounded: true,
      strokeWidth: 1,
    });
    c.richText(it.text, cx - it.text.width / 2, labelY, { color: theme.ink });
    anchors.set(it.e.id, { x: cx, y: y0 });
  });
  // Links arc just above the axis, below the first label row.
  for (const l of model.links) {
    const from = findEvent(model, l.from);
    const to = findEvent(model, l.to);
    if (!from || !to) continue;
    const a = anchors.get(from.id);
    const b = anchors.get(to.id);
    if (!a || !b) continue;
    const top = y0 - 30;
    c.arrow(
      [
        [a.x, y0 - 9],
        [a.x, top],
        [b.x, top],
        [b.x, y0 - 9],
      ],
      { stroke: theme.muted, strokeWidth: 1, strokeStyle: "dashed", end: "arrow", roughness: 0 },
    );
    if (l.label) {
      const t = layoutText(l.label, { fontSize: fs * 0.75 });
      const lx = (a.x + b.x) / 2 - t.width / 2;
      c.rect(lx - 3, top - t.height / 2 - 1, t.width + 6, t.height + 2, {
        fill: theme.background,
        stroke: "transparent",
        strokeWidth: 1,
        roughness: 0,
      });
      c.richText(t, lx, top - t.height / 2, { color: theme.muted });
    }
  }
  for (const draw of tickLabels) draw();
}

export default defineDiagram({
  kind: "chronology",
  title: "Chronology",
  starts: ["chronology"],
  parse: (lines, module) => {
    /** @type {ChronoModel} */
    const model = { meta: createMeta(), events: [], links: [], min: null, max: null };
    runRules(lines, RULES, { model }, module.diagnostics);
    return model;
  },
  layout: layoutChrono,
  draw: drawChrono,
});
