/**
 * Timing diagrams: robust, concise, clock, binary and analog signals; time
 * blocks (`@100`, `@+50`, `@WB`), state changes, messages between signals,
 * time constraints, highlights, notes and `scale`.
 * @module diagrams/timing
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { runRules } from "../../syntax/reader.mjs";
import { label, unquote } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle, paletteAt, themeColor } from "../../draw/theme.mjs";
import { LimitError } from "../../core/errors.mjs";
import { score } from "../detect.mjs";

/**
 * @typedef {object} Signal
 * @property {string} id
 * @property {string} label
 * @property {"robust" | "concise" | "clock" | "binary" | "analog" | "rectangle"} kind
 * @property {{ t: number, state: string, color: string | null, comment: string | null }[]} changes
 * @property {string[]} states Declared state order (robust).
 * @property {{ period: number, pulse: number, offset: number }} clock
 * @property {[number, number]} range Analog range.
 * @property {{ t: number, text: string, position: "top" | "bottom" }[]} notes
 */

/**
 * @typedef {object} TimingModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {Map<string, Signal>} signals
 * @property {{ from: string, t1: number, to: string, t2: number, text: string }[]} messages
 * @property {{ signal: string | null, t1: number, t2: number, text: string }[]} constraints
 * @property {{ t1: number, t2: number, color: string | null, text: string }[]} highlights
 * @property {Map<string, number>} anchors Named time anchors (`@100 as :start`).
 * @property {number | null} pxPerUnit
 * @property {boolean} hideAxis
 * @property {boolean} compact
 */

/**
 * @typedef {object} TimingContext
 * @property {TimingModel} model
 * @property {number} time Current time.
 * @property {Signal | null} focus Signal of an `@Signal` block.
 * @property {import("../../core/registry.mjs").ModuleContext} module
 */

/**
 * Parse a time expression: `100`, `+50`, `:anchor`, `:anchor+20`, `WB@100` handled by caller.
 * @param {TimingContext} ctx
 * @param {string} s
 */
function time(ctx, s) {
  const t = s.trim();
  const anchor = /^:(\w+)\s*([+-]\s*\d+(?:\.\d+)?)?$/.exec(t);
  if (anchor)
    return (ctx.model.anchors.get(anchor[1]) ?? 0) + Number((anchor[2] ?? "0").replace(/\s/g, ""));
  if (/^\+/.test(t)) return ctx.time + Number(t.slice(1));
  const d = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (d) return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) / 86_400_000;
  const hms = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3] ?? 0);
  const n = Number(t);
  return Number.isFinite(n) ? n : ctx.time;
}

/** @type {import("../../syntax/reader.mjs").Rule<TimingContext>[]} */
const RULES = [
  (line, ctx, reader) => parseCommon(line, ctx.model.meta, reader),
  (line, ctx) => {
    const m =
      /^(robust|concise|clock|binary|analog|rectangle)\s+(?:"([^"]+)"|(\S+))(?:\s+between\s+(-?[\d.]+)\s+and\s+(-?[\d.]+))?(?:\s+as\s+(\S+))?(?:\s+with\s+period\s+(\d+)(?:\s+pulse\s+(\d+))?(?:\s+offset\s+(\d+))?)?\s*(?:<<.*>>)?\s*$/i.exec(
        line,
      );
    if (!m) return false;
    const name = m[2] ?? m[3];
    const id = m[6] ?? name;
    const period = Math.max(1, Number(m[7] ?? 50));
    ctx.model.signals.set(id, {
      id,
      label: label(name),
      kind: /** @type {any} */ (m[1].toLowerCase()),
      changes: [],
      states: [],
      clock: { period, pulse: Number(m[8] ?? period / 2), offset: Number(m[9] ?? 0) },
      range: [Number(m[4] ?? 0), Number(m[5] ?? 10)],
      notes: [],
    });
    if (ctx.model.signals.size > ctx.module.limits.maxNodes)
      throw new LimitError("Too many timing signals");
    return true;
  },
  (line, ctx) => {
    const m = /^@(\S+?)(?:\s+as\s+:(\w+))?$/.exec(line);
    if (!m) return false;
    const sig = ctx.model.signals.get(m[1]);
    if (sig) {
      ctx.focus = sig;
      return true;
    }
    ctx.time = time(ctx, m[1]);
    if (m[2]) ctx.model.anchors.set(m[2], ctx.time);
    return true;
  },
  (line, ctx) => {
    const m = /^(\S+)\s+has\s+(.+)$/i.exec(line);
    if (!m) return false;
    const sig = ctx.model.signals.get(m[1]);
    if (!sig) return false;
    sig.states = m[2].split(",").map((s) => label(s.trim().replace(/\s+as\s+.*$/, "")));
    return true;
  },
  // messages: WU -> WB@100 : text / WU@50 -> WB@100
  (line, ctx) => {
    const m = /^(\S+?)(?:@(\S+))?\s*-+>\s*(\S+?)(?:@(\S+))?\s*(?::\s*(.*))?$/.exec(line);
    if (!m || !ctx.model.signals.has(m[1]) || !ctx.model.signals.has(m[3])) return false;
    const t1 = m[2] ? time(ctx, m[2]) : ctx.time;
    ctx.model.messages.push({
      from: m[1],
      t1,
      to: m[3],
      t2: m[4] ? time(ctx, m[4]) : t1,
      text: label(m[5] ?? ""),
    });
    return true;
  },
  // constraints: WB@0 <-> @50 : {50 ms}
  (line, ctx) => {
    const m = /^(\S+)?@(\S+)\s*<->\s*@(\S+)\s*(?::\s*(.*))?$/.exec(line);
    if (!m) return false;
    ctx.model.constraints.push({
      signal: m[1] ?? null,
      t1: time(ctx, m[2]),
      t2: time(ctx, m[3]),
      text: label(m[4] ?? ""),
    });
    return true;
  },
  (line, ctx) => {
    const m = /^highlight\s+(\S+)\s+to\s+(\S+)\s*(#\S+)?\s*(?::\s*(.*))?$/i.exec(line);
    if (!m) return false;
    ctx.model.highlights.push({
      t1: time(ctx, m[1]),
      t2: time(ctx, m[2]),
      color: parseColorSpec(m[3]).fill ?? null,
      text: label(m[4] ?? ""),
    });
    return true;
  },
  (line, ctx) => {
    const m = /^scale\s+(\d+(?:\.\d+)?)\s+as\s+(\d+(?:\.\d+)?)\s+pixels?$/i.exec(line);
    if (!m) return false;
    ctx.model.pxPerUnit = Math.min(1000, Math.max(0.01, Number(m[2]) / Number(m[1])));
    return true;
  },
  (line, ctx) => {
    if (/^hide\s+time[-_]?axis$/i.test(line)) {
      ctx.model.hideAxis = true;
      return true;
    }
    if (/^mode\s+compact$/i.test(line)) {
      ctx.model.compact = true;
      return true;
    }
    return false;
  },
  (line, ctx, reader) => {
    const m = /^note\s+(top|bottom)\s+of\s+(\S+)\s*(?::\s*(.*))?$/i.exec(line);
    if (!m) return false;
    const sig = ctx.model.signals.get(m[2]);
    const text =
      m[3] ??
      reader
        .until(/^\s*end\s*note\s*$/i)
        .map((l) => l.text.trim())
        .join("\n");
    sig?.notes.push({
      t: ctx.time,
      text: label(text),
      position: /** @type {any} */ (m[1].toLowerCase()),
    });
    return true;
  },
  // state changes: `WB is Idle`, `WB@100 is Idle`, inside @WB: `100 is Idle`, `+50 is X`
  (line, ctx) => {
    const m =
      /^(?:(\S+?)(?:@(\S+))?\s+is\s+|(\+?:?[\w.:]+)\s+is\s+)(.+?)(\s*#\S+)?(?:\s*:\s*(.*))?$/i.exec(
        line,
      );
    if (!m) return false;
    let sig;
    let t = ctx.time;
    if (m[1] && ctx.model.signals.has(m[1])) {
      sig = ctx.model.signals.get(m[1]);
      if (m[2]) t = time(ctx, m[2]);
    } else if (ctx.focus && (m[3] ?? m[1])) {
      sig = ctx.focus;
      t = time(ctx, /** @type {string} */ (m[3] ?? m[1]));
      ctx.time = t;
    }
    if (!sig) return false;
    const state = label(unquote(m[4].trim()).replace(/^\{|\}$/g, (b) => b));
    sig.changes.push({
      t,
      state,
      color: parseColorSpec(m[5]?.trim()).fill ?? null,
      comment: m[6] ? label(m[6]) : null,
    });
    if (!sig.states.includes(state) && !/^\{.*\}$/.test(state)) sig.states.push(state);
    return true;
  },
];

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 */
function parseTiming(lines, module) {
  /** @type {TimingModel} */
  const model = {
    meta: createMeta(),
    signals: new Map(),
    messages: [],
    constraints: [],
    highlights: [],
    anchors: new Map(),
    pxPerUnit: null,
    hideAxis: false,
    compact: false,
  };
  runRules(lines, RULES, { model, time: 0, focus: null, module }, module.diagnostics);
  for (const s of model.signals.values()) s.changes.sort((a, b) => a.t - b.t);
  return model;
}

/**
 * @param {TimingModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutTiming(model, ctx) {
  const fs = ctx.theme.fontSize * 0.85;
  const signals = [...model.signals.values()];
  const times = [
    ...signals.flatMap((s) => s.changes.map((c) => c.t)),
    ...model.messages.flatMap((m) => [m.t1, m.t2]),
    ...model.constraints.flatMap((c) => [c.t1, c.t2]),
    ...model.highlights.flatMap((h) => [h.t1, h.t2]),
  ];
  const t0 = Math.min(0, ...times);
  let t1 = Math.max(...times, t0 + 1);
  const uniq = [...new Set(times)].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < uniq.length; i++) minGap = Math.min(minGap, uniq[i] - uniq[i - 1]);
  if (!Number.isFinite(minGap) || minGap <= 0) minGap = Math.max(1, t1 - t0);
  t1 += minGap;
  const px = model.pxPerUnit ?? Math.min(20, Math.max(90 / minGap, 720 / (t1 - t0)));
  const labels = signals.map((s) =>
    layoutText(s.label, { fontSize: fs, bold: true, align: "left" }),
  );
  const stateW = Math.max(
    0,
    ...signals
      .filter((s) => s.kind === "robust")
      .flatMap((s) => s.states.map((st) => layoutText(st, { fontSize: fs * 0.7 }).width)),
  );
  const labelW = Math.max(...labels.map((l) => l.width), 60) + 30 + (stateW ? stateW + 12 : 0);
  const rows = signals.map((s) => {
    const h =
      s.kind === "robust" ? Math.max(2, s.states.length) * 26 + 20 : s.kind === "analog" ? 90 : 46;
    return { s, h: h + (s.notes.length ? 40 : 0) };
  });
  return { model, signals, labels, labelW, rows, t0, t1, px, fs, ticks: uniq };
}

/**
 * @param {ReturnType<typeof layoutTiming>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawTiming(laid, c) {
  const { model, labels, labelW, rows, t0, t1, px, fs, ticks } = laid;
  const theme = c.theme;
  const xOf = (/** @type {number} */ t) => labelW + (t - t0) * px;
  const right = xOf(t1);
  const total = rows.reduce((s, r) => s + r.h, 0);
  const ink = theme.ink;
  const grid = roleStyle(theme, "grid");

  for (const h of model.highlights) {
    c.rect(xOf(h.t1), 0, (h.t2 - h.t1) * px, total, {
      fill: h.color ?? themeColor(theme, "special.timing-highlight.fill"),
      stroke: "transparent",
      roughness: 0,
      strokeWidth: 1,
      opacity: 70,
    });
    // Caption below the signals so it never collides with state names.
    if (h.text) c.text(h.text, xOf(h.t1) + 4, total + 4, { size: fs * 0.8, color: theme.muted });
  }
  for (const t of ticks)
    c.line(
      [
        [xOf(t), 0],
        [xOf(t), total],
      ],
      { ...grid, roughness: 0 },
    );

  /** @type {Map<string, { top: number, h: number, levelY: (state: string) => number }>} */
  const geo = new Map();
  let y = 0;
  rows.forEach((row, i) => {
    const s = row.s;
    const pal = paletteAt(theme, i);
    const top = y + (s.notes.length ? 40 : 0);
    const h = row.h - (s.notes.length ? 40 : 0);
    c.richText(labels[i], 8, top + h / 2 - labels[i].height / 2, { color: ink, align: "left" });
    c.line(
      [
        [0, y + row.h],
        [right, y + row.h],
      ],
      { stroke: theme.muted, strokeWidth: 1, roughness: 0, opacity: 40 },
    );
    const pad = 10;
    const levelY = (/** @type {string} */ state) => {
      if (s.kind === "binary") return /^(high|1|true|on)$/i.test(state) ? top + pad : top + h - pad;
      if (s.kind === "analog") {
        const v = Number(state);
        const [lo, hi] = s.range;
        return top + h - pad - ((Number.isFinite(v) ? v - lo : 0) / (hi - lo || 1)) * (h - pad * 2);
      }
      const idx = s.states.indexOf(state);
      const n = Math.max(1, s.states.length);
      return top + pad + 6 + ((n - 1 - Math.max(0, idx)) * (h - pad * 2 - 12)) / Math.max(1, n - 1);
    };
    geo.set(s.id, { top, h, levelY });
    const stroke = pal.stroke;
    const changes = s.changes;
    if (s.kind === "clock") {
      /** @type {[number, number][]} */
      const pts = [];
      const { period, pulse, offset } = s.clock;
      for (let t = t0 + offset; t < t1 && pts.length < 4000; t += period) {
        pts.push(
          [xOf(t), top + h - pad],
          [xOf(t), top + pad],
          [xOf(Math.min(t1, t + pulse)), top + pad],
          [xOf(Math.min(t1, t + pulse)), top + h - pad],
        );
      }
      if (pts.length) c.line(pts, { stroke, strokeWidth: 1.5 });
    } else if (s.kind === "concise" || s.kind === "rectangle") {
      changes.forEach((ch, k) => {
        const end = changes[k + 1]?.t ?? t1;
        const x1 = xOf(ch.t);
        const x2 = xOf(end);
        const yt = top + pad;
        const yb = top + h - pad;
        const d = Math.min(6, (x2 - x1) / 3);
        if (/^\{-\}$|^\{hidden\}$/i.test(ch.state)) {
          c.line(
            [
              [x1, (yt + yb) / 2],
              [x2, (yt + yb) / 2],
            ],
            { stroke, strokeWidth: 1.5 },
          );
          return;
        }
        c.line(
          [
            [x1, (yt + yb) / 2],
            [x1 + d, yt],
            [x2 - d, yt],
            [x2, (yt + yb) / 2],
            [x2 - d, yb],
            [x1 + d, yb],
          ],
          {
            closed: true,
            fill: ch.color ?? pal.fill,
            fillStyle: "solid",
            stroke,
            strokeWidth: 1.5,
          },
        );
        const t = layoutText(ch.state.replace(/^\{|\}$/g, ""), { fontSize: fs * 0.85 });
        if (t.width < x2 - x1 - 8)
          c.richText(t, (x1 + x2) / 2 - t.width / 2, (yt + yb) / 2 - t.height / 2, { color: ink });
      });
    } else if (changes.length) {
      /** @type {[number, number][]} */
      const pts = [];
      changes.forEach((ch, k) => {
        const yy = levelY(ch.state);
        const x = xOf(ch.t);
        if (pts.length) pts.push([x, pts[pts.length - 1][1]]);
        pts.push(
          s.kind === "analog" && pts.length
            ? [x, yy]
            : [x + (pts.length && s.kind === "robust" ? 4 : 0), yy],
        );
        if (k === changes.length - 1) pts.push([right, yy]);
      });
      c.line(
        s.kind === "analog"
          ? changes.map((ch) => /** @type {[number, number]} */ ([xOf(ch.t), levelY(ch.state)]))
          : pts,
        { stroke, strokeWidth: 2 },
      );
      if (s.kind === "robust") {
        for (const st of s.states)
          c.text(st, labelW - 6, levelY(st) - fs * 0.6, {
            size: fs * 0.7,
            color: theme.muted,
            align: "right",
          });
      }
    }
    for (const n of s.notes) {
      const t = layoutText(n.text, { fontSize: fs * 0.8, align: "left" });
      const nx = xOf(n.t);
      c.rect(nx, y + 4, t.width + 16, t.height + 8, {
        fill: roleStyle(theme, "note").fill,
        stroke: roleStyle(theme, "note").stroke,
        strokeWidth: 1,
      });
      c.richText(t, nx + 8, y + 8, { color: ink, align: "left" });
    }
    y += row.h;
  });
  c.line(
    [
      [labelW, 0],
      [labelW, total],
    ],
    { stroke: theme.muted, strokeWidth: 1, roughness: 0 },
  );

  for (const m of model.messages) {
    const a = geo.get(m.from);
    const b = geo.get(m.to);
    if (!a || !b) continue;
    const p1 = /** @type {[number, number]} */ ([xOf(m.t1), a.top + a.h / 2]);
    const p2 = /** @type {[number, number]} */ ([xOf(m.t2), b.top + b.h / 2]);
    c.arrow([p1, p2], { stroke: ink, strokeWidth: 1.5, end: "arrow" });
    if (m.text) {
      const t = layoutText(m.text, { fontSize: fs * 0.8 });
      const tx = (p1[0] + p2[0]) / 2 + 6;
      const ty = (p1[1] + p2[1]) / 2 - t.height / 2;
      c.rect(tx - 2, ty, t.width + 4, t.height, {
        fill: theme.surface ?? theme.background,
        stroke: "transparent",
        strokeWidth: 1,
        roughness: 0,
      });
      c.richText(t, tx, ty, { color: ink });
    }
  }
  for (const k of model.constraints) {
    const g = k.signal ? geo.get(k.signal) : null;
    const cy = g ? g.top + 4 : total + 10;
    c.arrow(
      [
        [xOf(k.t1), cy],
        [xOf(k.t2), cy],
      ],
      {
        stroke: themeColor(theme, "special.timing-constraint.stroke"),
        strokeWidth: 1.2,
        start: "arrow",
        end: "arrow",
        roughness: 0,
      },
    );
    if (k.text) {
      const t = layoutText(k.text, { fontSize: fs * 0.8 });
      const x = (xOf(k.t1) + xOf(k.t2)) / 2 - t.width / 2;
      const y = cy - t.height - 1;
      c.rect(x - 2, y, t.width + 4, t.height, {
        fill: theme.surface ?? theme.background,
        stroke: "transparent",
        roughness: 0,
      });
      c.richText(t, x, y, { color: theme.ink });
    }
  }
  if (!model.hideAxis) {
    const ay = total + 26;
    c.line(
      [
        [labelW, ay],
        [right, ay],
      ],
      { stroke: ink, strokeWidth: 1.5 },
    );
    for (const t of ticks) {
      c.line(
        [
          [xOf(t), ay - 4],
          [xOf(t), ay + 4],
        ],
        { stroke: ink, strokeWidth: 1.5 },
      );
      c.text(String(Math.round(t * 100) / 100), xOf(t), ay + 6, {
        size: fs * 0.75,
        color: theme.muted,
        align: "center",
      });
    }
  }
}

export default defineDiagram({
  kind: "timing",
  title: "Timing diagram",
  starts: ["uml", "timing"],
  detect: (lines) =>
    score(lines, [
      [/^(robust|concise|clock|binary|analog)\s/i, 5],
      [/^@[+:]?[\w.:]+$/, 1.5],
      [/^\S+\s+is\s+\S+/i, 0.5],
    ]),
  parse: parseTiming,
  layout: layoutTiming,
  draw: drawTiming,
});
