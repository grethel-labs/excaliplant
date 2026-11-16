/**
 * Charts (`@startchart`): bar, line, area and scatter series over a
 * categorical horizontal axis, grouped or stacked bars, axis ranges,
 * legends, grid lines and annotations.
 * @module diagrams/chart
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { runRules } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle, paletteAt } from "../../draw/theme.mjs";
import { LimitError } from "../../core/errors.mjs";

/**
 * @typedef {object} ChartModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {string[]} categories
 * @property {{ kind: "bar" | "line" | "area" | "scatter", name: string, values: number[], color: string | null }[]} series
 * @property {[number, number] | null} range
 * @property {string | null} hLabel
 * @property {string | null} vLabel
 * @property {"grouped" | "stacked"} stack
 * @property {"left" | "right" | "top" | "bottom" | "none"} legend
 * @property {boolean} grid
 * @property {string[]} annotations
 */

/** @param {string} s */
const list = (s) =>
  s
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((x) => label(x.trim().replace(/^"|"$/g, "")))
    .filter((x) => x !== "");

/** @type {import("../../syntax/reader.mjs").Rule<{ model: ChartModel, module: import("../../core/registry.mjs").ModuleContext }>[]} */
const RULES = [
  (line, ctx) => {
    const m = /^h-axis\s+(?:"([^"]*)"\s+)?(\[.*\])\s*$/i.exec(line);
    if (!m) return false;
    ctx.model.hLabel = m[1] ? label(m[1]) : null;
    ctx.model.categories = list(m[2]);
    return true;
  },
  (line, ctx) => {
    const m = /^v-axis\s+(?:"([^"]*)"\s+)?(-?[\d.]+)\s*-->\s*(-?[\d.]+)/i.exec(line);
    if (!m) return false;
    ctx.model.vLabel = m[1] ? label(m[1]) : null;
    ctx.model.range = [Number(m[2]), Number(m[3])];
    return true;
  },
  (line, ctx) => {
    const m = /^(bar|line|area|scatter)\s+"([^"]*)"\s+(\[[^\]]*\])\s*(#\S+)?/i.exec(line);
    if (!m) return false;
    const values = list(m[3])
      .map(Number)
      .map((v) => (Number.isFinite(v) ? v : 0));
    if (values.length > 10_000) throw new LimitError("Too many chart values");
    ctx.model.series.push({
      kind: /** @type {any} */ (m[1].toLowerCase()),
      name: label(m[2]),
      values,
      color: parseColorSpec(m[4]).fill ?? null,
    });
    return true;
  },
  (line, ctx) => {
    const m = /^stackmode\s+(grouped|stacked)/i.exec(line);
    if (!m) return false;
    ctx.model.stack = /** @type {any} */ (m[1].toLowerCase());
    return true;
  },
  (line, ctx) => {
    const m = /^legend\s+(left|right|top|bottom|none)\s*$/i.exec(line);
    if (!m) return false;
    ctx.model.legend = /** @type {any} */ (m[1].toLowerCase());
    return true;
  },
  (line, ctx) => {
    const m = /^grid\s+(true|false|on|off)/i.exec(line);
    if (!m) return false;
    ctx.model.grid = /true|on/i.test(m[1]);
    return true;
  },
  (line, ctx) => {
    const m = /^annotation\s+"([^"]*)"/i.exec(line);
    if (!m) return false;
    ctx.model.annotations.push(label(m[1]));
    return true;
  },
  (line, ctx, reader) => parseCommon(line, ctx.model.meta, reader),
];

/**
 * @param {ChartModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutChart(model, ctx) {
  const fs = ctx.theme.fontSize * 0.8;
  const n = Math.max(model.categories.length, ...model.series.map((s) => s.values.length), 1);
  const cats = Array.from({ length: n }, (_, i) => model.categories[i] ?? String(i + 1));
  const bars = model.series.filter((s) => s.kind === "bar");
  const stackTotals = cats.map((_, i) =>
    bars.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0),
  );
  const all = model.series.flatMap((s) => s.values);
  let [lo, hi] = model.range ?? [
    Math.min(0, ...all),
    Math.max(1, ...all, ...(model.stack === "stacked" ? stackTotals : [])),
  ];
  if (hi <= lo) hi = lo + 1;
  return { model, cats, lo, hi, fs, width: Math.max(420, n * 90), height: 300 };
}

/**
 * @param {ReturnType<typeof layoutChart>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawChart(laid, c) {
  const { model, cats, lo, hi, fs, width, height } = laid;
  const theme = c.theme;
  const axis = roleStyle(theme, "axis");
  const grid = roleStyle(theme, "grid");
  const left = 50;
  const yOf = (/** @type {number} */ v) => height - ((v - lo) / (hi - lo)) * height;
  const step = niceStep((hi - lo) / 5);
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    const y = yOf(v);
    if (model.grid)
      c.line(
        [
          [left, y],
          [left + width, y],
        ],
        { ...grid, roughness: 0 },
      );
    c.text(String(Math.round(v * 100) / 100), left - 6, y - fs * 0.6, {
      size: fs * 0.85,
      color: theme.muted,
      align: "right",
    });
  }
  const colW = width / cats.length;
  cats.forEach((cat, i) => {
    const t = layoutText(cat, { fontSize: fs, maxWidth: colW - 4 });
    c.richText(t, left + colW * i + (colW - t.width) / 2, height + 8, { color: axis.text });
  });
  const bars = model.series.filter((s) => s.kind === "bar");
  const bw = model.stack === "stacked" ? colW * 0.55 : (colW * 0.7) / Math.max(1, bars.length);
  model.series.forEach((s, si) => {
    const pal = paletteAt(theme, si);
    const color = s.color ?? pal.stroke;
    if (s.kind === "bar") {
      const bi = bars.indexOf(s);
      s.values.forEach((v, i) => {
        const below = bars.slice(0, bi).reduce((sum, b) => sum + Math.max(0, b.values[i] ?? 0), 0);
        const x =
          model.stack === "stacked"
            ? left + colW * i + (colW - bw) / 2
            : left + colW * i + colW * 0.15 + bi * bw;
        const y1 = model.stack === "stacked" ? yOf(below + v) : yOf(Math.max(v, 0));
        const y2 =
          model.stack === "stacked" ? yOf(below) : yOf(Math.min(v, 0) > lo ? Math.max(lo, 0) : lo);
        c.rect(x + 2, y1, bw - 4, Math.max(1, y2 - y1), {
          fill: s.color ?? pal.fill,
          stroke: color,
        });
      });
      return;
    }
    const pts = /** @type {[number, number][]} */ (
      s.values.map((v, i) => [left + colW * i + colW / 2, yOf(v)])
    );
    if (s.kind === "area" && pts.length > 1) {
      c.line(
        [...pts, [pts[pts.length - 1][0], yOf(Math.max(lo, 0))], [pts[0][0], yOf(Math.max(lo, 0))]],
        { closed: true, fill: s.color ?? pal.fill, stroke: color, opacity: 70 },
      );
    }
    if (s.kind === "line" && pts.length > 1) c.line(pts, { stroke: color, strokeWidth: 2.5 });
    for (const p of pts) {
      const r = s.kind === "scatter" ? 6 : 4;
      c.ellipse(p[0] - r, p[1] - r, r * 2, r * 2, {
        fill: s.kind === "scatter" ? (s.color ?? pal.fill) : color,
        stroke: color,
        fillStyle: "solid",
      });
    }
  });
  c.line(
    [
      [left, 0],
      [left, height],
    ],
    { stroke: axis.stroke, strokeWidth: 1.5 },
  );
  c.line(
    [
      [left, yOf(Math.max(lo, 0))],
      [left + width, yOf(Math.max(lo, 0))],
    ],
    { stroke: axis.stroke, strokeWidth: 1.5 },
  );
  if (model.vLabel) c.text(model.vLabel, 0, -fs * 2, { size: fs, color: theme.muted });
  if (model.hLabel)
    c.text(model.hLabel, left + width / 2, height + fs * 2.6, {
      size: fs,
      color: theme.muted,
      align: "center",
    });
  if (model.legend !== "none" && model.series.length > 1) {
    const lx = model.legend === "left" ? -170 : left + width + 24;
    model.series.forEach((s, si) => {
      const pal = paletteAt(theme, si);
      const y = 10 + si * (fs * 1.6);
      const stroke = s.color ?? pal.stroke;
      if (s.kind === "line") {
        // Same glyph as in the plot: a short stroke with a point marker.
        c.line(
          [
            [lx - 2, y + 7],
            [lx + 18, y + 7],
          ],
          { stroke, strokeWidth: 2.5 },
        );
        c.ellipse(lx + 3.5, y + 3.5, 7, 7, { fill: stroke, stroke, fillStyle: "solid" });
      } else if (s.kind === "scatter")
        c.ellipse(lx + 1, y + 1, 12, 12, { fill: s.color ?? pal.fill, stroke, fillStyle: "solid" });
      else c.rect(lx, y, 14, 14, { fill: s.color ?? pal.fill, stroke });
      c.text(s.name, lx + 22, y - 2, { size: fs, color: theme.ink });
    });
  }
  model.annotations.forEach((a, i) => {
    const t = layoutText(a, { fontSize: fs * 0.9, maxWidth: width - 20 });
    c.richText(t, left + 10, -t.height - 10 - i * (t.height + 4), {
      color: theme.muted,
      align: "left",
    });
  });
}

/** @param {number} raw */
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

export default defineDiagram({
  kind: "chart",
  title: "Chart",
  starts: ["chart"],
  parse: (lines, module) => {
    /** @type {ChartModel} */
    const model = {
      meta: createMeta(),
      categories: [],
      series: [],
      range: null,
      hLabel: null,
      vLabel: null,
      stack: "grouped",
      legend: "right",
      grid: false,
      annotations: [],
    };
    runRules(lines, RULES, { model, module }, module.diagnostics);
    return model;
  },
  layout: layoutChart,
  draw: drawChart,
});
