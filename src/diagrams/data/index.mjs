/**
 * JSON (`@startjson`) and YAML (`@startyaml`) data diagrams: nested objects
 * and arrays as linked tables, with `#highlight` paths.
 * @module diagrams/data
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle } from "../../draw/theme.mjs";
import { ParseError, LimitError } from "../../core/errors.mjs";
import { parseYaml } from "./yaml.mjs";

/** @typedef {import("./yaml.mjs").YamlValue} Value */
/** @typedef {import("../../layout/measure.mjs").RichLayout} RichLayout */

/**
 * @typedef {object} Table
 * @property {{ key: RichLayout | null, value: RichLayout | null, child: Table | null, highlight: boolean }[]} rows
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} keyW
 * @property {boolean} highlight
 */

/**
 * Split the data from leading `#highlight` and common commands.
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {"json" | "yaml"} format
 */
function parseData(lines, format) {
  const meta = createMeta();
  /** @type {string[][]} */
  const highlights = [];
  /** @type {string[]} */
  const body = [];
  const reader = new LineReader(lines);
  while (!reader.done) {
    const l = reader.next();
    const t = l.text.trim();
    const hl = /^#highlight\s+(.*)$/i.exec(t);
    if (hl) {
      highlights.push([...hl[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]));
      continue;
    }
    if (
      body.length === 0 &&
      /^(title|caption|header|footer|legend|skinparam|<style>|scale)\b/i.test(t) &&
      parseCommon(t, meta, reader)
    )
      continue;
    body.push(l.text);
  }
  const text = body.join("\n");
  /** @type {Value} */
  let data;
  if (format === "json") {
    try {
      data = JSON.parse(text.trim() || "null");
    } catch (err) {
      throw new ParseError(`Invalid JSON: ${/** @type {Error} */ (err).message}`, { cause: err });
    }
  } else data = parseYaml(text);
  return { meta, data, highlights };
}

/**
 * @param {Value} v
 */
function scalarText(v) {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return String(v);
}

/**
 * @param {ReturnType<typeof parseData>} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutData(model, ctx) {
  const fs = ctx.theme.fontSize * 0.85;
  let count = 0;
  /** @param {Value} v @param {string[]} path @returns {Table} */
  const build = (v, path) => {
    const isArr = Array.isArray(v);
    const entries = isArr
      ? /** @type {Value[]} */ (v).map((x, i) => [String(i), x])
      : Object.entries(/** @type {Record<string, Value>} */ (v));
    const hlHere = model.highlights.some(
      (h) => h.length === path.length && h.every((p, i) => p === path[i]),
    );
    /** @type {Table} */
    const table = { rows: [], x: 0, y: 0, w: 0, h: 0, keyW: 0, highlight: hlHere };
    for (const [k, val] of entries) {
      if (++count > ctx.limits.maxNodes * 4) throw new LimitError("Data document too large");
      const childPath = [...path, String(k)];
      const nested = val !== null && typeof val === "object";
      const highlight = model.highlights.some(
        (h) => h.length === childPath.length && h.every((p, i) => p === childPath[i] || p === "*"),
      );
      table.rows.push({
        key: isArr ? null : layoutText(String(k), { fontSize: fs, bold: true, align: "left" }),
        value: nested
          ? null
          : layoutText(scalarText(val), { fontSize: fs, align: "left", maxWidth: 280 }),
        child: nested ? build(val, childPath) : null,
        highlight,
      });
    }
    if (!entries.length)
      table.rows.push({
        key: null,
        value: layoutText(isArr ? "[ ]" : "{ }", { fontSize: fs }),
        child: null,
        highlight: false,
      });
    table.keyW = Math.max(0, ...table.rows.map((r) => (r.key ? r.key.width + 16 : 0)));
    const valW = Math.max(30, ...table.rows.map((r) => (r.value ? r.value.width + 16 : 24)));
    table.w = table.keyW + valW;
    table.h = table.rows.reduce(
      (s, r) => s + Math.max(r.key?.height ?? 0, r.value?.height ?? fs * 1.25) + 8,
      0,
    );
    return table;
  };
  const scalarRoot = model.data === null || typeof model.data !== "object";
  const root = scalarRoot ? build([model.data], []) : build(model.data, []);

  /** @param {Table} t @returns {number} */
  const span = (t) => {
    const kids = t.rows.filter((r) => r.child).map((r) => /** @type {Table} */ (r.child));
    const kidsH = kids.reduce((s, k) => s + span(k), 0) + 20 * Math.max(0, kids.length - 1);
    return Math.max(t.h, kidsH);
  };
  /** @param {Table} t @param {number} x @param {number} top */
  const place = (t, x, top) => {
    const s = span(t);
    t.x = x;
    t.y = top + Math.max(0, (Math.min(s, t.h * 2) - t.h) / 2) * 0;
    let y = top;
    for (const r of t.rows) {
      if (!r.child) continue;
      place(r.child, x + t.w + 60, y);
      y += span(r.child) + 20;
    }
  };
  place(root, 0, 0);
  return { root, fs };
}

/**
 * @param {ReturnType<typeof layoutData>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawData(laid, c) {
  const theme = c.theme;
  const s = roleStyle(theme, "json");
  const hl = roleStyle(theme, "highlight");
  /** @param {Table} t */
  const draw = (t) => {
    const id = c.rect(t.x, t.y, t.w, t.h, {
      fill: t.highlight ? hl.fill : s.fill,
      stroke: s.stroke,
      strokeWidth: 1.5,
      rounded: false,
    });
    let y = t.y;
    t.rows.forEach((r, i) => {
      const rh = Math.max(r.key?.height ?? 0, r.value?.height ?? laid.fs * 1.25) + 8;
      if (r.highlight)
        c.rect(t.x, y, t.w, rh, {
          fill: hl.fill,
          stroke: "transparent",
          strokeWidth: 1,
          roughness: 0,
        });
      if (i > 0)
        c.line(
          [
            [t.x, y],
            [t.x + t.w, y],
          ],
          { stroke: s.stroke, strokeWidth: 1, roughness: 0 },
        );
      if (r.key) c.richText(r.key, t.x + 8, y + 4, { color: s.text, align: "left" });
      if (t.keyW && r.key)
        c.line(
          [
            [t.x + t.keyW, y],
            [t.x + t.keyW, y + rh],
          ],
          { stroke: s.stroke, strokeWidth: 1, roughness: 0 },
        );
      if (r.value) c.richText(r.value, t.x + t.keyW + 8, y + 4, { color: s.text, align: "left" });
      if (r.child) {
        const cy = y + rh / 2;
        c.ellipse(t.x + t.w - 8, cy - 3, 6, 6, {
          fill: s.stroke,
          stroke: s.stroke,
          fillStyle: "solid",
          roughness: 0,
          strokeWidth: 1,
        });
        const target = /** @type {Table} */ (r.child);
        const b = /** @type {[number, number]} */ ([
          target.x,
          target.y + Math.min(target.h / 2, 20),
        ]);
        const a = /** @type {[number, number]} */ ([t.x + t.w - 5, cy]);
        const mx = (a[0] + b[0]) / 2;
        c.arrow([a, [mx, a[1]], [mx, b[1]], b], {
          stroke: theme.muted,
          strokeWidth: 1.5,
          end: "arrow",
        });
        draw(target);
      }
      y += rh;
    });
    return id;
  };
  draw(laid.root);
}

export const jsonDiagram = defineDiagram({
  kind: "json",
  title: "JSON data",
  starts: ["json"],
  raw: true,
  parse: (lines) => parseData(lines, "json"),
  layout: layoutData,
  draw: drawData,
});

export const yamlDiagram = defineDiagram({
  kind: "yaml",
  title: "YAML data",
  starts: ["yaml"],
  raw: true,
  parse: (lines) => parseData(lines, "yaml"),
  layout: layoutData,
  draw: drawData,
});
