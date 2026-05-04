/**
 * @module render
 *
 * Emits Excalidraw JSON. Each model shape is dispatched to a
 * dedicated `renderXxx()` function that produces one or more
 * Excalidraw primitive elements (rectangle, ellipse, line, arrow,
 * text). The output document is a stand-alone `.excalidraw` file
 * that any Excalidraw front-end can open. The companion module
 * `src/render/svg.mjs` converts the same JSON to SVG for the
 * build-time documentation pipeline.
 */

// Excalidraw export.
//
// Emits plain rectangle / text / arrow elements. Arrows use roughness 0
// and roundness null so the output stays exactly orthogonal — no wobble,
// no Excalidraw-internal version-specific arrow fields.

import { Box, Plane, Subplane, SequenceDiagram } from "../model/diagram.mjs";
import { FONT, measureWrapped } from "../style/text.mjs";
import { SIZING } from "../layout/sizing.mjs";
import { boxColor } from "../style/colors.mjs";
import { EXCALIDRAW_SCHEMA, ROUNDNESS } from "./schema.mjs";
import { createSeededRng, stableHash32 } from "./rng.mjs";

import { exportSequenceDiagram } from "./sequence_render.mjs";

/**
 * @typedef {{x:number,y:number}} Pt 2-D point in absolute pixels.
 * @typedef {import("../style/colors.mjs").ColorTriple} ColorTriple
 * @typedef {Record<string, unknown>} ExcalElement
 *   Excalidraw element. Excalidraw's JSON shape is loose and varies by
 *   element type; we use a generic record so callers can read/write
 *   well-known fields without a full schema dependency.
 */

// `_rng` and `_idCounter` are scoped to the current `exportDiagram`
// call. They are reset at the top of `exportDiagram` so two parallel
// renders cannot collide on ids/seeds. The default RNG is seeded from
// the diagram's `sourceLabel` so identical inputs produce byte-for-byte
// identical output (= reviewable diffs in git, snapshot-friendly).
let _rng = Math.random;
let _idCounter = 0;
const RAND_RANGE = 2_000_000_000;
const newId = () => {
  const r = Math.floor(_rng() * 0xffffffff).toString(36);
  return `el_${(_idCounter++).toString(36)}_${r.slice(0, 6).padStart(6, "0")}`;
};

/**
 * Build the per-call element template populated with id, seed and
 * version-nonce. Exposed only to the helpers in this file.
 * @returns {object}
 * @internal
 */
const baseElement = () => ({
  id: newId(),
  angle: 0,
  strokeStyle: "solid",
  fillStyle: "solid",
  roughness: 0,
  opacity: 100,
  strokeWidth: 2,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: Math.floor(_rng() * RAND_RANGE),
  version: 1,
  versionNonce: Math.floor(_rng() * RAND_RANGE),
  isDeleted: false,
  boundElements: [],
  updated: 1,
  link: null,
  locked: false,
});

/** @internal */
/**
 * Build a plain Excalidraw rectangle element.
 * @param {{x:number,y:number,width:number,height:number,strokeColor:string,backgroundColor:string,fillStyle?:string}} spec
 *   x, y, width, height — element bounds in absolute pixels.
 *   strokeColor, backgroundColor — stroke and fill colours.
 *   fillStyle — Excalidraw fill style (defaults to `"solid"`).
 * @returns {ExcalElement} Excalidraw rectangle element.
 */
function rect({ x, y, width, height, strokeColor, backgroundColor, fillStyle = "solid" }) {
  /** @type {ExcalElement} */
  const el = {
    ...baseElement(),
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle,
    // Typical Excalidraw look: hand-drawn wobble + rounded corners.
    // `ROUNDNESS.proportional` mirrors what Excalidraw writes when the
    // user toggles "rounded corners" on a rectangle.
    roughness: 1,
    roundness: ROUNDNESS.proportional,
  };
  return el;
}

/** @internal */
/**
 * Build a plain Excalidraw text element.
 * @param {{x:number,y:number,width:number,height:number,value:string,fontSize:number,color:string,align?:string,vAlign?:string}} spec
 *   x, y, width, height — text-box bounds.
 *   value — displayed text.
 *   fontSize — size in px.
 *   color — stroke colour for the text.
 *   align — horizontal alignment (`left|center|right`).
 *   vAlign — vertical alignment (`top|middle|bottom`).
 * @returns {ExcalElement} Excalidraw text element.
 */
function text({ x, y, width, height, value, fontSize, color, align = "left", vAlign = "top" }) {
  /** @type {ExcalElement} */
  const el = {
    ...baseElement(),
    type: "text",
    x,
    y,
    width: Math.max(20, width),
    height: Math.max(fontSize * FONT.lineHeight, height),
    strokeColor: color,
    backgroundColor: "transparent",
    text: value,
    originalText: value,
    fontSize,
    fontFamily: FONT.family,
    textAlign: align,
    verticalAlign: vAlign,
    baseline: Math.round(fontSize * 0.85),
    containerId: /** @type {string|null} */ (null),
    lineHeight: FONT.lineHeight,
    strokeWidth: 1,
  };
  return el;
}

/** @internal */
/**
 * Build an Excalidraw arrow element from a polyline.
 * @param {{points:Pt[],strokeColor:string,dashed?:boolean,startArrowhead?:string|null,endArrowhead?:string|null}} spec
 *   points — absolute polyline coordinates (≥2 entries).
 *   strokeColor — stroke colour.
 *   dashed — render as dashed.
 *   startArrowhead, endArrowhead — Excalidraw arrowhead names.
 * @returns {ExcalElement|null} Excalidraw arrow element, or `null` when `points` has fewer than 2 entries.
 */
function arrow({ points, strokeColor, dashed, startArrowhead = null, endArrowhead = "arrow" }) {
  if (!points || points.length < 2) return null;
  const first = points[0];
  const rel = points.map((p) => /** @type {[number,number]} */ ([p.x - first.x, p.y - first.y]));
  /** @type {ExcalElement} */
  const el = {
    ...baseElement(),
    type: "arrow",
    x: first.x,
    y: first.y,
    width: Math.max(...rel.map(([px]) => px)) - Math.min(...rel.map(([px]) => px)),
    height: Math.max(...rel.map(([, py]) => py)) - Math.min(...rel.map(([, py]) => py)),
    strokeColor,
    backgroundColor: "transparent",
    strokeStyle: dashed ? "dashed" : "solid",
    points: rel,
    lastCommittedPoint: rel[rel.length - 1],
    startBinding: null,
    endBinding: null,
    startArrowhead,
    endArrowhead,
  };
  return el;
}

/** @internal */
/**
 * Build an Excalidraw ellipse element.
 * @param {{x:number,y:number,width:number,height:number,strokeColor:string,backgroundColor:string,fillStyle?:string}} spec
 *   x, y, width, height — element bounds.
 *   strokeColor, backgroundColor — stroke and fill colours.
 *   fillStyle — Excalidraw fill style (defaults to `"solid"`).
 * @returns {ExcalElement} Excalidraw ellipse element.
 */
function ellipse({ x, y, width, height, strokeColor, backgroundColor, fillStyle = "solid" }) {
  /** @type {ExcalElement} */
  const el = {
    ...baseElement(),
    type: "ellipse",
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle,
    roughness: 1,
  };
  return el;
}

/** @internal */
/**
 * Build an Excalidraw line element from a polyline. All callers pass
 * statically-known polylines, so this never returns `null`.
 * @param {{points:Pt[],strokeColor:string,dashed?:boolean,strokeWidth?:number}} spec
 *   points — absolute polyline coordinates (≥2 entries; throws otherwise).
 *   strokeColor — stroke colour.
 *   dashed — render as dashed.
 *   strokeWidth — stroke width in px.
 * @returns {ExcalElement} Excalidraw line element.
 */
function line({ points, strokeColor, dashed = false, strokeWidth = 2 }) {
  if (!points || points.length < 2) {
    throw new Error("line(): points must contain at least 2 entries");
  }
  const first = points[0];
  const rel = points.map((p) => /** @type {[number,number]} */ ([p.x - first.x, p.y - first.y]));
  /** @type {ExcalElement} */
  const el = {
    ...baseElement(),
    type: "line",
    x: first.x,
    y: first.y,
    width: Math.max(...rel.map(([px]) => px)) - Math.min(...rel.map(([px]) => px)),
    height: Math.max(...rel.map(([, py]) => py)) - Math.min(...rel.map(([, py]) => py)),
    strokeColor,
    backgroundColor: "transparent",
    strokeStyle: dashed ? "dashed" : "solid",
    strokeWidth,
    points: rel,
    lastCommittedPoint: rel[rel.length - 1],
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };
  return el;
}

/**
 * Render a laid-out diagram to an Excalidraw JSON document.
 *
 * The output is **deterministic** by default: identical input always
 * produces a byte-identical document, because element ids and seeds
 * are sourced from a stable hash of `sourceLabel` + diagram title.
 * Pass `opts.rng = Math.random` to opt back into non-deterministic
 * randomness (e.g. when running in an editor that expects unique
 * seeds across sessions).
 *
 * @param {import("../model/diagram.mjs").Diagram
 *        | import("../model/diagram.mjs").SequenceDiagram} diagram
 *   A diagram that has already been processed by `layoutDiagram`
 *   from `src/layout/elk_layout.mjs`.
 * @param {object} [opts]
 * @param {string} [opts.sourceLabel=""]    Used as `appState.name`.
 * @param {boolean} [opts.debugCorridors=false]
 *   If true, emit the routing corridors (debugging only).
 * @param {() => number} [opts.rng]
 *   Pseudo-random source returning a float in `[0, 1)`. Defaults to a
 *   seeded xorshift derived from `sourceLabel` for deterministic output.
 * @returns {object}                        Excalidraw JSON.
 * @public
 */
export function exportDiagram(diagram, opts = {}) {
  const { sourceLabel = "", debugCorridors = false, rng } = opts;
  // Reset per-call state. If the caller didn't pass an `rng`, derive a
  // deterministic one from the source label so reruns produce identical
  // documents.
  _idCounter = 0;
  _rng =
    typeof rng === "function"
      ? rng
      : createSeededRng(stableHash32(`${sourceLabel}|${diagram.title ?? ""}`));

  if (diagram instanceof SequenceDiagram) {
    return exportSequenceDiagram(diagram, {
      sourceLabel,
      primitives: { rect, text, arrow, ellipse, line },
    });
  }
  const elements = /** @type {ExcalElement[]} */ ([]);

  if (debugCorridors) renderDebugCorridors(diagram, elements);

  for (const plane of diagram.planes) renderPlane(plane, elements);
  for (const conn of diagram.connections) {
    const a = arrow({
      points: conn.path,
      strokeColor: conn.from.plane?.color?.stroke || "#444",
      dashed: conn.dashed,
      startArrowhead: conn.startArrowhead ?? null,
      endArrowhead: conn.endArrowhead ?? "arrow",
    });
    if (a) elements.push(a);
    if (conn.label) {
      const labelEls = renderEdgeLabel(conn);
      for (const el of labelEls) elements.push(el);
    }
  }

  const appState = {
    viewBackgroundColor: "#ffffff",
    gridSize: /** @type {number|null} */ (null),
    name: sourceLabel,
  };

  return {
    type: EXCALIDRAW_SCHEMA.type,
    version: EXCALIDRAW_SCHEMA.version,
    source: EXCALIDRAW_SCHEMA.source,
    elements,
    appState,
    files: {},
  };
}

/**
 * Emit translucent debug bands along every connection segment.
 * @param {import("../model/diagram.mjs").Diagram} diagram Diagram with `.connections` already laid out.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderDebugCorridors(diagram, elements) {
  const planes = diagram.planes;
  if (!planes.length) return;

  const corridors = /** @type {any} */ (diagram).corridors;
  if (!corridors || !corridors.vLines.length || !corridors.hLines.length) return;

  const graph = corridors.graph;
  if (!graph || !graph.nodes.length) return;

  // Edge styles: lane = red bands, diagonals = orange, box edges = blue
  // hairlines. Bands are rendered as rectangles; thinner "hairlines"
  // use stroke-only rectangles for box-passthrough connectors.
  const STYLES = {
    "lane-v": { thick: 14, fill: "#ff4d4d", stroke: "#d60000", opacity: 55 },
    "lane-h": { thick: 14, fill: "#ff4d4d", stroke: "#d60000", opacity: 55 },
    // Through-diagonals at every crossing — these are the clean 45°
    // segments that absorb the per-row/col offset.
    "cross-v": { thick: 14, fill: "#ffd166", stroke: "#c98a16", opacity: 75 },
    "cross-h": { thick: 14, fill: "#ffd166", stroke: "#c98a16", opacity: 75 },
    // Shortcuts: 45° pieces from each anchor to the next perpendicular
    // lane line. Distinct (teal) so they're visually separable from
    // through-diagonals and from human ground-truth annotations.
    "cross-shortcut": { thick: 10, fill: "#7fd1c4", stroke: "#0f766e", opacity: 70 },
    // Turn edges between non-paired anchors at a crossing.
    "cross-turn": { thick: 3, fill: "#bdbdbd", stroke: "#7d7d7d", opacity: 35 },
    box: { thick: 4, fill: "#5b9bff", stroke: "#1f5fd1", opacity: 70 },
    "box-spur": { thick: 4, fill: "#9cc2ff", stroke: "#1f5fd1", opacity: 65 },
  };

  for (const e of graph.edges) {
    const s = /** @type {any} */ (STYLES)[e.kind];
    if (!s) continue;
    // Lane edges (orthogonal) are drawn as-is. All diagonals
    // (cross-v, cross-h, cross-turn at crossings) are coalesced
    // first: many are collinear (the same crossing piece may be
    // emitted twice when multiple lanes share its midline), so a
    // single band per shared line is enough.
    if (e.kind === "cross-v" || e.kind === "cross-h" || e.kind === "cross-turn") continue;
    const el = bandFromEdge(e.x0, e.y0, e.x1, e.y1, s.thick, s.stroke, s.fill);
    el.opacity = s.opacity;
    el.strokeWidth = 1;
    elements.push(el);
  }

  // Coalesce collinear diagonal edges into single bands.
  const diagEdges = graph.edges.filter(
    (/** @type {any} */ e) =>
      (e.kind === "cross-v" || e.kind === "cross-h" || e.kind === "cross-turn") &&
      Math.hypot(e.x1 - e.x0, e.y1 - e.y0) > 0.5,
  );
  for (const merged of mergeCollinearEdges(diagEdges)) {
    const style = /** @type {any} */ (STYLES)[merged.kind] || STYLES["cross-v"];
    const el = bandFromEdge(
      merged.x0,
      merged.y0,
      merged.x1,
      merged.y1,
      style.thick,
      style.stroke,
      style.fill,
    );
    el.opacity = style.opacity;
    el.strokeWidth = 1;
    elements.push(el);
  }

  // Node markers — small dots so the graph topology is readable.
  const NODE_STYLES = {
    "cross-anchor": { size: 6, fill: "#ffd166", stroke: "#7a4a00" },
    "cross-joint": { size: 8, fill: "#ff8f00", stroke: "#7a4a00" },
    "cross-shortcut-end": { size: 6, fill: "#7fd1c4", stroke: "#0f766e" },
    "box-diagonal-crossing": { size: 8, fill: "#9cc2ff", stroke: "#0a2e6e" },
    "box-side": { size: 10, fill: "#1f5fd1", stroke: "#0a2e6e" },
    "box-center": { size: 12, fill: "#0a2e6e", stroke: "#000000" },
  };
  for (const n of graph.nodes) {
    const s = /** @type {any} */ (NODE_STYLES)[n.kind];
    if (!s) continue;
    const el = rect({
      x: n.x - s.size / 2,
      y: n.y - s.size / 2,
      width: s.size,
      height: s.size,
      strokeColor: s.stroke,
      backgroundColor: s.fill,
      fillStyle: "solid",
    });
    el.opacity = 80;
    el.strokeWidth = 1;
    elements.push(el);
  }
}

// Group collinear edges and emit one merged segment per group. Two
// edges are considered collinear when both endpoints of one lie on
// the (infinite) line through the other within COLINEAR_TOL. We use
// union-find over all pairs so that A↔B↔C transitively merge into a
// single group even when A and C are not directly comparable.
// Within each group the merged segment spans from the min to the max
// projection onto the shared direction. The output edge's `kind` is
// the highest-priority kind in the group: cross-v / cross-h
// (the through diagonals) outrank cross-turn (a routing-only corner
// piece that should never show as a separate segment).
const COLINEAR_TOL = 2.5;

/**
 * Merge collinear, overlapping debug-band edges to avoid stacked translucency.
 * @param {any[]} edges Raw segments.
 * @returns {any[]} Merged segments (axis-aligned, no overlap).
 */
function mergeCollinearEdges(edges) {
  const PRIO = { "cross-v": 2, "cross-h": 2, "cross-turn": 1 };
  const lines = edges.map(lineFromEdge);
  const parent = edges.map((/** @type {any} */ _, /** @type {number} */ i) => i);
  /** @type {(i:number)=>number} */
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (/** @type {number} */ a, /** @type {number} */ b) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (find(i) === find(j)) continue;
      // Direction must be parallel (allow opposite signs).
      const cross = lines[i].dx * lines[j].dy - lines[i].dy * lines[j].dx;
      if (Math.abs(cross) > 0.05) continue;
      // Both endpoints of edge j must lie on line i.
      if (
        pointOnLine(edges[j].x0, edges[j].y0, lines[i]) &&
        pointOnLine(edges[j].x1, edges[j].y1, lines[i])
      ) {
        union(i, j);
      }
    }
  }
  // Bucket edges by root.
  const buckets = new Map();
  for (let i = 0; i < edges.length; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(i);
  }
  const out = [];
  for (const idxs of buckets.values()) {
    let kind = edges[idxs[0]].kind;
    for (const i of idxs) {
      const prio = /** @type {Record<string, number>} */ (PRIO);
      if ((prio[edges[i].kind] || 0) > (prio[kind] || 0)) kind = edges[i].kind;
    }
    // Project all endpoints onto the bucket's primary direction
    // (taken from the first edge — all edges in the bucket are
    // parallel within tolerance).
    const ld = lines[idxs[0]];
    const t = (/** @type {number} */ px, /** @type {number} */ py) =>
      (px - ld.x) * ld.dx + (py - ld.y) * ld.dy;
    const pts = [];
    for (const i of idxs) {
      pts.push({ t: t(edges[i].x0, edges[i].y0), x: edges[i].x0, y: edges[i].y0 });
      pts.push({ t: t(edges[i].x1, edges[i].y1), x: edges[i].x1, y: edges[i].y1 });
    }
    pts.sort((a, b) => a.t - b.t);
    const a = pts[0],
      b = pts[pts.length - 1];
    out.push({ kind, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  return out;
}

/**
 * Reduce an edge to its underlying line description.
 * @param {any} e Edge segment with endpoints.
 * @returns {any} Line descriptor `{kind, axis, axisValue, ...}`.
 */
function lineFromEdge(e) {
  const vx = e.x1 - e.x0;
  const vy = e.y1 - e.y0;
  const len = Math.hypot(vx, vy) || 1;
  return { x: e.x0, y: e.y0, dx: vx / len, dy: vy / len };
}

/**
 * Test whether `(px,py)` lies on the given line descriptor.
 * @param {number} px X coordinate of the probe point.
 * @param {number} py Y coordinate of the probe point.
 * @param {any} line  Line descriptor produced by {@link lineFromEdge}.
 * @returns {boolean} `true` when the point lies on the line within tolerance.
 */
function pointOnLine(px, py, line) {
  const ex = px - line.x;
  const ey = py - line.y;
  const cross = ex * line.dy - ey * line.dx;
  return Math.abs(cross) <= COLINEAR_TOL;
}

// Render any edge (orthogonal or diagonal) as a rotated rectangle band.
/**
 * Build a translucent corridor band rectangle from a connection edge.
 * @param {number} x0 Start x of the centre line.
 * @param {number} y0 Start y of the centre line.
 * @param {number} x1 End x of the centre line.
 * @param {number} y1 End y of the centre line.
 * @param {number} thick Band thickness in px.
 * @param {string} stroke Stroke colour.
 * @param {string} fill   Fill colour.
 * @returns {ExcalElement} Excalidraw rectangle element representing the band.
 */
function bandFromEdge(x0, y0, x1, y1, thick, stroke, fill) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    return rect({
      x: x0 - thick / 2,
      y: y0 - thick / 2,
      width: thick,
      height: thick,
      strokeColor: stroke,
      backgroundColor: fill,
      fillStyle: "solid",
    });
  }
  const angle = Math.atan2(dy, dx);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    ...rect({
      x: cx - len / 2,
      y: cy - thick / 2,
      width: len,
      height: thick,
      strokeColor: stroke,
      backgroundColor: fill,
      fillStyle: "solid",
    }),
    angle,
  };
}

/**
 * Render a {@link Plane} (frame + title tab + recursive children).
 * @param {Plane} plane Plane to draw.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderPlane(plane, elements) {
  const color = plane.color || { stroke: "#444", fill: "#fafafa", titleFill: "#eaeaea" };
  elements.push(
    rect({
      x: plane.x,
      y: plane.y,
      width: plane.width,
      height: plane.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  renderTitleTab(
    {
      parent: plane,
      color,
      title: plane.title,
      fontSize: FONT.sizePlaneTitle,
      height: SIZING.planeTitleHeight,
      paddingX: SIZING.planePaddingX,
    },
    elements,
  );

  for (const child of plane.children) {
    if (child instanceof Subplane) renderSubplane(child, color, elements);
    else if (child instanceof Box) renderBox(child, color, elements);
  }
}

/**
 * Render a {@link Subplane} inside its parent plane.
 * @param {Subplane} sub Subplane to draw.
 * @param {ColorTriple} planeC Owning plane's colour triple (used to derive subplane colours).
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderSubplane(sub, planeC, elements) {
  const color = sub.color || planeC;
  elements.push(
    rect({
      x: sub.x,
      y: sub.y,
      width: sub.width,
      height: sub.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
      fillStyle: "solid",
    }),
  );
  // Subplane title sits inside the subplane, top-left, in border colour.
  const titleX = sub.x + SIZING.subplanePaddingX;
  const titleY = sub.y + SIZING.subplanePaddingY * 0.4;
  elements.push(
    text({
      x: titleX,
      y: titleY,
      width: sub.width - SIZING.subplanePaddingX * 2,
      height: SIZING.subplaneTitleHeight,
      value: sub.title,
      fontSize: FONT.sizeSubplaneTitle,
      color: color.stroke,
    }),
  );
  for (const box of sub.boxes) renderBox(box, color, elements);
}

/**
 * Render a single {@link Box}; dispatches to a per-shape helper.
 * @param {Box} box Box to draw.
 * @param {ColorTriple} parentColor Owning plane/subplane colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderBox(box, parentColor, elements) {
  const color = boxColor(parentColor);
  switch (box.shape) {
    case "actor":
      return renderActor(box, color, elements);
    case "usecase":
      return renderUsecase(box, color, elements);
    case "database":
      return renderDatabase(box, color, elements);
    case "cloud":
      return renderCloud(box, color, elements);
    case "interface":
      // An interface declaration with member content is part of a UML
      // class diagram, so render it as a two-compartment class box
      // rather than the standalone "lollipop" interface symbol.
      if ((box.members && box.members.length) || box.stereotype) {
        return renderClass(box, color, elements);
      }
      return renderInterface(box, color, elements);
    case "entity":
      return renderEntity(box, color, elements);
    case "node":
      return renderNodeShape(box, color, elements);
    case "class":
      return renderClass(box, color, elements);
    case "enum":
      return renderClass(box, color, elements);
    case "note":
      return renderNote(box, elements);
    default:
      return renderRectangleShape(box, color, elements);
  }
}

/**
 * Render a generic rectangle / component box.
 * @param {Box} box Box to draw.
 * @param {ColorTriple} color Colour triple to apply.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderRectangleShape(box, color, elements) {
  elements.push(
    rect({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  renderBoxText(box, color, elements);
}

/**
 * @param {Box} box
 * @param {{ stroke: string, fill: string, titleFill: string }} color
 * @param {object[]} elements
 * @param {{ titleColor?: string }} [opts]
 * @internal
 */
/**
 * Render the title and (optional) description text for a box.
 * @param {Box} box Box being drawn.
 * @param {ColorTriple} color Colour triple supplying the text colour.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @param {{titleColor?:string}} [opts] Override colour for the title only.
 * @returns {void}
 */
function renderBoxText(box, color, elements, { titleColor } = {}) {
  const tx = box.x + SIZING.boxPaddingX;
  const ty = box.y + SIZING.boxPaddingY;
  // Prefer the wrapped title cached by the sizing pass (so visible
  // text never overflows the box width). Falls back to the raw title
  // for callers that bypass sizing.
  const titleValue = box._wrappedTitle ?? String(box.title || "");
  const titleLines = titleValue.split("\n").length;
  const titleHeight = FONT.sizeTitle * FONT.lineHeight * titleLines;
  if (box.stereotype) {
    elements.push(
      text({
        x: tx,
        y: ty - 4,
        width: box.width - SIZING.boxPaddingX * 2,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: `«${box.stereotype}»`,
        fontSize: FONT.sizeDescription,
        color: color.stroke,
        align: "center",
      }),
    );
  }
  elements.push(
    text({
      x: tx,
      y: ty + (box.stereotype ? FONT.sizeDescription * FONT.lineHeight : 0),
      width: box.width - SIZING.boxPaddingX * 2,
      height: titleHeight,
      value: titleValue,
      fontSize: FONT.sizeTitle,
      color: titleColor || color.stroke,
      align: "center",
    }),
  );
  if (box.description) {
    const descValue = box._wrappedDescription ?? String(box.description);
    elements.push(
      text({
        x: tx,
        y:
          ty +
          titleHeight +
          (box.stereotype ? FONT.sizeDescription * FONT.lineHeight : 0) +
          SIZING.boxTitleGap,
        width: box.width - SIZING.boxPaddingX * 2,
        height: box.height - SIZING.boxPaddingY * 2 - titleHeight,
        value: descValue,
        fontSize: FONT.sizeDescription,
        color: "#444",
      }),
    );
  }
}

// --- Actor (stickman) ---------------------------------------------------
/**
 * Render a stick-figure actor shape with label.
 * @param {Box} box Box (shape == `actor`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderActor(box, color, elements) {
  // Stickman occupies upper portion; label below.
  const cx = box.x + box.width / 2;
  const top = box.y + 4;
  const headD = Math.min(28, box.height * 0.32);
  const bodyTop = top + headD;
  const bodyBottom = top + box.height * 0.7;
  elements.push(
    ellipse({
      x: cx - headD / 2,
      y: top,
      width: headD,
      height: headD,
      strokeColor: color.stroke,
      backgroundColor: "#ffffff",
    }),
  );
  // Body
  elements.push(
    line({
      points: [
        { x: cx, y: bodyTop },
        { x: cx, y: bodyBottom },
      ],
      strokeColor: color.stroke,
    }),
  );
  // Arms
  const armY = bodyTop + (bodyBottom - bodyTop) * 0.25;
  const armR = Math.min(22, box.width * 0.35);
  elements.push(
    line({
      points: [
        { x: cx - armR, y: armY },
        { x: cx + armR, y: armY },
      ],
      strokeColor: color.stroke,
    }),
  );
  // Legs
  const legR = Math.min(18, box.width * 0.3);
  elements.push(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx - legR, y: bodyBottom + 18 },
      ],
      strokeColor: color.stroke,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx + legR, y: bodyBottom + 18 },
      ],
      strokeColor: color.stroke,
    }),
  );
  // Label below the stickman
  const labelY = bodyBottom + 22;
  const titleLines = String(box.title || "").split("\n").length;
  elements.push(
    text({
      x: box.x,
      y: labelY,
      width: box.width,
      height: FONT.sizeTitle * FONT.lineHeight * titleLines,
      value: box.title,
      fontSize: FONT.sizeTitle,
      color: color.stroke,
      align: "center",
    }),
  );
}

// --- Use case (ellipse) -------------------------------------------------
/**
 * Render an oval use-case shape with label.
 * @param {Box} box Box (shape == `usecase`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderUsecase(box, color, elements) {
  elements.push(
    ellipse({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  const titleLines = String(box.title || "").split("\n").length;
  const th = FONT.sizeTitle * FONT.lineHeight * titleLines;
  elements.push(
    text({
      x: box.x + SIZING.boxPaddingX,
      y: box.y + (box.height - th) / 2,
      width: box.width - SIZING.boxPaddingX * 2,
      height: th,
      value: box.title,
      fontSize: FONT.sizeTitle,
      color: color.stroke,
      align: "center",
    }),
  );
}

// --- Database (cylinder approximation) ----------------------------------
/**
 * Render a database cylinder shape.
 * @param {Box} box Box (shape == `database`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderDatabase(box, color, elements) {
  const lipH = Math.min(18, box.height * 0.18);
  // Body rect
  elements.push(
    rect({
      x: box.x,
      y: box.y + lipH / 2,
      width: box.width,
      height: box.height - lipH,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  // Top ellipse (lid)
  elements.push(
    ellipse({
      x: box.x,
      y: box.y,
      width: box.width,
      height: lipH,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  // Bottom ellipse (base) — only the front half is actually visible but
  // Excalidraw draws full ellipses; this still reads as a cylinder.
  elements.push(
    ellipse({
      x: box.x,
      y: box.y + box.height - lipH,
      width: box.width,
      height: lipH,
      strokeColor: color.stroke,
      backgroundColor: "transparent",
      fillStyle: "hachure",
    }),
  );
  renderBoxText(/** @type {Box} */ ({ ...box, y: box.y + lipH }), color, elements);
}

// --- Cloud ---------------------------------------------------------------
/**
 * Render a fluffy cloud shape from overlapping ellipses.
 * @param {Box} box Box (shape == `cloud`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderCloud(box, color, elements) {
  // Approximation: large ellipse with two smaller ones for puffy look.
  elements.push(
    ellipse({
      x: box.x,
      y: box.y + box.height * 0.12,
      width: box.width,
      height: box.height * 0.85,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  const puff = Math.min(box.width, box.height) * 0.35;
  elements.push(
    ellipse({
      x: box.x + box.width * 0.15,
      y: box.y,
      width: puff,
      height: puff,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  elements.push(
    ellipse({
      x: box.x + box.width * 0.55,
      y: box.y + 4,
      width: puff,
      height: puff,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  renderBoxText(box, color, elements);
}

// --- Interface (small filled circle, lollipop-style) --------------------
/**
 * Render the lollipop interface shape.
 * @param {Box} box Box (shape == `interface`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderInterface(box, color, elements) {
  const d = Math.min(box.width, box.height) * 0.55;
  const cx = box.x + box.width / 2;
  const cy = box.y + d / 2 + 4;
  elements.push(
    ellipse({
      x: cx - d / 2,
      y: cy - d / 2,
      width: d,
      height: d,
      strokeColor: color.stroke,
      backgroundColor: "#ffffff",
    }),
  );
  const labelY = cy + d / 2 + 6;
  const titleLines = String(box.title || "").split("\n").length;
  elements.push(
    text({
      x: box.x,
      y: labelY,
      width: box.width,
      height: FONT.sizeTitle * FONT.lineHeight * titleLines,
      value: box.title,
      fontSize: FONT.sizeTitle,
      color: color.stroke,
      align: "center",
    }),
  );
}

// --- Entity (rectangle + horizontal line below title) -------------------
/**
 * Render an entity ER-style shape (rectangle with rounded base).
 * @param {Box} box Box (shape == `entity`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderEntity(box, color, elements) {
  elements.push(
    rect({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  renderBoxText(box, color, elements);
}

// --- Node (3-D box) ------------------------------------------------------
/**
 * Render a 3D node (deployment) shape.
 * @param {Box} box Box (shape == `node`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderNodeShape(box, color, elements) {
  const off = 8;
  // Back rectangle (offset)
  elements.push(
    rect({
      x: box.x + off,
      y: box.y - off,
      width: box.width - off,
      height: box.height - off,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  // Front rectangle
  elements.push(
    rect({
      x: box.x,
      y: box.y,
      width: box.width - off,
      height: box.height - off,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  renderBoxText(
    /** @type {Box} */ ({ ...box, width: box.width - off, height: box.height - off }),
    color,
    elements,
  );
}

// --- Class (rectangle with member compartment) --------------------------
/**
 * Render a UML class compartment box.
 * @param {Box} box Box (shape == `class`).
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderClass(box, color, elements) {
  elements.push(
    rect({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      strokeColor: color.stroke,
      backgroundColor: color.fill,
    }),
  );
  // Prefer the wrapped title cached by the sizing pass so long names
  // (notably class-diagram generics like `Container<T extends Base>`)
  // do not overflow the box width. Falls back to the raw title for
  // callers that bypass sizing.
  const titleValue = box._wrappedTitle ?? String(box.title || "");
  const titleLines = titleValue.split("\n").length;
  const titleH = FONT.sizeTitle * FONT.lineHeight * titleLines;
  let ty = box.y + SIZING.boxPaddingY;
  if (box.stereotype) {
    elements.push(
      text({
        x: box.x + SIZING.boxPaddingX,
        y: ty - 4,
        width: box.width - SIZING.boxPaddingX * 2,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: `«${box.stereotype}»`,
        fontSize: FONT.sizeDescription,
        color: color.stroke,
        align: "center",
      }),
    );
    ty += FONT.sizeDescription * FONT.lineHeight;
  }
  elements.push(
    text({
      x: box.x + SIZING.boxPaddingX,
      y: ty,
      width: box.width - SIZING.boxPaddingX * 2,
      height: titleH,
      value: titleValue,
      fontSize: FONT.sizeTitle,
      color: color.stroke,
      align: "center",
    }),
  );
  if (box.members && box.members.length) {
    const sepY = ty + titleH + 4;
    elements.push(
      line({
        points: [
          { x: box.x, y: sepY },
          { x: box.x + box.width, y: sepY },
        ],
        strokeColor: color.stroke,
        strokeWidth: 1,
      }),
    );
    elements.push(
      text({
        x: box.x + SIZING.boxPaddingX,
        y: sepY + 4,
        width: box.width - SIZING.boxPaddingX * 2,
        height: box.members.length * FONT.sizeDescription * FONT.lineHeight,
        value: box.members.join("\n"),
        fontSize: FONT.sizeDescription,
        color: "#222",
        align: "left",
      }),
    );
  }
}

// --- Note (yellow sticky) ----------------------------------------------
/**
 * Render a sticky-note shape with a folded corner.
 * @param {Box} box Box (shape == `note`).
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderNote(box, elements) {
  const NOTE_FILL = "#fff5b1";
  const NOTE_STROKE = "#a07b00";
  elements.push(
    rect({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      strokeColor: NOTE_STROKE,
      backgroundColor: NOTE_FILL,
    }),
  );
  // Folded corner triangle (fake — just a small line).
  const fold = 12;
  elements.push(
    line({
      points: [
        { x: box.x + box.width - fold, y: box.y },
        { x: box.x + box.width - fold, y: box.y + fold },
        { x: box.x + box.width, y: box.y + fold },
      ],
      strokeColor: NOTE_STROKE,
      strokeWidth: 1,
    }),
  );
  const text_value = box.description || box.title;
  elements.push(
    text({
      x: box.x + SIZING.boxPaddingX,
      y: box.y + SIZING.boxPaddingY,
      width: box.width - SIZING.boxPaddingX * 2,
      height: box.height - SIZING.boxPaddingY * 2,
      value: text_value,
      fontSize: FONT.sizeDescription,
      color: "#000",
    }),
  );
}

/**
 * Render a connection label as a small white "chip": a rounded
 * rectangle background with the text on top, both rotated to follow
 * the segment they sit on so the label visually belongs to the line.
 * The text is kept slightly smaller than body copy and clamped to a
 * sensible width so long labels wrap into a compact mini-box rather
 * than smearing along the line.
 *
 * @param {import("../model/diagram.mjs").Connection} conn Connection whose label is rendered.
 * @returns {ExcalElement[]}    Zero, one or two Excalidraw elements
 *                        (background rect + text), in z-order.
 * @internal
 */
function renderEdgeLabel(conn) {
  const path = conn.path;
  if (!path || path.length < 2) return [];
  // Place at the geometric midpoint of the longest segment so the
  // chip sits on a long, straight stretch of the edge whenever
  // possible (otherwise it would land on a short bend).
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < path.length - 1; i++) {
    const dx = path[i + 1].x - path[i].x;
    const dy = path[i + 1].y - path[i].y;
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  const a = path[bestIdx];
  const b = path[bestIdx + 1];
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;

  // Segment angle, normalised to [-π/2, π/2] so text always reads
  // upright (never upside down).
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;

  const fontSize = FONT.sizeEdgeLabel;
  // Clamp the chip width to the segment length (minus a small margin
  // so arrowheads stay clear) and cap at a comfortable absolute max.
  const segCap = Math.max(40, bestLen - 24);
  const maxChipWidth = Math.min(180, segCap);
  const wrapped = measureWrapped(String(conn.label), fontSize, maxChipWidth - 12);
  const padX = 6;
  const padY = 3;
  const w = Math.min(maxChipWidth, wrapped.width + padX * 2);
  const h = wrapped.height + padY * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const value = wrapped.lines.join("\n");

  const chip = rect({
    x,
    y,
    width: w,
    height: h,
    strokeColor: "#aab2bd",
    backgroundColor: "#ffffff",
  });
  chip.angle = angle;
  // `rect()` already sets roughness 1 + proportional roundness; we
  // keep both so the chip matches the rest of the diagram's wobble.

  const label = text({
    x: x + padX,
    y: y + padY,
    width: w - padX * 2,
    height: h - padY * 2,
    value,
    fontSize,
    color: "#222",
    align: "center",
    vAlign: "middle",
  });
  label.angle = angle;
  return [chip, label];
}

/**
 * Render a header tab on top of a plane / subplane.
 * @param {{parent:(Plane|Subplane),color:ColorTriple,title:string,fontSize:number,height:number,paddingX:number}} spec
 *   parent     — plane/subplane the tab belongs to.
 *   color      — colour triple supplying tab and text colours.
 *   title      — tab text.
 *   fontSize   — text size in px.
 *   height     — tab height in px.
 *   paddingX   — horizontal padding around the title.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderTitleTab({ parent, color, title, fontSize, height, paddingX }, elements) {
  const padX = 14;
  const w = Math.min(
    parent.width - paddingX * 2,
    Math.max(120, title.length * fontSize * FONT.glyphRatio + padX * 2),
  );
  const x = parent.x + paddingX;
  const y = parent.y + 8;
  elements.push(
    rect({
      x,
      y,
      width: w,
      height,
      strokeColor: color.stroke,
      backgroundColor: color.titleFill,
    }),
  );
  elements.push(
    text({
      x: x + padX,
      y: y + (height - fontSize * FONT.lineHeight) / 2,
      width: w - padX * 2,
      height: fontSize * FONT.lineHeight,
      value: title,
      fontSize,
      color: color.stroke,
      align: "left",
      vAlign: "middle",
    }),
  );
}
