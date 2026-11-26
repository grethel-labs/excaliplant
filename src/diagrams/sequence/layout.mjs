/**
 * Deterministic sequence diagram layout. Produces a flat list of positioned
 * scene items that the draw step renders without further geometry work.
 * @module diagrams/sequence/layout
 */

import { layoutText } from "../../layout/measure.mjs";
import { shape as shapeDef } from "../../draw/shapes.mjs";
import { roleStyle } from "../../draw/theme.mjs";
import { explicitSkinText } from "../../syntax/skin.mjs";

/** @typedef {import("./parse.mjs").SequenceModel} SequenceModel */
/** @typedef {import("./parse.mjs").Participant} Participant */
/** @typedef {import("../../layout/measure.mjs").RichLayout} RichLayout */

/**
 * @typedef {(
 *  | { type: "head", p: Participant, x: number, y: number, w: number, h: number, text: RichLayout, textColor: string | undefined, icon: [number, number] | null, foot: boolean }
 *  | { type: "lifeline", x: number, y1: number, y2: number, gaps: [number, number][], destroyed: boolean }
 *  | { type: "activation", x: number, y1: number, y2: number, color: string | null }
 *  | { type: "message", points: [number, number][], text: RichLayout | null, textX: number, textY: number, arrow: import("./parse.mjs").MessageArrow, self: boolean, plate?: boolean }
 *  | { type: "note", x: number, y: number, w: number, h: number, text: RichLayout, shape: string, colors: import("../../syntax/color.mjs").ColorSpec }
 *  | { type: "divider", x1: number, x2: number, y: number, text: RichLayout | null }
 *  | { type: "delay", x1: number, x2: number, y: number, text: RichLayout | null }
 *  | { type: "group", x: number, y: number, w: number, h: number, kind: string, text: RichLayout | null, tag: RichLayout, elses: { y: number, text: RichLayout | null }[], color: string | null }
 *  | { type: "ref", x: number, y: number, w: number, h: number, text: RichLayout }
 *  | { type: "box", x: number, y: number, w: number, h: number, text: RichLayout | null, color: string | null, textColor: string | null }
 *  | { type: "destroy", x: number, y: number }
 * )} SeqItem
 */

const ICON_KINDS = new Set([
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
]);
const MIN_GAP = 40;
/** Half the extent of the red destroy cross; arrows stop at its rim. */
export const DESTROY_HALF = 9;

/**
 * @param {SequenceModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 * @returns {{ items: SeqItem[] }}
 */
export function layoutSequence(model, ctx) {
  const theme = ctx.theme;
  const participantFs = roleStyle(theme, "participant").fontSize;
  const participantText = explicitSkinText(theme, "participant");
  const boxText = explicitSkinText(theme, "participantBox");
  const msgFs = roleStyle(theme, "message").fontSize * 0.875;
  const boxFs = boxText?.fontSize ?? theme.roles.participantBox?.fontSize ?? msgFs;
  const parts = [...model.participants.values()].sort((a, b) => a.order - b.order);
  const index = new Map(parts.map((p, i) => [p.id, i]));
  /** @type {Map<string, import("./parse.mjs").ParticipantBox>} */
  const boxOf = new Map();
  const boxes = model.boxes.flatMap((box) => {
    const memberIndices = [];
    for (const id of box.members) {
      const i = index.get(id);
      if (i === undefined) continue;
      memberIndices.push(i);
      boxOf.set(id, box);
    }
    if (!memberIndices.length) return [];
    const text = box.text ? layoutText(box.text, { fontSize: boxFs, bold: true }) : null;
    return [{ box, text, a: Math.min(...memberIndices), b: Math.max(...memberIndices) }];
  });

  // ── participant heads ────────────────────────────────────────────────
  const heads = parts.map((p) => {
    const box = boxOf.get(p.id);
    const fs = participantText?.fontSize ?? (box ? boxText?.fontSize : undefined) ?? participantFs;
    const textColor = participantText?.text ?? (box ? (box.textColor ?? boxText?.text) : undefined);
    const stereo = p.stereotypes.length
      ? `<size:${Math.round(fs * 0.75)}>${p.stereotypes.map((s) => `«${s}»`).join(" ")}</size>\n`
      : "";
    const text = layoutText(stereo + p.label, { fontSize: fs });
    const icon = ICON_KINDS.has(p.kind) ? /** @type {[number, number]} */ (iconSize(p.kind)) : null;
    const w = icon ? Math.max(icon[0], text.width) + 8 : Math.max(60, text.width + 28);
    const h = icon ? icon[1] + text.height + 6 : text.height + 18;
    return { p, text, textColor, icon, w, h };
  });
  const headH = Math.max(40, ...heads.map((h) => h.h));

  // ── horizontal constraints ───────────────────────────────────────────
  const n = parts.length;
  const trackWidths = heads.map((h) => h.w);
  for (const { a, b, text } of boxes) {
    if (a === b && text) trackWidths[a] = Math.max(trackWidths[a], text.width);
  }
  const gaps = Array.from(
    { length: Math.max(0, n - 1) },
    (_, i) => trackWidths[i] / 2 + trackWidths[i + 1] / 2 + MIN_GAP,
  );
  let leftMargin = 20;
  let rightMargin = 20;
  /** @type {[number, number, number][]} */
  const constraints = [];
  for (const { a, b, text } of boxes) {
    if (a < b && text) constraints.push([a, b, text.width - (trackWidths[a] + trackWidths[b]) / 2]);
  }
  /** @param {string} id */
  const idx = (id) => index.get(id) ?? 0;
  for (const e of model.events) {
    if (e.type === "message") {
      const t = e.text ? layoutText(withNumber(e.text, e.number), { fontSize: msgFs }) : null;
      const need = (t?.width ?? 0) + 56;
      if (e.edge) {
        const at = idx(e.edgeSide === "from" ? e.to : e.from);
        if (e.edge === "left" && at === 0) leftMargin = Math.max(leftMargin, need);
        else if (e.edge === "right" && at === n - 1) rightMargin = Math.max(rightMargin, need);
        else if (e.edge === "left") constraints.push([at - 1, at, need]);
        else constraints.push([at, at + 1, need]);
      } else if (e.from === e.to) {
        const i = idx(e.from);
        if (i === n - 1) rightMargin = Math.max(rightMargin, need + 20);
        else constraints.push([i, i + 1, need + 30]);
      } else {
        const a = Math.min(idx(e.from), idx(e.to));
        const b = Math.max(idx(e.from), idx(e.to));
        constraints.push([a, b, need]);
      }
    } else if (e.type === "note" && e.over.length) {
      const t = layoutText(e.text, { fontSize: msgFs, align: "left" });
      const w = t.width + 28;
      const i = idx(e.over[0]);
      if (e.position === "left") {
        if (i === 0) leftMargin = Math.max(leftMargin, w + 20);
        else constraints.push([i - 1, i, w + heads[i - 1].w / 2 + 24]);
      } else if (e.position === "right") {
        if (i === n - 1) rightMargin = Math.max(rightMargin, w + 20);
        else constraints.push([i, i + 1, w + heads[i + 1].w / 2 + 24]);
      } else if (e.over.length === 1) {
        if (i > 0) constraints.push([i - 1, i, w / 2 + heads[i - 1].w / 2 + 16]);
        if (i < n - 1) constraints.push([i, i + 1, w / 2 + heads[i + 1].w / 2 + 16]);
        if (i === 0) leftMargin = Math.max(leftMargin, w / 2 - heads[0].w / 2 + 10);
        if (i === n - 1) rightMargin = Math.max(rightMargin, w / 2 - heads[n - 1].w / 2 + 10);
      } else {
        const a = Math.min(...e.over.map(idx));
        const b = Math.max(...e.over.map(idx));
        if (b > a) constraints.push([a, b, w - 40]);
      }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const [a, b, need] of constraints) {
      if (a < 0 || b >= n || a >= b) continue;
      const cur = gaps.slice(a, b).reduce((s, g) => s + g, 0);
      if (cur < need) for (let k = a; k < b; k++) gaps[k] += (need - cur) / (b - a);
    }
  }
  /** @type {number[]} */
  const cx = [];
  let x = leftMargin + (trackWidths[0] ?? 0) / 2;
  for (let i = 0; i < n; i++) {
    cx.push(x);
    x += gaps[i] ?? 0;
  }
  const minX = 0;
  const maxX = (cx[n - 1] ?? 0) + (trackWidths[n - 1] ?? 0) / 2 + rightMargin;
  /** @param {string} id */
  const center = (id) => cx[idx(id)];

  // ── vertical pass ────────────────────────────────────────────────────
  /** @type {SeqItem[]} */
  const items = [];
  const top = model.boxes.length
    ? Math.max(30, ...boxes.map(({ text }) => (text?.height ?? 0) + 12))
    : 0;
  let y = top + headH + 24;
  /** @type {Map<string, { y: number, color: string | null }[]>} */
  const active = new Map(parts.map((p) => [p.id, []]));
  /** @type {Map<string, number>} */
  const createdY = new Map();
  /** @type {Map<string, number>} */
  const destroyedY = new Map();
  /** @type {Set<string>} */
  const pendingCreate = new Set();
  /** @type {{ kind: string, text: string, color: string | null, startY: number, x1: number, x2: number, elses: { y: number, text: string }[] }[]} */
  const groups = [];
  let lastArrowY = y;
  /** @type {[number, number][]} */
  const delays = [];

  /** @param {number} x1 @param {number} x2 */
  const touch = (x1, x2) => {
    for (const g of groups) {
      g.x1 = Math.min(g.x1, x1);
      g.x2 = Math.max(g.x2, x2);
    }
  };
  /** @param {string} id */
  const level = (id) => active.get(id)?.length ?? 0;
  /** @param {string} id @param {number} at @param {string | null} color */
  const activate = (id, at, color) => active.get(id)?.push({ y: at, color });
  /** @param {string} id @param {number} at */
  const deactivate = (id, at) => {
    const bar = active.get(id)?.pop();
    if (!bar) return;
    const lvl = level(id);
    items.push({
      type: "activation",
      x: center(id) - 5 + lvl * 5,
      y1: bar.y,
      y2: Math.max(at, bar.y + 10),
      color: bar.color,
    });
  };
  /** Horizontal attachment point at a participant considering activation bars. */
  const attach = (/** @type {string} */ id, /** @type {number} */ dir) => {
    const lvl = level(id);
    return center(id) + (lvl > 0 ? dir * (5 + (lvl - 1) * 5) : 0);
  };

  for (let ei = 0; ei < model.events.length; ei++) {
    const e = model.events[ei];
    switch (e.type) {
      case "message": {
        const text =
          e.text || e.number
            ? layoutText(withNumber(e.text, e.number), {
                fontSize: msgFs,
                align: model.messageAlign,
              })
            : null;
        const th = text?.height ?? 0;
        const self = !e.edge && e.from === e.to;
        const target = e.to || e.from;
        let arrowY = e.parallel ? lastArrowY : y + th + 4;
        const creating = pendingCreate.has(e.to);
        if (creating) {
          const head = heads[idx(e.to)];
          arrowY = Math.max(arrowY, y + head.h / 2);
          createdY.set(e.to, arrowY - head.h / 2);
          pendingCreate.delete(e.to);
        }
        if (self) {
          const sx = attach(e.from, 1);
          if (e.lifecycle.target === "++") activate(e.from, arrowY + 8, null);
          const ex = attach(e.from, 1);
          const loopW = 34;
          const points = /** @type {[number, number][]} */ ([
            [sx, arrowY],
            [sx + loopW, arrowY],
            [sx + loopW, arrowY + 18],
            [ex, arrowY + 18],
          ]);
          items.push({
            type: "message",
            points,
            text,
            textX: sx + 6,
            textY: arrowY - th - 2,
            arrow: e.arrow,
            self: true,
          });
          touch(sx - 10, sx + loopW + (text?.width ?? 0) + 10);
          y = e.parallel ? y : arrowY + 32;
        } else {
          const fromIdx = e.from ? idx(e.from) : e.edge === "left" ? -1 : n;
          const toIdx = e.to ? idx(e.to) : e.edge === "left" ? -1 : n;
          const dir = toIdx >= fromIdx ? 1 : -1;
          const edgeX = (/** @type {string} */ id) => {
            const c = center(id);
            if (e.short) return c + (e.edge === "left" ? -60 : 60);
            return e.edge === "left" ? minX + 4 : maxX - 4;
          };
          let x1 = e.from ? attach(e.from, dir) : edgeX(e.to);
          let x2 = e.to ? attach(e.to, -dir) : edgeX(e.from);
          if (creating) x2 = center(e.to) - (heads[idx(e.to)].w / 2) * dir;
          if (e.lifecycle.target === "++" && e.to) {
            activate(e.to, arrowY, null);
            if (!creating) x2 = attach(e.to, -dir);
          }
          // The arrow ends at the rim of the destroy cross instead of under it.
          if (e.lifecycle.target === "!!" && e.to) x2 = center(e.to) - dir * (DESTROY_HALF + 1);
          if (e.edge === "left" && e.edgeSide === "from") x1 = edgeX(e.to);
          items.push({
            type: "message",
            points: [
              [x1, arrowY],
              [x2, arrowY],
            ],
            text,
            // Keep the label clear of the arrowhead by centring it on the shaft.
            textX:
              model.messageAlign === "left"
                ? Math.min(x1, x2) + 8
                : (x1 + x2) / 2 - (text?.width ?? 0) / 2 - Math.sign(x2 - x1) * 8,
            textY: arrowY - th - 3,
            arrow: e.arrow,
            self: false,
          });
          // Leave room for activation bars between the fragment frame and the arrow.
          touch(Math.min(x1, x2) - 12, Math.max(x1, x2) + 12);
          if (!e.parallel) y = arrowY + 16;
        }
        lastArrowY = arrowY;
        if (e.lifecycle.source === "--") deactivate(e.from || target, arrowY);
        if (e.lifecycle.target === "!!" && e.to) {
          destroyedY.set(e.to, arrowY);
          while (level(e.to) > 0) deactivate(e.to, arrowY);
          items.push({ type: "destroy", x: center(e.to), y: arrowY });
        }
        break;
      }
      case "activate":
        activate(e.id, lastArrowY, e.color);
        break;
      case "deactivate":
        deactivate(e.id, lastArrowY);
        break;
      case "destroy":
        while (level(e.id) > 0) deactivate(e.id, lastArrowY);
        destroyedY.set(e.id, lastArrowY);
        items.push({ type: "destroy", x: center(e.id), y: lastArrowY });
        break;
      case "create":
        pendingCreate.add(e.id);
        break;
      case "note": {
        const text = layoutText(e.text, { fontSize: msgFs, align: "left" });
        const w = text.width + 26;
        const h = text.height + 14;
        let nx;
        if (e.position === "across" || e.over.length === 0) {
          nx = minX + 10;
          const width = maxX - minX - 20;
          const ny = e.attached ? lastArrowY - h / 2 : y;
          items.push({
            type: "note",
            x: nx,
            y: ny,
            w: width,
            h,
            text,
            shape: e.shape,
            colors: e.colors,
          });
          y = Math.max(y, ny + h + 12);
          break;
        }
        const c = center(e.over[0]);
        if (e.position === "left") nx = c - w - 12 - level(e.over[0]) * 5;
        else if (e.position === "right") nx = c + 12 + level(e.over[0]) * 5;
        else if (e.over.length > 1) {
          const xs = e.over.map(center);
          const a = Math.min(...xs) - 30;
          const b = Math.max(...xs) + 30;
          nx = a;
          const width = Math.max(w, b - a);
          items.push({
            type: "note",
            x: nx,
            y,
            w: width,
            h,
            text,
            shape: e.shape,
            colors: e.colors,
          });
          touch(nx, nx + width);
          y += h + 12;
          break;
        } else nx = c - w / 2;
        const ny = e.attached
          ? Math.max(
              lastArrowY - h + 6,
              y - h - 4 > lastArrowY - h ? lastArrowY - h / 2 : lastArrowY - h / 2,
            )
          : y;
        items.push({
          type: "note",
          x: nx,
          y: e.attached ? ny : y,
          w,
          h,
          text,
          shape: e.shape,
          colors: e.colors,
        });
        touch(nx, nx + w);
        y = e.attached ? Math.max(y, ny + h + 10) : y + h + 12;
        break;
      }
      case "divider": {
        const text = e.text ? layoutText(e.text, { fontSize: msgFs }) : null;
        y += 8;
        items.push({ type: "divider", x1: minX, x2: maxX, y: y + (text?.height ?? 0) / 2, text });
        y += (text?.height ?? 0) + 22;
        break;
      }
      case "delay": {
        const text = e.text ? layoutText(e.text, { fontSize: msgFs }) : null;
        const h = Math.max(30, (text?.height ?? 0) + 18);
        delays.push([y, y + h]);
        items.push({ type: "delay", x1: minX, x2: maxX, y: y + h / 2, text });
        y += h + 6;
        break;
      }
      case "space":
        y += e.height;
        break;
      case "groupStart":
        groups.push({
          kind: e.kind,
          text: e.text,
          color: e.color,
          startY: y,
          x1: Infinity,
          x2: -Infinity,
          elses: [],
        });
        y += layoutText(e.text || e.kind, { fontSize: msgFs }).height + 20;
        break;
      case "groupElse": {
        const g = groups[groups.length - 1];
        if (!g) break;
        y += 4;
        g.elses.push({ y, text: e.text });
        y += layoutText(e.text || " ", { fontSize: msgFs }).height + 14;
        break;
      }
      case "groupEnd": {
        const g = groups.pop();
        if (!g) break;
        if (!Number.isFinite(g.x1)) {
          g.x1 = (cx[0] ?? 0) - 30;
          g.x2 = (cx[n - 1] ?? 0) + 30;
        }
        const tag = layoutText(g.kind, { fontSize: msgFs, bold: true });
        const text = g.text ? layoutText(`[${g.text}]`, { fontSize: msgFs }) : null;
        const pad = 14;
        const gx = g.x1 - pad;
        const gw = Math.max(g.x2 - g.x1 + pad * 2, tag.width + (text?.width ?? 0) + 40);
        y += 6;
        items.push({
          type: "group",
          x: gx,
          y: g.startY,
          w: gw,
          h: y - g.startY,
          kind: g.kind,
          text,
          tag,
          elses: g.elses.map((el) => ({
            y: el.y,
            text: el.text ? layoutText(`[${el.text}]`, { fontSize: msgFs }) : null,
          })),
          color: g.color,
        });
        touch(gx - 4, gx + gw + 4);
        y += 14;
        break;
      }
      case "ref": {
        const text = layoutText(e.text, { fontSize: msgFs });
        const xs = e.over.map(center);
        const x1 = Math.min(...xs) - 40;
        const x2 = Math.max(...xs) + 40;
        const w = Math.max(x2 - x1, text.width + 60);
        const h = text.height + 30;
        items.push({ type: "ref", x: x1, y, w, h, text });
        touch(x1, x1 + w);
        y += h + 14;
        break;
      }
    }
  }
  // Close remaining groups and activations.
  while (groups.length) {
    const g = /** @type {any} */ (groups.pop());
    items.push({
      type: "group",
      x: g.x1 - 14,
      y: g.startY,
      w: g.x2 - g.x1 + 28,
      h: y - g.startY,
      kind: g.kind,
      text: null,
      tag: layoutText(g.kind, { fontSize: msgFs }),
      elses: [],
      color: g.color,
    });
  }
  y += 16;
  for (const p of parts) while (level(p.id) > 0) deactivate(p.id, y - 8);

  // ── heads, feet, lifelines, boxes ────────────────────────────────────
  const footY = y;
  heads.forEach((h, i) => {
    const hx = cx[i] - h.w / 2;
    const created = createdY.get(h.p.id);
    const headY = created ?? top + headH - h.h;
    items.unshift({
      type: "head",
      p: h.p,
      x: hx,
      y: headY,
      w: h.w,
      h: h.h,
      text: h.text,
      textColor: h.textColor,
      icon: h.icon,
      foot: false,
    });
    const destroyed = destroyedY.get(h.p.id);
    const lifeTop = headY + h.h;
    const lifeBottom = destroyed ?? footY;
    items.unshift({
      type: "lifeline",
      x: cx[i],
      y1: lifeTop,
      y2: lifeBottom,
      gaps: delays,
      destroyed: destroyed !== undefined,
    });
    if (!model.hideFootbox && destroyed === undefined) {
      items.push({
        type: "head",
        p: h.p,
        x: hx,
        y: footY,
        w: h.w,
        h: h.h,
        text: h.text,
        textColor: h.textColor,
        icon: h.icon,
        foot: true,
      });
    }
  });
  markCrossedLabels(items);
  const bottom = model.hideFootbox ? footY : footY + headH;
  for (const { box, text, a, b } of boxes) {
    const x1 = cx[a] - trackWidths[a] / 2 - 12;
    const x2 = cx[b] + trackWidths[b] / 2 + 12;
    items.unshift({
      type: "box",
      x: x1,
      y: 0,
      w: x2 - x1,
      h: bottom + 10,
      text,
      color: box.color,
      textColor: box.textColor ?? boxText?.text ?? null,
    });
  }
  return { items };
}

/**
 * Flags every message label that a lifeline or an activation bar runs through, so the
 * drawer can put a plate behind exactly those labels. Needs the finished item list
 * because bars are only emitted once they close and lifelines end at a destroy.
 * @param {SeqItem[]} items
 */
function markCrossedLabels(items) {
  /** @type {{ x1: number, x2: number, y1: number, y2: number }[]} */
  const obstacles = [];
  for (const it of items) {
    if (it.type === "lifeline") obstacles.push({ x1: it.x, x2: it.x, y1: it.y1, y2: it.y2 });
    else if (it.type === "activation")
      obstacles.push({ x1: it.x, x2: it.x + 10, y1: it.y1, y2: it.y2 });
  }
  for (const it of items) {
    if (it.type !== "message" || !it.text) continue;
    const x1 = it.textX - 4;
    const x2 = it.textX + it.text.width + 4;
    const y1 = it.textY;
    const y2 = it.textY + it.text.height;
    it.plate = obstacles.some((o) => o.x2 > x1 && o.x1 < x2 && o.y2 > y1 && o.y1 < y2);
  }
}

/**
 * @param {string} text
 * @param {string | null} number
 */
function withNumber(text, number) {
  return number ? `<b>${number}</b> ${text}` : text;
}

/** @param {string} kind */
function iconSize(kind) {
  if (kind === "actor") return [32, 56];
  if (kind === "database") return [36, 44];
  if (kind === "collections") return [40, 34];
  if (kind === "queue") return [48, 30];
  return shapeDef(kind).icon ?? [36, 36];
}
