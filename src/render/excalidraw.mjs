/**
 * @module render
 *
 * Emits Excalidraw JSON. Each model shape is dispatched to a
 * dedicated `renderXxx()` function that produces one or more
 * Excalidraw primitive elements (rectangle, ellipse, line, arrow,
 * text). The output document is a stand-alone `.excalidraw` file
 * that any Excalidraw front-end can open. The companion module
 * [`src/render/svg.mjs`](./src/render/svg.mjs) converts the same
 * JSON to SVG for the build-time documentation pipeline.
 */

// Excalidraw export.
//
// Emits plain rectangle / text / arrow elements. Arrows use roughness 0
// and roundness null so the output stays exactly orthogonal — no wobble,
// no Excalidraw-internal version-specific arrow fields.

import { Box, Plane, Subplane, SequenceDiagram } from "../model/diagram.mjs";
import { FONT } from "../style/text.mjs";
import { SIZING } from "../layout/sizing.mjs";
import { boxColor } from "../style/colors.mjs";

import { exportSequenceDiagram } from "./sequence_render.mjs";

let idCounter = 0;
const newId = () => `el_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
  seed: Math.floor(Math.random() * 2_000_000_000),
  version: 1,
  versionNonce: Math.floor(Math.random() * 2_000_000_000),
  isDeleted: false,
  boundElements: [],
  updated: 1,
  link: null,
  locked: false,
});

function rect({ x, y, width, height, strokeColor, backgroundColor, fillStyle = "solid" }) {
  return {
    ...baseElement(),
    type: "rectangle",
    x, y, width, height,
    strokeColor,
    backgroundColor,
    fillStyle,
    // Typical Excalidraw look: hand-drawn wobble + rounded corners.
    // Roundness type 3 = "proportional" radius (Excalidraw's default
    // for rectangles when the user toggles rounded corners).
    roughness: 1,
    roundness: { type: 3 },
  };
}

function text({ x, y, width, height, value, fontSize, color, align = "left", vAlign = "top" }) {
  return {
    ...baseElement(),
    type: "text",
    x, y,
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
    containerId: null,
    lineHeight: FONT.lineHeight,
    strokeWidth: 1,
  };
}

function arrow({ points, strokeColor, dashed, startArrowhead = null, endArrowhead = "arrow" }) {
  if (!points || points.length < 2) return null;
  const first = points[0];
  const rel = points.map((p) => [p.x - first.x, p.y - first.y]);
  return {
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
}

function ellipse({ x, y, width, height, strokeColor, backgroundColor, fillStyle = "solid" }) {
  return {
    ...baseElement(),
    type: "ellipse",
    x, y, width, height,
    strokeColor, backgroundColor, fillStyle,
    roughness: 1,
  };
}

function line({ points, strokeColor, dashed = false, strokeWidth = 2 }) {
  if (!points || points.length < 2) return null;
  const first = points[0];
  const rel = points.map((p) => [p.x - first.x, p.y - first.y]);
  return {
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
}

export function exportDiagram(diagram, { sourceLabel = "", debugCorridors = false } = {}) {
  idCounter = 0;
  if (diagram instanceof SequenceDiagram) {
    return exportSequenceDiagram(diagram, {
      sourceLabel,
      primitives: { rect, text, arrow, ellipse, line },
    });
  }
  const elements = [];

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
      const labelEl = renderEdgeLabel(conn);
      if (labelEl) elements.push(labelEl);
    }
  }

  const appState = {
    viewBackgroundColor: "#ffffff",
    gridSize: null,
    name: sourceLabel,
  };

  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState,
    files: {},
  };
}

function renderDebugCorridors(diagram, elements) {
  const planes = diagram.planes;
  if (!planes.length) return;

  const corridors = diagram.corridors;
  if (!corridors || !corridors.vLines.length || !corridors.hLines.length) return;

  const graph = corridors.graph;
  if (!graph || !graph.nodes.length) return;

  // Edge styles: lane = red bands, diagonals = orange, box edges = blue
  // hairlines. Bands are rendered as rectangles; thinner "hairlines"
  // use stroke-only rectangles for box-passthrough connectors.
  const STYLES = {
    "lane-v":     { thick: 14, fill: "#ff4d4d", stroke: "#d60000", opacity: 55 },
    "lane-h":     { thick: 14, fill: "#ff4d4d", stroke: "#d60000", opacity: 55 },
    // Through-diagonals at every crossing — these are the clean 45°
    // segments that absorb the per-row/col offset.
    "cross-v":    { thick: 14, fill: "#ffd166", stroke: "#c98a16", opacity: 75 },
    "cross-h":    { thick: 14, fill: "#ffd166", stroke: "#c98a16", opacity: 75 },
    // Shortcuts: 45° pieces from each anchor to the next perpendicular
    // lane line. Distinct (teal) so they're visually separable from
    // through-diagonals and from human ground-truth annotations.
    "cross-shortcut": { thick: 10, fill: "#7fd1c4", stroke: "#0f766e", opacity: 70 },
    // Turn edges between non-paired anchors at a crossing.
    "cross-turn": { thick:  3, fill: "#bdbdbd", stroke: "#7d7d7d", opacity: 35 },
    "box":        { thick:  4, fill: "#5b9bff", stroke: "#1f5fd1", opacity: 70 },
    "box-spur":   { thick:  4, fill: "#9cc2ff", stroke: "#1f5fd1", opacity: 65 },
  };

  for (const e of graph.edges) {
    const s = STYLES[e.kind];
    if (!s) continue;
    // Lane edges (orthogonal) are drawn as-is. All diagonals
    // (cross-v, cross-h, cross-turn at crossings) are coalesced
    // first: many are collinear (the same crossing piece may be
    // emitted twice when multiple lanes share its midline), so a
    // single band per shared line is enough.
    if (e.kind === "cross-v" || e.kind === "cross-h"
        || e.kind === "cross-turn") continue;
    const el = bandFromEdge(e.x0, e.y0, e.x1, e.y1, s.thick, s.stroke, s.fill);
    el.opacity = s.opacity;
    el.strokeWidth = 1;
    elements.push(el);
  }

  // Coalesce collinear diagonal edges into single bands.
  const diagEdges = graph.edges.filter(
    (e) => (e.kind === "cross-v" || e.kind === "cross-h"
        || e.kind === "cross-turn")
      && Math.hypot(e.x1 - e.x0, e.y1 - e.y0) > 0.5,
  );
  for (const merged of mergeCollinearEdges(diagEdges)) {
    const style = STYLES[merged.kind] || STYLES["cross-v"];
    const el = bandFromEdge(merged.x0, merged.y0, merged.x1, merged.y1,
      style.thick, style.stroke, style.fill);
    el.opacity = style.opacity;
    el.strokeWidth = 1;
    elements.push(el);
  }

  // Node markers — small dots so the graph topology is readable.
  const NODE_STYLES = {
    "cross-anchor": { size: 6,  fill: "#ffd166", stroke: "#7a4a00" },
    "cross-joint":  { size: 8,  fill: "#ff8f00", stroke: "#7a4a00" },
    "cross-shortcut-end": { size: 6, fill: "#7fd1c4", stroke: "#0f766e" },
    "box-diagonal-crossing": { size: 8, fill: "#9cc2ff", stroke: "#0a2e6e" },
    "box-side":     { size: 10, fill: "#1f5fd1", stroke: "#0a2e6e" },
    "box-center":   { size: 12, fill: "#0a2e6e", stroke: "#000000" },
  };
  for (const n of graph.nodes) {
    const s = NODE_STYLES[n.kind];
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

function mergeCollinearEdges(edges) {
  const PRIO = { "cross-v": 2, "cross-h": 2, "cross-turn": 1 };
  const lines = edges.map(lineFromEdge);
  const parent = edges.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (find(i) === find(j)) continue;
      // Direction must be parallel (allow opposite signs).
      const cross = lines[i].dx * lines[j].dy - lines[i].dy * lines[j].dx;
      if (Math.abs(cross) > 0.05) continue;
      // Both endpoints of edge j must lie on line i.
      if (pointOnLine(edges[j].x0, edges[j].y0, lines[i])
          && pointOnLine(edges[j].x1, edges[j].y1, lines[i])) {
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
      if ((PRIO[edges[i].kind] || 0) > (PRIO[kind] || 0)) kind = edges[i].kind;
    }
    // Project all endpoints onto the bucket's primary direction
    // (taken from the first edge — all edges in the bucket are
    // parallel within tolerance).
    const ld = lines[idxs[0]];
    const t = (px, py) => (px - ld.x) * ld.dx + (py - ld.y) * ld.dy;
    const pts = [];
    for (const i of idxs) {
      pts.push({ t: t(edges[i].x0, edges[i].y0), x: edges[i].x0, y: edges[i].y0 });
      pts.push({ t: t(edges[i].x1, edges[i].y1), x: edges[i].x1, y: edges[i].y1 });
    }
    pts.sort((a, b) => a.t - b.t);
    const a = pts[0], b = pts[pts.length - 1];
    out.push({ kind, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
  }
  return out;
}

function lineFromEdge(e) {
  const vx = e.x1 - e.x0;
  const vy = e.y1 - e.y0;
  const len = Math.hypot(vx, vy) || 1;
  return { x: e.x0, y: e.y0, dx: vx / len, dy: vy / len };
}

function pointOnLine(px, py, line) {
  const ex = px - line.x;
  const ey = py - line.y;
  const cross = ex * line.dy - ey * line.dx;
  return Math.abs(cross) <= COLINEAR_TOL;
}

// Render any edge (orthogonal or diagonal) as a rotated rectangle band.
function bandFromEdge(x0, y0, x1, y1, thick, stroke, fill) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    return rect({
      x: x0 - thick / 2, y: y0 - thick / 2,
      width: thick, height: thick,
      strokeColor: stroke, backgroundColor: fill, fillStyle: "solid",
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

function renderPlane(plane, elements) {
  const color = plane.color || { stroke: "#444", fill: "#fafafa", titleFill: "#eaeaea" };
  elements.push(rect({
    x: plane.x, y: plane.y, width: plane.width, height: plane.height,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  renderTitleTab({
    parent: plane, color, title: plane.title, fontSize: FONT.sizePlaneTitle,
    height: SIZING.planeTitleHeight, paddingX: SIZING.planePaddingX,
  }, elements);

  for (const child of plane.children) {
    if (child instanceof Subplane) renderSubplane(child, color, elements);
    else if (child instanceof Box) renderBox(child, color, elements);
  }
}

function renderSubplane(sub, planeC, elements) {
  const color = sub.color || planeC;
  elements.push(rect({
    x: sub.x, y: sub.y, width: sub.width, height: sub.height,
    strokeColor: color.stroke, backgroundColor: color.fill, fillStyle: "solid",
  }));
  // Subplane title sits inside the subplane, top-left, in border colour.
  const titleX = sub.x + SIZING.subplanePaddingX;
  const titleY = sub.y + SIZING.subplanePaddingY * 0.4;
  elements.push(text({
    x: titleX, y: titleY, width: sub.width - SIZING.subplanePaddingX * 2,
    height: SIZING.subplaneTitleHeight, value: sub.title,
    fontSize: FONT.sizeSubplaneTitle, color: color.stroke,
  }));
  for (const box of sub.boxes) renderBox(box, color, elements);
}

function renderBox(box, parentColor, elements) {
  const color = boxColor(parentColor);
  switch (box.shape) {
    case "actor":     return renderActor(box, color, elements);
    case "usecase":   return renderUsecase(box, color, elements);
    case "database":  return renderDatabase(box, color, elements);
    case "cloud":     return renderCloud(box, color, elements);
    case "interface": return renderInterface(box, color, elements);
    case "entity":    return renderEntity(box, color, elements);
    case "node":      return renderNodeShape(box, color, elements);
    case "class":     return renderClass(box, color, elements);
    case "note":      return renderNote(box, elements);
    default:          return renderRectangleShape(box, color, elements);
  }
}

function renderRectangleShape(box, color, elements) {
  elements.push(rect({
    x: box.x, y: box.y, width: box.width, height: box.height,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  renderBoxText(box, color, elements);
}

function renderBoxText(box, color, elements, { titleColor } = {}) {
  const tx = box.x + SIZING.boxPaddingX;
  const ty = box.y + SIZING.boxPaddingY;
  const titleLines = String(box.title || "").split("\n").length;
  const titleHeight = FONT.sizeTitle * FONT.lineHeight * titleLines;
  if (box.stereotype) {
    elements.push(text({
      x: tx, y: ty - 4,
      width: box.width - SIZING.boxPaddingX * 2,
      height: FONT.sizeDescription * FONT.lineHeight,
      value: `«${box.stereotype}»`,
      fontSize: FONT.sizeDescription,
      color: color.stroke, align: "center",
    }));
  }
  elements.push(text({
    x: tx, y: ty + (box.stereotype ? FONT.sizeDescription * FONT.lineHeight : 0),
    width: box.width - SIZING.boxPaddingX * 2,
    height: titleHeight,
    value: box.title, fontSize: FONT.sizeTitle,
    color: titleColor || color.stroke, align: "center",
  }));
  if (box.description) {
    elements.push(text({
      x: tx,
      y: ty + titleHeight + (box.stereotype ? FONT.sizeDescription * FONT.lineHeight : 0) + SIZING.boxTitleGap,
      width: box.width - SIZING.boxPaddingX * 2,
      height: box.height - SIZING.boxPaddingY * 2 - titleHeight,
      value: box.description, fontSize: FONT.sizeDescription, color: "#444",
    }));
  }
}

// --- Actor (stickman) ---------------------------------------------------
function renderActor(box, color, elements) {
  // Stickman occupies upper portion; label below.
  const cx = box.x + box.width / 2;
  const top = box.y + 4;
  const headD = Math.min(28, box.height * 0.32);
  const bodyTop = top + headD;
  const bodyBottom = top + box.height * 0.7;
  elements.push(ellipse({
    x: cx - headD / 2, y: top, width: headD, height: headD,
    strokeColor: color.stroke, backgroundColor: "#ffffff",
  }));
  // Body
  elements.push(line({
    points: [{ x: cx, y: bodyTop }, { x: cx, y: bodyBottom }],
    strokeColor: color.stroke,
  }));
  // Arms
  const armY = bodyTop + (bodyBottom - bodyTop) * 0.25;
  const armR = Math.min(22, box.width * 0.35);
  elements.push(line({
    points: [{ x: cx - armR, y: armY }, { x: cx + armR, y: armY }],
    strokeColor: color.stroke,
  }));
  // Legs
  const legR = Math.min(18, box.width * 0.3);
  elements.push(line({
    points: [{ x: cx, y: bodyBottom }, { x: cx - legR, y: bodyBottom + 18 }],
    strokeColor: color.stroke,
  }));
  elements.push(line({
    points: [{ x: cx, y: bodyBottom }, { x: cx + legR, y: bodyBottom + 18 }],
    strokeColor: color.stroke,
  }));
  // Label below the stickman
  const labelY = bodyBottom + 22;
  const titleLines = String(box.title || "").split("\n").length;
  elements.push(text({
    x: box.x, y: labelY,
    width: box.width, height: FONT.sizeTitle * FONT.lineHeight * titleLines,
    value: box.title, fontSize: FONT.sizeTitle, color: color.stroke,
    align: "center",
  }));
}

// --- Use case (ellipse) -------------------------------------------------
function renderUsecase(box, color, elements) {
  elements.push(ellipse({
    x: box.x, y: box.y, width: box.width, height: box.height,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  const titleLines = String(box.title || "").split("\n").length;
  const th = FONT.sizeTitle * FONT.lineHeight * titleLines;
  elements.push(text({
    x: box.x + SIZING.boxPaddingX,
    y: box.y + (box.height - th) / 2,
    width: box.width - SIZING.boxPaddingX * 2,
    height: th,
    value: box.title, fontSize: FONT.sizeTitle,
    color: color.stroke, align: "center",
  }));
}

// --- Database (cylinder approximation) ----------------------------------
function renderDatabase(box, color, elements) {
  const lipH = Math.min(18, box.height * 0.18);
  // Body rect
  elements.push(rect({
    x: box.x, y: box.y + lipH / 2,
    width: box.width, height: box.height - lipH,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  // Top ellipse (lid)
  elements.push(ellipse({
    x: box.x, y: box.y, width: box.width, height: lipH,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  // Bottom ellipse (base) — only the front half is actually visible but
  // Excalidraw draws full ellipses; this still reads as a cylinder.
  elements.push(ellipse({
    x: box.x, y: box.y + box.height - lipH,
    width: box.width, height: lipH,
    strokeColor: color.stroke, backgroundColor: "transparent",
    fillStyle: "hachure",
  }));
  renderBoxText({ ...box, y: box.y + lipH }, color, elements);
}

// --- Cloud ---------------------------------------------------------------
function renderCloud(box, color, elements) {
  // Approximation: large ellipse with two smaller ones for puffy look.
  elements.push(ellipse({
    x: box.x, y: box.y + box.height * 0.12,
    width: box.width, height: box.height * 0.85,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  const puff = Math.min(box.width, box.height) * 0.35;
  elements.push(ellipse({
    x: box.x + box.width * 0.15, y: box.y,
    width: puff, height: puff,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  elements.push(ellipse({
    x: box.x + box.width * 0.55, y: box.y + 4,
    width: puff, height: puff,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  renderBoxText(box, color, elements);
}

// --- Interface (small filled circle, lollipop-style) --------------------
function renderInterface(box, color, elements) {
  const d = Math.min(box.width, box.height) * 0.55;
  const cx = box.x + box.width / 2;
  const cy = box.y + d / 2 + 4;
  elements.push(ellipse({
    x: cx - d / 2, y: cy - d / 2, width: d, height: d,
    strokeColor: color.stroke, backgroundColor: "#ffffff",
  }));
  const labelY = cy + d / 2 + 6;
  const titleLines = String(box.title || "").split("\n").length;
  elements.push(text({
    x: box.x, y: labelY,
    width: box.width, height: FONT.sizeTitle * FONT.lineHeight * titleLines,
    value: box.title, fontSize: FONT.sizeTitle, color: color.stroke,
    align: "center",
  }));
}

// --- Entity (rectangle + horizontal line below title) -------------------
function renderEntity(box, color, elements) {
  elements.push(rect({
    x: box.x, y: box.y, width: box.width, height: box.height,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  renderBoxText(box, color, elements);
}

// --- Node (3-D box) ------------------------------------------------------
function renderNodeShape(box, color, elements) {
  const off = 8;
  // Back rectangle (offset)
  elements.push(rect({
    x: box.x + off, y: box.y - off,
    width: box.width - off, height: box.height - off,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  // Front rectangle
  elements.push(rect({
    x: box.x, y: box.y, width: box.width - off, height: box.height - off,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  renderBoxText({ ...box, width: box.width - off, height: box.height - off }, color, elements);
}

// --- Class (rectangle with member compartment) --------------------------
function renderClass(box, color, elements) {
  elements.push(rect({
    x: box.x, y: box.y, width: box.width, height: box.height,
    strokeColor: color.stroke, backgroundColor: color.fill,
  }));
  const titleLines = String(box.title || "").split("\n").length;
  const titleH = FONT.sizeTitle * FONT.lineHeight * titleLines;
  const ty = box.y + SIZING.boxPaddingY;
  elements.push(text({
    x: box.x, y: ty,
    width: box.width, height: titleH,
    value: box.title, fontSize: FONT.sizeTitle,
    color: color.stroke, align: "center",
  }));
  if (box.members && box.members.length) {
    const sepY = ty + titleH + 4;
    elements.push(line({
      points: [{ x: box.x, y: sepY }, { x: box.x + box.width, y: sepY }],
      strokeColor: color.stroke, strokeWidth: 1,
    }));
    elements.push(text({
      x: box.x + SIZING.boxPaddingX, y: sepY + 4,
      width: box.width - SIZING.boxPaddingX * 2,
      height: box.members.length * FONT.sizeDescription * FONT.lineHeight,
      value: box.members.join("\n"),
      fontSize: FONT.sizeDescription, color: "#222", align: "left",
    }));
  }
}

// --- Note (yellow sticky) ----------------------------------------------
function renderNote(box, elements) {
  const NOTE_FILL = "#fff5b1";
  const NOTE_STROKE = "#a07b00";
  elements.push(rect({
    x: box.x, y: box.y, width: box.width, height: box.height,
    strokeColor: NOTE_STROKE, backgroundColor: NOTE_FILL,
  }));
  // Folded corner triangle (fake — just a small line).
  const fold = 12;
  elements.push(line({
    points: [
      { x: box.x + box.width - fold, y: box.y },
      { x: box.x + box.width - fold, y: box.y + fold },
      { x: box.x + box.width, y: box.y + fold },
    ],
    strokeColor: NOTE_STROKE, strokeWidth: 1,
  }));
  const text_value = box.description || box.title;
  elements.push(text({
    x: box.x + SIZING.boxPaddingX,
    y: box.y + SIZING.boxPaddingY,
    width: box.width - SIZING.boxPaddingX * 2,
    height: box.height - SIZING.boxPaddingY * 2,
    value: text_value, fontSize: FONT.sizeDescription, color: "#000",
  }));
}

function renderEdgeLabel(conn) {
  const path = conn.path;
  if (!path || path.length < 2) return null;
  // Place at middle-segment midpoint.
  const midIdx = Math.floor((path.length - 1) / 2);
  const a = path[midIdx];
  const b = path[midIdx + 1];
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const lines = String(conn.label).split("\n");
  const w = Math.max(40, Math.max(...lines.map((l) => l.length)) * FONT.sizeDescription * FONT.glyphRatio + 12);
  const h = lines.length * FONT.sizeDescription * FONT.lineHeight;
  return text({
    x: cx - w / 2, y: cy - h - 4,
    width: w, height: h,
    value: conn.label, fontSize: FONT.sizeDescription,
    color: "#222", align: "center",
  });
}

function renderTitleTab({ parent, color, title, fontSize, height, paddingX }, elements) {
  const padX = 14;
  const w = Math.min(parent.width - paddingX * 2, Math.max(120, title.length * fontSize * FONT.glyphRatio + padX * 2));
  const x = parent.x + paddingX;
  const y = parent.y + 8;
  elements.push(rect({
    x, y, width: w, height,
    strokeColor: color.stroke, backgroundColor: color.titleFill,
  }));
  elements.push(text({
    x: x + padX, y: y + (height - fontSize * FONT.lineHeight) / 2,
    width: w - padX * 2, height: fontSize * FONT.lineHeight,
    value: title, fontSize, color: color.stroke, align: "left", vAlign: "middle",
  }));
}
