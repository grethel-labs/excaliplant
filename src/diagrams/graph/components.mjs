/** @typedef {import("../../model/graph.mjs").GraphModel} GraphModel */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */
/** @typedef {import("../../model/graph.mjs").GraphEdge} GraphEdge */
/** @typedef {{ nodes: GraphNode[], edges: GraphEdge[], x1: number, y1: number, x2: number, y2: number }} Component */

const GAP = 50;

/** @param {GraphModel} model */
function collectComponents(model) {
  const roots = [...model.nodes.values()].filter((n) => !n.parent && !n.removed);
  /** @type {Map<GraphNode, GraphNode>} */
  const top = new Map();
  for (const n of model.nodes.values()) {
    let r = n;
    while (r.parent) r = r.parent;
    top.set(n, r);
  }
  /** @type {Map<GraphNode, GraphNode>} */
  const uf = new Map(roots.map((r) => [r, r]));
  /** @param {GraphNode} n @returns {GraphNode} */
  const find = (n) => {
    let r = n;
    while (uf.get(r) !== r) r = /** @type {GraphNode} */ (uf.get(r));
    uf.set(n, r);
    return r;
  };
  for (const e of model.edges) {
    const a = model.nodes.get(e.from);
    const b = model.nodes.get(e.to);
    if (!a || !b) continue;
    const ra = find(/** @type {GraphNode} */ (top.get(a)));
    const rb = find(/** @type {GraphNode} */ (top.get(b)));
    if (ra !== rb) uf.set(ra, rb);
  }
  /** @type {Map<GraphNode, Component>} */
  const comps = new Map();
  for (const n of model.nodes.values()) {
    if (n.removed) continue;
    const key = find(/** @type {GraphNode} */ (top.get(n)));
    const c = comps.get(key) ?? {
      nodes: [],
      edges: [],
      x1: Infinity,
      y1: Infinity,
      x2: -Infinity,
      y2: -Infinity,
    };
    c.nodes.push(n);
    c.x1 = Math.min(c.x1, n.x);
    c.y1 = Math.min(c.y1, n.y);
    c.x2 = Math.max(c.x2, n.x + n.width);
    c.y2 = Math.max(c.y2, n.y + n.height);
    comps.set(key, c);
  }
  for (const e of model.edges) {
    const a = model.nodes.get(e.from);
    if (!a) continue;
    const c = comps.get(find(/** @type {GraphNode} */ (top.get(a))));
    if (!c) continue;
    c.edges.push(e);
    for (const [x, y] of e.points) {
      c.x1 = Math.min(c.x1, x);
      c.y1 = Math.min(c.y1, y);
      c.x2 = Math.max(c.x2, x);
      c.y2 = Math.max(c.y2, y);
    }
    for (const b of [e.labelBox, e.fromLabelBox, e.toLabelBox]) {
      if (!b) continue;
      c.x1 = Math.min(c.x1, b.x);
      c.y1 = Math.min(c.y1, b.y);
      c.x2 = Math.max(c.x2, b.x + b.width);
      c.y2 = Math.max(c.y2, b.y + b.height);
    }
  }
  return [...comps.values()]
    .filter((c) => Number.isFinite(c.x1))
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
}

/**
 * Measure or apply a shelf arrangement. When requested, reserve enough items
 * for the remaining shelves so smaller graphs can fit between the aspect
 * ratios available from full shelves alone.
 * @param {Component[]} list
 * @param {number} shelfWidth
 * @param {number} [minRows]
 * @param {boolean} [move]
 */
function arrangeShelves(list, shelfWidth, minRows = 1, move = false) {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const w = c.x2 - c.x1;
    const h = c.y2 - c.y1;
    if (x > 0 && (x + w > shelfWidth || list.length - i < minRows)) {
      x = 0;
      y += rowHeight + GAP;
      rowHeight = 0;
      minRows--;
    }
    if (move) translateComponent(c, x - c.x1, y - c.y1);
    width = Math.max(width, x + w);
    x += w + GAP;
    rowHeight = Math.max(rowHeight, h);
  }
  return { width, height: y + rowHeight };
}

/** @param {Component} component @param {number} dx @param {number} dy */
function translateComponent(component, dx, dy) {
  for (const n of component.nodes) {
    n.x += dx;
    n.y += dy;
  }
  for (const e of component.edges) {
    e.points = e.points.map(([px, py]) => [px + dx, py + dy]);
    for (const b of [e.labelBox, e.fromLabelBox, e.toLabelBox]) {
      if (!b) continue;
      b.x += dx;
      b.y += dy;
    }
  }
}

/** @param {number} width @param {number} height @param {number} targetLog */
function ratioDistance(width, height, targetLog) {
  return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)
    ? Math.abs(Math.log(width) - Math.log(height) - targetLog)
    : Infinity;
}

/**
 * ELK usually lays disconnected components out in one row. Keep the existing
 * shelves as the default, then compare a bounded set of alternatives by their
 * occupied bounds when a target ratio is present.
 * @param {GraphModel} model
 * @param {number} [aspectRatio]
 */
export function planComponents(model, aspectRatio) {
  const list = collectComponents(model);
  const left = Math.min(...list.map((c) => c.x1));
  const top = Math.min(...list.map((c) => c.y1));
  const right = Math.max(...list.map((c) => c.x2));
  const bottom = Math.max(...list.map((c) => c.y2));
  let width = Math.max(0, right) - Math.min(0, left);
  let height = Math.max(0, bottom) - Math.min(0, top);
  let shelfWidth = null;
  let minRows = 1;
  const targetLog = aspectRatio === undefined ? Infinity : Math.log(aspectRatio);
  let distance = ratioDistance(right - left, bottom - top, targetLog);
  const packByDefault = list.length >= 4 && width >= height * 2.5;
  if (packByDefault || (aspectRatio !== undefined && list.length > 1)) {
    const widest = Math.max(...list.map((c) => c.x2 - c.x1));
    const area = list.reduce((s, c) => s + (c.x2 - c.x1 + GAP) * (c.y2 - c.y1 + GAP), 0);
    if (packByDefault) {
      shelfWidth = Math.max(widest, Math.sqrt(area * 1.6));
      const bounds = arrangeShelves(list, shelfWidth);
      width = shelfWidth;
      height = bounds.height;
      distance = ratioDistance(bounds.width, bounds.height, targetLog);
    }
    if (aspectRatio !== undefined) {
      const side = Math.sqrt(area);
      const growth = Math.sqrt(aspectRatio);
      const desiredWidth = side * growth;
      const desiredHeight = side / growth;
      const averageHeight = list.reduce((s, c) => s + c.y2 - c.y1 + GAP, 0) / list.length;
      const rows = Math.min(list.length, Math.round(desiredHeight / averageHeight));
      const rowCounts = new Set([
        1,
        ...[rows - 1, rows, rows + 1].filter((n) => n > 1 && n <= list.length),
      ]);
      const widths = new Set([
        widest,
        ...[0.7, 1, 1.4].map((scale) => Math.max(widest, desiredWidth * scale)),
        Infinity,
      ]);
      for (const candidateWidth of widths) {
        for (const rowCount of rowCounts) {
          const bounds = arrangeShelves(list, candidateWidth, rowCount);
          const score = ratioDistance(bounds.width, bounds.height, targetLog);
          if (score >= distance) continue;
          shelfWidth = candidateWidth;
          minRows = rowCount;
          width = bounds.width;
          height = bounds.height;
          distance = score;
        }
      }
    }
  }
  return {
    distance,
    apply() {
      if (shelfWidth !== null) arrangeShelves(list, shelfWidth, minRows, true);
      model.width = width;
      model.height = height;
    },
  };
}
