/**
 * Collision-aware label placement. Callers register obstacles (node boxes,
 * connector polylines, arrowhead zones, already placed labels) and pick the
 * cheapest of several candidate positions for each label. Costs grow with the
 * area of overlapping boxes and the length of line segments running through
 * the label, so labels avoid covering lines, heads and other labels.
 * @module layout/labels
 */

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {[number, number]} Point */

/**
 * Length of the part of segment a→b inside a box (Liang–Barsky clipping).
 * @param {Point} a
 * @param {Point} b
 * @param {Box} r
 */
export function segmentInBox(a, b, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.w - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return 0;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return 0;
  }
  return Math.hypot(dx, dy) * (t1 - t0);
}

/**
 * @param {Box} a
 * @param {Box} b
 */
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** @public */
export class Obstacles {
  constructor() {
    /** @type {{ box: Box, weight: number, owner: string | null }[]} */
    this.boxes = [];
    /** @type {{ a: Point, b: Point, weight: number, owner: string | null }[]} */
    this.segments = [];
  }

  /**
   * @param {Box} box
   * @param {{ weight?: number, owner?: string | null }} [o]
   */
  addBox(box, o = {}) {
    this.boxes.push({ box, weight: o.weight ?? 1, owner: o.owner ?? null });
  }

  /**
   * @param {Point[]} points
   * @param {{ weight?: number, owner?: string | null }} [o]
   */
  addPolyline(points, o = {}) {
    for (let i = 1; i < points.length; i++) {
      this.segments.push({
        a: points[i - 1],
        b: points[i],
        weight: o.weight ?? 1,
        owner: o.owner ?? null,
      });
    }
  }

  /**
   * Protect the area around a line end (arrowheads, crow's feet, diamonds).
   * @param {Point} tip
   * @param {Point} from Neighbouring point on the line.
   * @param {number} [size]
   */
  addHead(tip, from, size = 22) {
    const len = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
    const ux = (tip[0] - from[0]) / len;
    const uy = (tip[1] - from[1]) / len;
    const cx = tip[0] - (ux * size) / 2;
    const cy = tip[1] - (uy * size) / 2;
    this.addBox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, { weight: 4 });
  }

  /**
   * Cost of putting a label at `box`. Obstacles owned by `ignore` (the
   * label's own edge, for example) only count where they cross the label.
   * @param {Box} box
   * @param {string | null} [ignore]
   */
  cost(box, ignore = null) {
    let c = 0;
    for (const o of this.boxes) {
      if (ignore !== null && o.owner === ignore) continue;
      c += overlapArea(box, o.box) * o.weight;
    }
    for (const s of this.segments) {
      const inside = segmentInBox(s.a, s.b, box);
      if (inside > 0)
        c += inside * (box.h + 6) * s.weight * (s.owner !== null && s.owner === ignore ? 0.6 : 1);
    }
    return c;
  }

  /**
   * Choose the cheapest candidate (ties keep the earlier candidate) and
   * register it as an obstacle.
   * @param {(Box & { penalty?: number })[]} candidates
   * @param {{ owner?: string | null, register?: boolean }} [o]
   * @returns {Box}
   */
  place(candidates, o = {}) {
    let best = candidates[0];
    let bestCost = Infinity;
    for (const c of candidates) {
      const cost = this.cost(c, o.owner ?? null) + (c.penalty ?? 0);
      if (cost < bestCost - 1e-6) {
        best = c;
        bestCost = cost;
      }
    }
    if (o.register !== false)
      this.addBox(
        { x: best.x, y: best.y, w: best.w, h: best.h },
        { weight: 2, owner: o.owner ?? null },
      );
    return best;
  }
}

/**
 * Candidate boxes for a label of size `w × h` along a polyline: at several
 * points of every segment, on both sides, plus centred on the line.
 * @param {Point[]} points
 * @param {number} w
 * @param {number} h
 * @param {{ margin?: number, keepFromEnds?: number, preferred?: Box | null }} [o]
 * @returns {(Box & { penalty: number })[]}
 */
export function alongPolyline(points, w, h, o = {}) {
  const margin = o.margin ?? 4;
  const keep = o.keepFromEnds ?? 26;
  /** @type {(Box & { penalty: number })[]} */
  const out = [];
  // A layout-time position only helps while it still sits next to the line.
  const pref =
    o.preferred &&
    points.some(
      (p, i) =>
        i > 0 &&
        segmentInBox(points[i - 1], p, {
          x: o.preferred.x - 14,
          y: o.preferred.y - 14,
          w: o.preferred.w + 28,
          h: o.preferred.h + 28,
        }) > 0,
    )
      ? o.preferred
      : null;
  if (pref) out.push({ ...pref, penalty: 0 });
  const total = points.reduce(
    (s, p, i) => (i ? s + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0),
    0,
  );
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) continue;
    const horizontal = Math.abs(b[1] - a[1]) < Math.abs(b[0] - a[0]);
    for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const along = walked + len * t;
      if (along < keep || total - along < keep) continue;
      const px = a[0] + (b[0] - a[0]) * t;
      const py = a[1] + (b[1] - a[1]) * t;
      const sides = horizontal
        ? [
            [px - w / 2, py - h - margin],
            [px - w / 2, py + margin],
          ]
        : [
            [px + margin, py - h / 2],
            [px - w - margin, py - h / 2],
          ];
      for (const [x, y] of sides) {
        const dist = pref ? Math.hypot(x - pref.x, y - pref.y) : Math.abs(t - 0.5) * 40;
        out.push({ x, y, w, h, penalty: dist * 0.5 });
      }
      out.push({
        x: px - w / 2,
        y: py - h / 2,
        w,
        h,
        penalty: 40 + (pref ? Math.hypot(px - w / 2 - pref.x, py - h / 2 - pref.y) * 0.5 : 0),
      });
    }
    walked += len;
  }
  if (!out.length) {
    const mid = points[Math.floor(points.length / 2)];
    out.push({ x: mid[0] + margin, y: mid[1] - h / 2, w, h, penalty: 0 });
  }
  return out;
}

/**
 * Candidate boxes for an end label (multiplicity, role) near `tip`, beyond
 * the arrowhead zone and on either side of the line.
 * @param {Point} tip
 * @param {Point} from
 * @param {number} w
 * @param {number} h
 * @param {boolean} [headed] The end carries an arrowhead / diamond; labels keep clear of it.
 * @returns {(Box & { penalty: number })[]}
 */
export function nearEnd(tip, from, w, h, headed = true) {
  const len = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const ux = (tip[0] - from[0]) / len;
  const uy = (tip[1] - from[1]) / len;
  /** @type {(Box & { penalty: number })[]} */
  const out = [];
  const near = headed ? 26 : 12;
  for (const back of [near, near + 8, near + 18]) {
    const px = tip[0] - ux * back;
    const py = tip[1] - uy * back;
    for (const side of [1, -1]) {
      // Offset perpendicular to the line so the label sits beside it.
      const nx = -uy * side;
      const ny = ux * side;
      const cx = px + nx * (Math.abs(ny) > 0.5 ? h / 2 + 4 : w / 2 + 5);
      const cy = py + ny * (Math.abs(ny) > 0.5 ? h / 2 + 4 : w / 2 + 5);
      out.push({ x: cx - w / 2, y: cy - h / 2, w, h, penalty: back - near });
    }
  }
  return out;
}
