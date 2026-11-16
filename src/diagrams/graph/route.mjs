/**
 * Post-processing of ELK routes. ELK knows nothing about container titles,
 * arrowhead sizes or how ugly a 6 px jog looks, so after layout we nudge
 * orthogonal routes:
 *
 * - keep lines out of container titles / package tabs,
 * - leave room for a full-size arrowhead on the last segment,
 * - straighten Z-shaped jogs between two boxes that face each other.
 *
 * Every pass only moves whole axis-aligned segments (and slides the end point
 * along the node side it already sits on), so routes stay orthogonal.
 * @module diagrams/graph/route
 */

import { segmentInBox } from "../../layout/labels.mjs";

/** @typedef {import("../../model/graph.mjs").GraphModel} GraphModel */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */
/** @typedef {import("../../model/graph.mjs").GraphEdge} GraphEdge */
/** @typedef {[number, number]} Point */
/** @typedef {{ dx: number, dy: number, w: number, h: number }} RelBox */

/** Length the last segment needs so the arrowhead keeps its full size. */
export const HEAD_ROOM = 30;
const MARGIN = 6;

/**
 * Width of the tab of a package / folder container.
 * @param {GraphNode} node
 */
export function tabWidth(node) {
  const geo = node.data.geo;
  return Math.max(24, Math.min(node.width, geo.minWidth - 8));
}

/**
 * Where the title of a container may sit, relative to the container.
 * Packages and frames have a fixed tab; other containers offer the centre
 * and both corners.
 * @param {GraphNode} node
 * @returns {{ boxes: RelBox[], fixed: boolean }}
 */
export function titleCandidates(node) {
  const geo = node.data.geo;
  const blocks = /** @type {{ width: number, height: number }[]} */ (geo.blocks);
  const bw = Math.max(0, ...blocks.map((b) => b.width));
  const bh = blocks.reduce((s, b) => s + b.height, 0);
  if (node.shape === "package" || node.shape === "folder")
    return { boxes: [{ dx: 0, dy: 0, w: tabWidth(node), h: geo.headerHeight }], fixed: true };
  if (node.shape === "frame")
    return { boxes: [{ dx: 0, dy: 0, w: bw + 28, h: bh + 8 }], fixed: true };
  const top = 8 + (node.shape === "node" ? 10 : 0) + (node.shape === "cloud" ? 14 : 0);
  const w = bw + 8;
  const h = bh + 4;
  return {
    boxes: [
      { dx: (node.width - bw) / 2 - 4, dy: top - 2, w, h },
      { dx: 10, dy: top - 2, w, h },
      { dx: node.width - bw - 18, dy: top - 2, w, h },
    ],
    fixed: false,
  };
}

/**
 * @param {GraphNode | undefined} n
 */
function movable(n) {
  return !!n && !n.data.ports;
}

/**
 * Icon box of shapes with the label underneath (actors, interfaces …).
 * @param {GraphNode} n
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
function iconBox(n) {
  const geo = n.data.geo;
  if (geo?.placement !== "below" || !geo.icon) return null;
  const [iw, ih] = geo.icon;
  return { x: n.x + (n.width - iw) / 2, y: n.y, w: iw, h: ih };
}

/**
 * @param {GraphNode} n
 */
function isRound(n) {
  return !!n.data.round || n.data.pseudo || ["usecase", "circle", "diamond"].includes(n.shape);
}

/**
 * Shared state of one tidy run.
 * @param {GraphModel} model
 */
function context(model) {
  const leaves = [...model.nodes.values()].filter(
    (n) => !n.removed && !n.hidden && !n.container && n.width > 0,
  );
  const edges = model.edges.filter(
    (e) => e.points.length >= 2 && model.nodes.has(e.from) && model.nodes.has(e.to),
  );
  return { model, leaves, edges };
}

/** @typedef {ReturnType<typeof context>} Ctx */

/**
 * Whether any segment of `pts` runs through the interior of a node.
 * @param {Ctx} ctx
 * @param {Point[]} pts
 * @param {number[]} segments Indices of the segments to test.
 */
function hitsNode(ctx, pts, segments) {
  for (const i of segments) {
    if (i < 0 || i >= pts.length - 1) continue;
    for (const n of ctx.leaves) {
      const box = { x: n.x + 1.5, y: n.y + 1.5, w: n.width - 3, h: n.height - 3 };
      if (segmentInBox(pts[i], pts[i + 1], box) > 0.5) return true;
    }
  }
  return false;
}

/**
 * Whether the end point `p` lies on a border of `node` that is crossed along
 * `axis` (the end can slide along that border).
 * @param {GraphNode} node
 * @param {Point} p
 * @param {number} axis Axis the point is going to move along (0 = x, 1 = y).
 */
function onBorder(node, p, axis) {
  const o = 1 - axis;
  const pos = o === 0 ? node.x : node.y;
  const size = o === 0 ? node.width : node.height;
  return Math.abs(p[o] - pos) < 1.5 || Math.abs(p[o] - (pos + size)) < 1.5;
}

/**
 * Allowed range for an end point sliding along `axis` of `node`.
 * @param {GraphNode} node
 * @param {number} axis
 * @returns {[number, number]}
 */
function slideRange(node, axis) {
  const icon = iconBox(node);
  if (icon) {
    const [pos, size] = axis === 0 ? [icon.x, icon.w] : [icon.y, icon.h];
    return [pos + size * 0.2, pos + size * 0.8];
  }
  const pos = axis === 0 ? node.x : node.y;
  const size = axis === 0 ? node.width : node.height;
  // Round outlines are clipped at draw time; stay near the middle so the
  // clipped end still sits on a sensible part of the curve.
  if (isRound(node)) return [pos + size * 0.2, pos + size * 0.8];
  const inset = Math.min(8, size / 4);
  return [pos + inset, pos + size - inset];
}

/**
 * Another edge already ends within `gap` of `at` on the same side of `node`.
 * @param {Ctx} ctx
 * @param {GraphEdge} self
 * @param {GraphNode} node
 * @param {Point} at
 * @param {number} axis
 */
function crowded(ctx, self, node, at, axis, gap = 9) {
  const o = 1 - axis;
  for (const e of ctx.edges) {
    for (const [end, id] of /** @type {const} */ ([
      [e.points[0], e.from],
      [e.points[e.points.length - 1], e.to],
    ])) {
      // Own ends are replaced by the caller.
      if (e.id === self.id) continue;
      if (id !== node.id) continue;
      if (Math.abs(end[o] - at[o]) > 1.5) continue;
      if (Math.abs(end[axis] - at[axis]) < gap) return true;
    }
  }
  return false;
}

/**
 * Move axis-aligned segment `i` of an edge route to coordinate `to` along the
 * axis perpendicular to it.
 * @param {Ctx} ctx
 * @param {GraphEdge} e
 * @param {Point[]} pts
 * @param {number} i
 * @param {number} to
 * @param {boolean} [collapse] Allow a neighbour to shrink to nothing (the jog disappears).
 * @returns {Point[] | null} New route, or null when the move is not possible.
 */
function shiftSegment(ctx, e, pts, i, to, collapse = false) {
  const n = pts.length;
  const a = pts[i];
  const b = pts[i + 1];
  const vertical = Math.abs(a[0] - b[0]) < 0.5;
  const horizontal = Math.abs(a[1] - b[1]) < 0.5;
  if (vertical === horizontal) return null;
  const ax = vertical ? 0 : 1;
  const o = 1 - ax;
  /** @type {Point[]} */
  const next = pts.map((p) => [p[0], p[1]]);
  next[i][ax] = to;
  next[i + 1][ax] = to;
  // Neighbouring segments must be perpendicular (they only stretch).
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= n - 1) continue;
    if (Math.abs(pts[j][o] - pts[j + 1][o]) > 0.5) return null;
    const len = Math.abs(next[j][ax] - next[j + 1][ax]);
    if (len < 6 && !(collapse && len < 0.5)) return null;
    // Keep the direction: a flipped neighbour makes the route double back.
    const was = Math.sign(pts[j + 1][ax] - pts[j][ax]);
    const now = Math.sign(next[j + 1][ax] - next[j][ax]);
    if (was !== 0 && now !== 0 && was !== now) return null;
  }
  // Ends slide along the node side they sit on.
  /** @type {[number, GraphNode | undefined][]} */
  const ends = [];
  if (i === 0) ends.push([0, ctx.model.nodes.get(e.from)]);
  if (i + 1 === n - 1) ends.push([n - 1, ctx.model.nodes.get(e.to)]);
  for (const [idx, node] of ends) {
    if (!node || !movable(node) || !onBorder(node, pts[idx], ax)) return null;
    const [lo, hi] = slideRange(node, ax);
    if (to < lo || to > hi) return null;
    if (crowded(ctx, e, node, next[idx], ax)) return null;
  }
  if (hitsNode(ctx, next, [i - 1, i, i + 1])) return null;
  return next;
}

/**
 * Route the segments of `e` away from `box` (absolute coordinates).
 * @param {Ctx} ctx
 * @param {GraphEdge} e
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {{ x: number, y: number, w: number, h: number }} bounds Region the route may be moved within.
 * @param {boolean} [detour] Allow bumps around the box when no segment can slide (fixed tabs).
 * @returns {{ pts: Point[], cost: number } | null} null = still crossing.
 */
function clearBox(ctx, e, box, bounds, detour = false) {
  const zone = {
    x: box.x - MARGIN,
    y: box.y - MARGIN,
    w: box.w + 2 * MARGIN,
    h: box.h + 2 * MARGIN,
  };
  let pts = /** @type {Point[]} */ (e.points.map((p) => [p[0], p[1]]));
  let cost = 0;
  for (let guard = 0; guard < 6; guard++) {
    let hit = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      if (segmentInBox(pts[i], pts[i + 1], zone) > 0.5) {
        hit = i;
        break;
      }
    }
    if (hit < 0) return { pts, cost };
    const vertical = Math.abs(pts[hit][0] - pts[hit + 1][0]) < 0.5;
    const ax = vertical ? 0 : 1;
    const from = ax === 0 ? zone.x : zone.y;
    const size = ax === 0 ? zone.w : zone.h;
    const lo = ax === 0 ? bounds.x + 10 : bounds.y + 10;
    const hi = ax === 0 ? bounds.x + bounds.w - 10 : bounds.y + bounds.h - 10;
    const at = pts[hit][ax];
    /** @type {{ to: number, d: number }[]} */
    const options = [0, 1, 2, 3, 4, 5]
      .flatMap((k) => [
        { to: from + size + 1 + 10 * k, d: from + size + 1 + 10 * k - at },
        { to: from - 1 - 10 * k, d: at - (from - 1 - 10 * k) },
      ])
      .filter((c) => c.to >= lo && c.to <= hi);
    options.sort((p, q) => p.d - q.d);
    let moved = null;
    for (const c of options) {
      moved = shiftSegment(ctx, e, pts, hit, c.to);
      if (moved) {
        cost += c.d;
        break;
      }
    }
    if (!moved) {
      // No segment can slide: step around the box instead.
      const bump = detour
        ? detourAround(ctx, pts, hit, zone, options.map((c) => c.to).slice(0, 4))
        : null;
      if (!bump) return null;
      cost += bump.cost;
      moved = bump.pts;
    }
    pts = moved;
  }
  return null;
}

/**
 * Lead segment `hit` around `zone` with a small bump on the nearest free side.
 * @param {Ctx} ctx
 * @param {Point[]} pts
 * @param {number} hit
 * @param {{ x: number, y: number, w: number, h: number }} zone
 * @param {number[]} sides Candidate coordinates for the bump, perpendicular to the segment.
 * @returns {{ pts: Point[], cost: number } | null}
 */
function detourAround(ctx, pts, hit, zone, sides) {
  const a = pts[hit];
  const b = pts[hit + 1];
  const ax = Math.abs(a[0] - b[0]) < 0.5 ? 0 : 1;
  const o = 1 - ax;
  const dir = Math.sign(b[o] - a[o]);
  if (dir === 0) return null;
  const z0 = o === 0 ? zone.x : zone.y;
  const z1 = z0 + (o === 0 ? zone.w : zone.h);
  const enter = dir > 0 ? z0 - 6 : z1 + 6;
  const leave = dir > 0 ? z1 + 6 : z0 - 6;
  // Both bends must lie properly inside the segment.
  if ((enter - a[o]) * dir < 8 || (b[o] - leave) * dir < 8) return null;
  for (const to of sides) {
    /** @type {Point} */
    const p1 = [0, 0];
    /** @type {Point} */
    const p2 = [0, 0];
    /** @type {Point} */
    const p3 = [0, 0];
    /** @type {Point} */
    const p4 = [0, 0];
    p1[ax] = a[ax];
    p1[o] = enter;
    p2[ax] = to;
    p2[o] = enter;
    p3[ax] = to;
    p3[o] = leave;
    p4[ax] = a[ax];
    p4[o] = leave;
    const next = [...pts.slice(0, hit + 1), p1, p2, p3, p4, ...pts.slice(hit + 1)];
    if (hitsNode(ctx, next, [hit, hit + 1, hit + 2, hit + 3, hit + 4])) continue;
    return { pts: next, cost: 2 * Math.abs(to - a[ax]) + 20 };
  }
  return null;
}

/**
 * Choose each container's title position and move lines out of the way.
 * The chosen box is stored in `node.data.titleBox` (relative to the node).
 * @param {Ctx} ctx
 */
function clearTitles(ctx) {
  const containers = [...ctx.model.nodes.values()]
    .filter((n) => n.container && !n.removed && !n.hidden && n.data.geo?.blocks?.length)
    .sort((a, b) => a.depth - b.depth);
  for (const c of containers) {
    const { boxes, fixed } = titleCandidates(c);
    // Edges ending at the container itself legitimately touch its border.
    const edges = ctx.edges.filter((e) => e.from !== c.id && e.to !== c.id);
    /** @type {{ idx: number, score: number, results: Map<GraphEdge, Point[]> }[]} */
    const options = [];
    boxes.forEach((rel, idx) => {
      const box = { x: c.x + rel.dx, y: c.y + rel.dy, w: rel.w, h: rel.h };
      const bounds = { x: c.x, y: c.y, w: c.width, h: c.height };
      let score = idx * 30;
      /** @type {Map<GraphEdge, Point[]>} */
      const results = new Map();
      for (const e of edges) {
        const crossing = e.points.some(
          (p, i) =>
            i > 0 &&
            segmentInBox(e.points[i - 1], p, {
              x: box.x - 2,
              y: box.y - 2,
              w: box.w + 4,
              h: box.h + 4,
            }) > 0.5,
        );
        if (!crossing) continue;
        const r = clearBox(ctx, e, box, bounds, fixed);
        if (r) {
          score += 20 + r.cost;
          results.set(e, r.pts);
        } else score += 1000;
      }
      options.push({ idx, score, results });
    });
    options.sort((p, q) => p.score - q.score || p.idx - q.idx);
    const best = options[0];
    for (const [e, pts] of best.results) e.points = pts;
    const rel = boxes[best.idx];
    c.data.titleBox = rel;
  }
}

/**
 * Give the last segment of every headed end room for a full arrowhead.
 * @param {Ctx} ctx
 */
function makeHeadRoom(ctx) {
  for (const e of ctx.edges) {
    for (const end of /** @type {const} */ (["end", "start"])) {
      if (!(end === "end" ? e.endHead : e.startHead)) continue;
      const original = e.points;
      const flip = end === "start";
      /** @type {Point[]} */
      let pts = flip ? [...original].reverse() : original;
      const n = pts.length;
      if (n < 3) continue;
      const last = Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]);
      if (last >= HEAD_ROOM - 0.5) continue;
      const vertical = Math.abs(pts[n - 1][0] - pts[n - 2][0]) < 0.5;
      const ax = vertical ? 1 : 0;
      const dir = Math.sign(pts[n - 1][ax] - pts[n - 2][ax]);
      const to = pts[n - 2][ax] - dir * (HEAD_ROOM - last);
      // Work on a flipped copy so "end" logic applies to both ends.
      const probe = { ...e, points: pts, from: flip ? e.to : e.from, to: flip ? e.from : e.to };
      const moved = shiftSegment(ctx, /** @type {GraphEdge} */ (probe), pts, n - 3, to);
      if (!moved) continue;
      pts = moved;
      e.points = flip ? pts.reverse() : pts;
    }
  }
}

/**
 * Replace Z-shaped jogs between two boxes by one straight line.
 * @param {Ctx} ctx
 */
function straighten(ctx) {
  for (const e of ctx.edges) {
    const pts = e.points;
    if (pts.length !== 4) continue;
    const from = ctx.model.nodes.get(e.from);
    const to = ctx.model.nodes.get(e.to);
    if (!from || !to || !movable(from) || !movable(to) || from.container || to.container) continue;
    for (const ax of [1, 0]) {
      const o = 1 - ax;
      // p0→p1 and p2→p3 run along `o`, the jog p1→p2 along `ax`.
      if (
        Math.abs(pts[0][ax] - pts[1][ax]) > 0.5 ||
        Math.abs(pts[2][ax] - pts[3][ax]) > 0.5 ||
        Math.abs(pts[1][o] - pts[2][o]) > 0.5
      )
        continue;
      if (!onBorder(from, pts[0], ax) || !onBorder(to, pts[3], ax)) continue;
      const [l1, h1] = slideRange(from, ax);
      const [l2, h2] = slideRange(to, ax);
      const lo = Math.max(l1, l2);
      const hi = Math.min(h1, h2);
      if (hi < lo) continue;
      const want = (pts[0][ax] + pts[3][ax]) / 2;
      const c = Math.min(hi, Math.max(lo, want));
      /** @type {Point} */
      const p0 = [pts[0][0], pts[0][1]];
      /** @type {Point} */
      const p3 = [pts[3][0], pts[3][1]];
      p0[ax] = c;
      p3[ax] = c;
      if (crowded(ctx, e, from, p0, ax) || crowded(ctx, e, to, p3, ax)) continue;
      const next = [p0, p3];
      if (hitsNode(ctx, next, [0])) continue;
      e.points = next;
      break;
    }
  }
}

/**
 * Snap near-equal coordinates, drop zero-length segments and merge collinear
 * ones so later passes see clean orthogonal routes.
 * @param {Point[]} pts
 * @returns {Point[]}
 */
export function normalizeRoute(pts) {
  /** @type {Point[]} */
  const snapped = pts.map((p) => [p[0], p[1]]);
  for (let i = 1; i < snapped.length; i++) {
    for (const k of [0, 1]) {
      if (Math.abs(snapped[i][k] - snapped[i - 1][k]) < 1.5) snapped[i][k] = snapped[i - 1][k];
    }
  }
  /** @type {Point[]} */
  const out = [];
  for (const p of snapped) {
    const prev = out[out.length - 1];
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
    const before = out[out.length - 2];
    if (
      before &&
      prev &&
      ((before[0] === prev[0] &&
        prev[0] === p[0] &&
        (prev[1] - before[1]) * (p[1] - prev[1]) > 0) ||
        (before[1] === prev[1] && prev[1] === p[1] && (prev[0] - before[0]) * (p[0] - prev[0]) > 0))
    )
      out.pop();
    out.push(p);
  }
  return out.length >= 2 ? out : pts;
}

/**
 * Remove short jogs (a short segment between two parallel ones) by sliding
 * one of the neighbours onto the other.
 * @param {Ctx} ctx
 */
function removeJogs(ctx) {
  for (const e of ctx.edges) {
    for (let guard = 0; guard < 4; guard++) {
      const pts = e.points;
      let changed = false;
      for (let i = 1; i < pts.length - 2 && !changed; i++) {
        const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        if (len > 40) continue;
        const vertical = Math.abs(pts[i][0] - pts[i + 1][0]) < 0.5;
        const ax = vertical ? 1 : 0;
        // The neighbours run along the jog's perpendicular; they must be parallel.
        if (
          Math.abs(pts[i - 1][ax] - pts[i][ax]) > 0.5 ||
          Math.abs(pts[i + 1][ax] - pts[i + 2][ax]) > 0.5
        )
          continue;
        for (const [seg, to] of [
          [i + 1, pts[i][ax]],
          [i - 1, pts[i + 1][ax]],
        ]) {
          const moved = shiftSegment(ctx, e, pts, seg, to, true);
          if (moved) {
            e.points = normalizeRoute(moved);
            changed = true;
            break;
          }
        }
      }
      if (!changed) break;
    }
  }
}

/**
 * Tidy all routes of a laid-out model.
 * @param {GraphModel} model
 */
export function tidyRoutes(model) {
  const ctx = context(model);
  for (const e of ctx.edges) e.points = normalizeRoute(e.points);
  straighten(ctx);
  removeJogs(ctx);
  clearTitles(ctx);
  makeHeadRoom(ctx);
}
