/**
 * Gantt charts (`@startgantt`, or `@startuml` with Gantt statements):
 * tasks with durations, starts/ends, dependencies (`starts at [A]'s end`,
 * `[A] -> [B]`, `then`), milestones, completion, resources, colours,
 * closed days, separators, `today` and print scales.
 * @module diagrams/gantt
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColorSpec, mixColors } from "../../syntax/color.mjs";
import { runRules } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle, paletteAt } from "../../draw/theme.mjs";
import { LimitError } from "../../core/errors.mjs";
import { score } from "../detect.mjs";

const DAY = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parse `YYYY-MM-DD` (or `YYYY/MM/DD`) into a UTC day number.
 * @param {string} s
 * @returns {number | null}
 */
export function parseDay(s) {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / DAY) : null;
}

/** @param {number} day */
export function dayDate(day) {
  return new Date(day * DAY);
}

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} label
 * @property {number | null} start
 * @property {number | null} end Exclusive end day.
 * @property {number | null} duration Working days.
 * @property {boolean} milestone
 * @property {{ task: string, edge: "start" | "end", offset: number, kind: "start" | "end" } | null} anchor
 * @property {string | null} fill
 * @property {string | null} stroke
 * @property {number} complete 0–100
 * @property {string[]} resources
 * @property {string | null} link
 * @property {number} row
 */

/**
 * @typedef {object} GanttModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {Map<string, Task>} tasks
 * @property {Map<string, string>} aliases
 * @property {{ from: string, to: string, label: string | null }[]} links
 * @property {{ row: number, text: string }[]} separators
 * @property {number | null} projectStart
 * @property {Set<number>} closedWeekdays
 * @property {Set<number>} closedDays
 * @property {Set<number>} openDays
 * @property {number | null} today
 * @property {string | null} todayColor
 * @property {"daily" | "weekly" | "monthly"} scale
 * @property {number} rows
 */

/**
 * @typedef {object} GanttContext
 * @property {GanttModel} model
 * @property {import("../../core/registry.mjs").ModuleContext} module
 * @property {Task | null} last
 */

/**
 * @param {GanttContext} ctx
 * @param {string} name
 * @returns {Task}
 */
function task(ctx, name) {
  const { model } = ctx;
  const id = model.aliases.get(name) ?? name;
  let t = model.tasks.get(id);
  if (!t) {
    t = {
      id,
      label: label(name),
      start: null,
      end: null,
      duration: null,
      milestone: false,
      anchor: null,
      fill: null,
      stroke: null,
      complete: 0,
      resources: [],
      link: null,
      row: model.rows++,
    };
    model.tasks.set(id, t);
    if (model.tasks.size > ctx.module.limits.maxNodes) throw new LimitError("Too many Gantt tasks");
  }
  return t;
}

/**
 * Parse a duration such as `5 days`, `2 weeks`, `3 day`.
 * @param {string} s
 */
function duration(s) {
  const m = /(\d+)\s*(day|days|week|weeks|d|w)?/i.exec(s);
  if (!m) return null;
  const n = Math.min(10_000, Number(m[1]));
  return /^w/i.test(m[2] ?? "") ? n * 7 : n;
}

/**
 * Resolve a date expression: `2024-01-05`, `D+5`, `[Task]'s end`, `[Task]'s start`.
 * @param {GanttContext} ctx
 * @param {string} s
 * @returns {{ day: number } | { task: string, edge: "start" | "end", offset: number } | null}
 */
function when(ctx, s) {
  const t = s.trim();
  const d = parseDay(t);
  if (d !== null) return { day: d };
  const rel = /^D\+?(\d+)$/i.exec(t);
  if (rel) return { day: (ctx.model.projectStart ?? 0) + Number(rel[1]) };
  const ref = /^(?:(\d+)\s*days?\s*(after|before)\s*)?\[([^\]]+)\]'s\s+(start|end)$/i.exec(t);
  if (ref) {
    const offset = ref[1] ? Number(ref[1]) * (ref[2].toLowerCase() === "before" ? -1 : 1) : 0;
    return { task: task(ctx, ref[3]).id, edge: /** @type {any} */ (ref[4].toLowerCase()), offset };
  }
  return null;
}

/** @type {import("../../syntax/reader.mjs").Rule<GanttContext>[]} */
const RULES = [
  (line, ctx, reader) => parseCommon(line, ctx.model.meta, reader),
  (line, ctx) => {
    const m = /^project\s+starts\s+(?:the\s+|on\s+)?(.+)$/i.exec(line);
    if (!m) return false;
    ctx.model.projectStart = parseDay(m[1]);
    return true;
  },
  (line, ctx) => {
    const m =
      /^(?:printscale|projectscale|ganttscale)\s+(daily|weekly|monthly|quarterly|yearly)/i.exec(
        line,
      );
    if (!m) return false;
    const s = m[1].toLowerCase();
    ctx.model.scale = s === "daily" ? "daily" : s === "weekly" ? "weekly" : "monthly";
    return true;
  },
  (line, ctx) => {
    const m =
      /^(saturday|sunday|monday|tuesday|wednesday|thursday|friday)s?\s+(?:are|is)\s+(closed|open)$/i.exec(
        line,
      );
    if (!m) return false;
    const wd = WEEKDAYS.indexOf(m[1].toLowerCase());
    if (/closed/i.test(m[2])) ctx.model.closedWeekdays.add(wd);
    else ctx.model.closedWeekdays.delete(wd);
    return true;
  },
  (line, ctx) => {
    const m =
      /^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:\s+to\s+(\d{4}[-/]\d{1,2}[-/]\d{1,2}))?\s+(?:is|are)\s+(closed|open|colou?red\s+in\s+\S+)/i.exec(
        line,
      );
    if (!m) return false;
    const a = /** @type {number} */ (parseDay(m[1]));
    const b = m[2] ? /** @type {number} */ (parseDay(m[2])) : a;
    for (let d = a; d <= Math.min(b, a + 3660); d++) {
      if (/closed/i.test(m[3])) ctx.model.closedDays.add(d);
      else if (/open/i.test(m[3])) ctx.model.openDays.add(d);
    }
    return true;
  },
  (line, ctx) => {
    const m =
      /^today\s+is\s+(?:(\d+)\s+days?\s+after\s+start|(.+?))(?:\s+and\s+is\s+colou?red\s+in\s+(\S+))?$/i.exec(
        line,
      );
    if (m) {
      ctx.model.today = m[1] ? (ctx.model.projectStart ?? 0) + Number(m[1]) : parseDay(m[2]);
      if (m[3]) ctx.model.todayColor = parseColorSpec(m[3]).fill ?? null;
      return true;
    }
    const c = /^today\s+is\s+colou?red\s+in\s+(\S+)$/i.exec(line);
    if (!c) return false;
    ctx.model.todayColor = parseColorSpec(c[1]).fill ?? null;
    return true;
  },
  (line, ctx) => {
    const m = /^--\s*(.*?)\s*--$/.exec(line);
    if (!m) return false;
    ctx.model.separators.push({ row: ctx.model.rows++, text: label(m[1]) });
    return true;
  },
  // [A] -> [B]  /  [A] then [B] : label
  (line, ctx) => {
    const m = /^\[([^\]]+)\]\s*(?:->|then)\s*\[([^\]]+)\](?:\s*:\s*(.*))?$/i.exec(line);
    if (!m) return false;
    const a = task(ctx, m[1]);
    const b = task(ctx, m[2]);
    if (!b.anchor && b.start === null)
      b.anchor = { task: a.id, edge: "end", offset: 0, kind: "start" };
    ctx.model.links.push({ from: a.id, to: b.id, label: m[3] ? label(m[3]) : null });
    return true;
  },
  // task statements, possibly chained with "and"
  (line, ctx) => {
    let m = /^(then\s+)?\[([^\]]+)\](?:\s+as\s+\[([^\]]+)\])?\s*(.*)$/i.exec(line);
    if (!m) return false;
    const t = task(ctx, m[2]);
    if (m[3]) ctx.model.aliases.set(m[3], t.id);
    if (m[1] && ctx.last && ctx.last !== t) {
      t.anchor = { task: ctx.last.id, edge: "end", offset: 0, kind: "start" };
      ctx.model.links.push({ from: ctx.last.id, to: t.id, label: null });
    }
    ctx.last = t;
    const clauses = m[4].split(/\s+and\s+/i);
    for (const raw of clauses) {
      const c = raw.trim();
      if (!c) continue;
      if ((m = /^(?:lasts|requires)\s+(.+)$/i.exec(c))) t.duration = duration(m[1]);
      else if ((m = /^(starts|ends)\s+(?:at\s+|on\s+)?(.+)$/i.exec(c))) {
        const w = when(ctx, m[2]);
        const kind = /** @type {"start" | "end"} */ (
          m[1].toLowerCase() === "starts" ? "start" : "end"
        );
        if (w && "day" in w) {
          if (kind === "start") t.start = w.day;
          else t.end = w.day + 1;
        } else if (w) {
          t.anchor = /** @type {any} */ ({ ...w, kind });
          if (kind === "start" && /** @type {any} */ (w).edge === "end")
            ctx.model.links.push({ from: /** @type {any} */ (w).task, to: t.id, label: null });
        }
      } else if ((m = /^happens\s+(?:at\s+|on\s+)?(.+)$/i.exec(c))) {
        t.milestone = true;
        t.duration = 0;
        const w = when(ctx, m[1]);
        if (w && "day" in w) t.start = w.day;
        else if (w) t.anchor = /** @type {any} */ ({ ...w, kind: "start" });
      } else if ((m = /^is\s+colou?red\s+in\s+(\S+)$/i.exec(c))) {
        const parts = m[1].split("/");
        t.fill = parseColorSpec(parts[0]).fill ?? null;
        t.stroke = parts[1] ? (parseColorSpec(parts[1]).fill ?? null) : null;
      } else if ((m = /^is\s+(\d+)%\s*(?:completed?)?$/i.exec(c)))
        t.complete = Math.min(100, Number(m[1]));
      else if (/^is\s+completed?$/i.test(c)) t.complete = 100;
      else if ((m = /^on\s+(.+)$/i.exec(c)))
        t.resources.push(...[...m[1].matchAll(/\{([^}]+)\}/g)].map((r) => r[1]));
      else if ((m = /^links\s+to\s+\[\[([^\]]+)\]\]$/i.exec(c)))
        t.link = /^https?:/i.test(m[1]) ? m[1].split(/\s/)[0] : null;
      else if (/^is\s+(deleted|paused)/i.test(c)) continue;
      else ctx.module.diagnostics.warn(`Ignored Gantt clause: ${c}`);
    }
    return true;
  },
];

/**
 * @param {GanttModel} model
 * @param {number} day
 */
function isClosed(model, day) {
  if (model.openDays.has(day)) return false;
  if (model.closedDays.has(day)) return true;
  return model.closedWeekdays.has(dayDate(day).getUTCDay());
}

/**
 * Add `n` working days to `start`, returning the exclusive end day.
 * @param {GanttModel} model
 * @param {number} start
 * @param {number} n
 */
function addWorking(model, start, n) {
  let d = start;
  let left = n;
  let guard = 0;
  while (left > 0 && guard++ < 20_000) {
    if (!isClosed(model, d)) left--;
    d++;
  }
  return d;
}

/**
 * Resolve task start/end days (dependencies may be declared in any order).
 * @param {GanttModel} model
 */
function schedule(model) {
  const base = model.projectStart ?? 0;
  /** @type {Set<string>} */
  const visiting = new Set();
  /** @param {Task} t @returns {Task} */
  const resolve = (t) => {
    if (t.start !== null && t.end !== null) return t;
    if (visiting.has(t.id)) {
      t.start ??= base;
      t.end ??= t.start + 1;
      return t;
    }
    visiting.add(t.id);
    if (t.anchor) {
      const ref = model.tasks.get(t.anchor.task);
      if (ref) {
        resolve(ref);
        const day =
          (t.anchor.edge === "end"
            ? /** @type {number} */ (ref.end)
            : /** @type {number} */ (ref.start)) + t.anchor.offset;
        if (t.anchor.kind === "start") t.start = day;
        else t.end = day;
      }
    }
    // A task linked from several predecessors starts after the latest one ends.
    if (t.anchor?.kind === "start" && t.anchor.edge === "end") {
      for (const l of model.links) {
        if (l.to !== t.id) continue;
        const pred = model.tasks.get(l.from);
        if (!pred || pred === t) continue;
        resolve(pred);
        t.start = Math.max(t.start ?? -Infinity, /** @type {number} */ (pred.end));
      }
    }
    const dur = t.duration ?? (t.milestone ? 0 : 1);
    if (t.start === null && t.end !== null) {
      let s = t.end;
      let left = dur;
      while (left > 0) {
        s--;
        if (!isClosed(model, s)) left--;
      }
      t.start = s;
    }
    t.start ??= base;
    while (!t.milestone && isClosed(model, t.start) && t.end === null) t.start++;
    t.end ??= t.milestone ? t.start : addWorking(model, t.start, Math.max(1, dur));
    visiting.delete(t.id);
    return t;
  };
  for (const t of model.tasks.values()) resolve(t);
}

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 * @returns {GanttModel}
 */
function parseGantt(lines, module) {
  /** @type {GanttModel} */
  const model = {
    meta: createMeta(),
    tasks: new Map(),
    aliases: new Map(),
    links: [],
    separators: [],
    projectStart: null,
    closedWeekdays: new Set(),
    closedDays: new Set(),
    openDays: new Set(),
    today: null,
    todayColor: null,
    scale: "daily",
    rows: 0,
  };
  runRules(lines, RULES, { model, module, last: null }, module.diagnostics);
  schedule(model);
  return model;
}

/**
 * @param {GanttModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutGantt(model, ctx) {
  const fs = ctx.theme.fontSize * 0.85;
  const tasks = [...model.tasks.values()];
  const starts = tasks.map((t) => /** @type {number} */ (t.start));
  const ends = tasks.map((t) =>
    Math.max(/** @type {number} */ (t.end), /** @type {number} */ (t.start) + 1),
  );
  let first = Math.min(...starts, model.projectStart ?? Infinity);
  let last = Math.max(...ends, first + 1);
  if (!Number.isFinite(first)) first = 0;
  if (last - first > 3660) last = first + 3660;
  const dayW = model.scale === "daily" ? 24 : model.scale === "weekly" ? 10 : 4;
  const labels = tasks.map((t) => layoutText(t.label, { fontSize: fs, align: "left" }));
  const labelW = Math.max(120, ...labels.map((l) => l.width)) + 24;
  const rowH = Math.max(30, fs * 1.25 + 14);
  const headerH = model.projectStart !== null ? 46 : 26;
  return { model, first, last, dayW, labels, labelW, rowH, headerH, fs };
}

/**
 * @param {ReturnType<typeof layoutGantt>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawGantt(laid, c) {
  const { model, first, last, dayW, labels, labelW, rowH, headerH, fs } = laid;
  const theme = c.theme;
  const grid = roleStyle(theme, "grid");
  const x0 = labelW;
  const width = (last - first) * dayW;
  const height = headerH + model.rows * rowH;
  const xOf = (/** @type {number} */ d) => x0 + (d - first) * dayW;
  const yOf = (/** @type {number} */ row) => headerH + row * rowH;
  const dated = model.projectStart !== null;

  // closed days and header
  for (let d = first; d < last; d++) {
    if (isClosed(model, d))
      c.rect(xOf(d), headerH, dayW, height - headerH, {
        fill: mixColors(theme.muted, theme.background, 0.88),
        stroke: "transparent",
        roughness: 0,
        strokeWidth: 1,
      });
    const date = dayDate(d);
    const newMonth = date.getUTCDate() === 1 || d === first;
    if (dated && newMonth) {
      c.text(`${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`, xOf(d) + 4, 2, {
        size: fs * 0.85,
        color: theme.ink,
        bold: true,
      });
      c.line(
        [
          [xOf(d), 0],
          [xOf(d), height],
        ],
        { stroke: theme.muted, strokeWidth: 1, roughness: 0 },
      );
    }
    const showDay =
      model.scale === "daily" ||
      (model.scale === "weekly" && date.getUTCDay() === 1) ||
      (model.scale === "monthly" && date.getUTCDate() === 1);
    if (showDay) {
      const txt = dated ? String(date.getUTCDate()) : String(d - first + 1);
      c.text(txt, xOf(d) + (model.scale === "daily" ? dayW / 2 : 2), headerH - fs * 1.25 - 4, {
        size: fs * 0.75,
        color: theme.muted,
        align: model.scale === "daily" ? "center" : "left",
      });
      if (model.scale !== "daily")
        c.line(
          [
            [xOf(d), headerH],
            [xOf(d), height],
          ],
          { ...grid, roughness: 0 },
        );
    }
  }
  c.line(
    [
      [x0, headerH],
      [x0 + width, headerH],
    ],
    { stroke: theme.muted, strokeWidth: 1, roughness: 0 },
  );

  for (const sep of model.separators) {
    const y = yOf(sep.row) + rowH / 2;
    c.line(
      [
        [0, y],
        [x0 + width, y],
      ],
      { stroke: theme.muted, strokeWidth: 1, roughness: 0 },
    );
    if (sep.text) {
      const t = layoutText(sep.text, { fontSize: fs, bold: true });
      c.rect(8, y - t.height / 2 - 2, t.width + 12, t.height + 4, {
        fill: theme.background,
        stroke: "transparent",
        roughness: 0,
        strokeWidth: 1,
      });
      c.richText(t, 14, y - t.height / 2, { color: theme.ink });
    }
  }

  /** @type {Map<string, { x1: number, x2: number, y: number }>} */
  const boxes = new Map();
  let i = 0;
  for (const t of model.tasks.values()) {
    const lbl = labels[i];
    const pal = paletteAt(theme, i++);
    const y = yOf(t.row);
    c.richText(lbl, 10, y + (rowH - lbl.height) / 2, { color: theme.ink, align: "left" });
    const x1 = xOf(/** @type {number} */ (t.start));
    const x2 = xOf(Math.max(/** @type {number} */ (t.end), /** @type {number} */ (t.start)));
    const fill = t.fill ?? pal.fill;
    const stroke = t.stroke ?? pal.stroke;
    if (t.milestone) {
      const s = 16;
      c.diamond(x1 - s / 2, y + (rowH - s) / 2, s, s, {
        fill: stroke,
        stroke,
        fillStyle: "solid",
        link: t.link,
      });
      boxes.set(t.id, { x1: x1 - s / 2, x2: x1 + s / 2, y: y + rowH / 2 });
      continue;
    }
    const bh = rowH - 12;
    c.rect(x1, y + 6, Math.max(4, x2 - x1), bh, { fill, stroke, rounded: true, link: t.link });
    if (t.complete > 0) {
      c.rect(x1, y + 6, Math.max(2, ((x2 - x1) * t.complete) / 100), bh, {
        fill: mixColors(fill, stroke, 0.45),
        stroke: "transparent",
        strokeWidth: 1,
        rounded: true,
        roughness: 0,
      });
    }
    if (t.complete > 0)
      c.text(`${t.complete}%`, x1 + 4, y + (rowH - fs * 0.75 * 1.25) / 2, {
        size: fs * 0.75,
        color: theme.ink,
      });
    if (t.resources.length)
      c.text(t.resources.join(", "), x2 + 6, y + (rowH - fs * 0.8 * 1.25) / 2, {
        size: fs * 0.8,
        color: theme.muted,
      });
    boxes.set(t.id, { x1, x2, y: y + rowH / 2 });
  }

  const edge = roleStyle(theme, "edge");
  for (const l of model.links) {
    const a = boxes.get(l.from);
    const b = boxes.get(l.to);
    if (!a || !b) continue;
    const xa = a.x2;
    const xb = b.x1;
    const pts = /** @type {[number, number][]} */ (
      xb - xa >= 12
        ? [
            [xa, a.y],
            [xa + 6, a.y],
            [xa + 6, b.y],
            [xb, b.y],
          ]
        : [
            [xa, a.y],
            [xa + 6, a.y],
            [xa + 6, (a.y + b.y) / 2],
            [xb - 8, (a.y + b.y) / 2],
            [xb - 8, b.y],
            [xb, b.y],
          ]
    );
    c.arrow(pts, { stroke: edge.stroke, strokeWidth: 1.2, end: "triangle", roughness: 0 });
  }

  if (model.today !== null && model.today >= first && model.today <= last) {
    const x = xOf(model.today) + dayW / 2;
    c.line(
      [
        [x, headerH - 6],
        [x, height],
      ],
      {
        stroke: model.todayColor ?? "#e03131",
        strokeWidth: 2,
        strokeStyle: "dashed",
        roughness: 0,
      },
    );
  }
}

export default defineDiagram({
  kind: "gantt",
  title: "Gantt chart",
  starts: ["gantt", "uml"],
  detect: (lines) =>
    score(lines, [
      [/^project\s+starts/i, 5],
      [/^\[[^\]]+\]\s+(lasts|requires|starts|ends|happens|is\s+colou?red|is\s+\d+%)/i, 4],
      [/^(saturday|sunday)s?\s+are\s+closed/i, 4],
    ]),
  parse: parseGantt,
  layout: layoutGantt,
  draw: drawGantt,
});
