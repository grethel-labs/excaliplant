/**
 * @module render
 *
 * Emits Excalidraw JSON. Each model shape is dispatched to a
 * dedicated `renderXxx()` function that produces one or more
 * Excalidraw primitive elements (rectangle, ellipse, line, arrow,
 * text). The output document is a stand-alone `.excalidraw` file
 * that any Excalidraw front-end can open. The companion module
 * `src/general/render/svg.mjs` converts the same JSON to SVG for the
 * build-time documentation pipeline.
 */

// Excalidraw export.
//
// Emits plain rectangle / text / arrow elements. Arrows use roughness 0
// and roundness null so the output stays exactly orthogonal — no wobble,
// no Excalidraw-internal version-specific arrow fields.

import { Box, Plane, Subplane, SequenceDiagram } from "../model/diagram.mjs";
import {
  FONT,
  measureSmartFitted,
  measureSmartWrapped,
  measureWrapped,
  isOperationMember,
} from "../style/text.mjs";
import { getStyle } from "../style/style.mjs";
import { SIZING } from "../layout/sizing.mjs";
import { boxColor, planeColor } from "../style/colors.mjs";
import { EXCALIDRAW_SCHEMA, ROUNDNESS } from "./schema.mjs";
import { createSeededRng, stableHash32 } from "./rng.mjs";

import { exportSequenceDiagram } from "../../diagrams/sequence/render_excalidraw.mjs";

/**
 * @typedef {{x:number,y:number}} Pt 2-D point in absolute pixels.
 * @typedef {Object} LabelLayoutItem
 *   Internal placement model for both edge and endpoint labels.
 * @property {string} id
 * @property {'edge'|'endpoint'} kind
 * @property {string} connectionId
 * @property {'start'|'end'|null} [endpoint]
 * @property {string} text
 * @property {number} centerX
 * @property {number} centerY
 * @property {number} normalX
 * @property {number} normalY
 * @property {number} angle
 * @property {number} padX
 * @property {number} padY
 * @property {string} strokeColor
 * @property {string} backgroundColor
 * @property {string} textColor
 * @property {number} minGap
 * @property {number} minFontSize
 * @property {number} fontSize
 * @property {number} maxTextWidth
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {number} measuredWidth
 * @property {number} measuredHeight
 * @property {number} minInnerTextWidth
 * @property {number} fittedFontSize
 * @property {string[]} lines
 * @property {boolean} avoidedOverlap
 * @property {string} roleChip
 * @property {string} roleText
 * @property {string} lineColor
 * @property {string} link
 * @property {string} tooltip
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
/** @type {number} */
const EDGE_LABEL_MAX_SHRINK_PASSES = 12;
/** @type {number} */
const EDGE_LABEL_MAX_SHIFT_PASSES = 24;
const RAND_RANGE = 2_000_000_000;
const newId = () => {
  const r = Math.floor(_rng() * 0xffffffff).toString(36);
  return `el_${(_idCounter++).toString(36)}_${r.slice(0, 6).padStart(6, "0")}`;
};
const DEFAULT_GRAPH_STYLE = {
  backgroundColor: "",
  boxBackgroundColor: "",
  boxBorderColor: "",
  boxFontColor: "",
  arrowColor: "",
  edgeFontColor: "",
  noteBackgroundColor: "",
  noteBorderColor: "",
  noteFontColor: "",
  containerBackgroundColor: "",
  containerBorderColor: "",
  containerFontColor: "",
};
/** @type {typeof DEFAULT_GRAPH_STYLE} */
let _activeGraphStyle = { ...DEFAULT_GRAPH_STYLE };

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
 *   from `src/general/layout/elk_layout.mjs`.
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
  _activeGraphStyle = resolveGraphStyle(diagram.style);
  const elements = /** @type {ExcalElement[]} */ ([]);
  const labelLayouts = /** @type {LabelLayoutItem[]} */ ([]);

  if (debugCorridors) renderDebugCorridors(diagram, elements);

  for (const plane of diagram.planes) renderPlane(plane, elements);
  for (const conn of diagram.connections) {
    // NB: pass `startArrowhead` / `endArrowhead` through verbatim. Using
    // `?? "arrow"` here would clobber the `null` that classifyArrow()
    // sets for composition / aggregation (where the arrow head only
    // sits on one side: the diamond at the source, no head at the
    // target). The Connection model already defaults to the right
    // values when the operator does not specify them.
    //
    // Stroke colour matches the source box's outline colour, so each
    // arrow is visually anchored to the box it originates from. The
    // helper mirrors the colour-resolution rules used by renderPlane /
    // renderSubplane / renderBox so the colour is always identical to
    // what the box itself paints.
    const strokeColor = connectionStrokeColor(conn);
    const a = arrow({
      points: conn.path,
      strokeColor,
      dashed: conn.dashed,
      startArrowhead: conn.startArrowhead ?? null,
      endArrowhead: conn.endArrowhead === undefined ? "arrow" : conn.endArrowhead,
    });
    if (a) {
      a.customData = { role: "connectionArrow", connectionId: conn.id };
      elements.push(a);
    }
    if (conn.label) {
      const labelItem = collectEdgeLabelLayout(conn);
      if (labelItem) labelLayouts.push(labelItem);
    }
    for (const endpointLabel of collectConnectionEndpointLabelLayouts(conn)) {
      labelLayouts.push(endpointLabel);
    }
  }
  if (labelLayouts.length) {
    layoutGraphLabels(labelLayouts);
    for (const label of labelLayouts) {
      elements.push(...renderLabelLayoutElements(label));
    }
  }
  renderGraphPresentation(diagram, elements);

  const appState = {
    viewBackgroundColor: _activeGraphStyle.backgroundColor || "#ffffff",
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
 * @param {Partial<typeof DEFAULT_GRAPH_STYLE>|undefined} style Parsed graph style.
 * @returns {typeof DEFAULT_GRAPH_STYLE} Renderer-safe per-call style object.
 */
function resolveGraphStyle(style) {
  return { ...DEFAULT_GRAPH_STYLE, ...(style || {}) };
}

/**
 * @param {ColorTriple} color Base colour triple.
 * @returns {ColorTriple} Colour triple with graph container overrides applied.
 */
function applyContainerStyle(color) {
  return {
    stroke: _activeGraphStyle.containerBorderColor || color.stroke,
    fill: _activeGraphStyle.containerBackgroundColor || color.fill,
    titleFill: _activeGraphStyle.containerBackgroundColor || color.titleFill,
  };
}

/**
 * @param {ColorTriple} color Base colour triple.
 * @param {Box} box Box being rendered.
 * @returns {ColorTriple} Colour triple with graph box overrides applied.
 */
function applyBoxStyle(color, box) {
  if (classTypeKey(box)) return color;
  return {
    stroke: _activeGraphStyle.boxBorderColor || color.stroke,
    fill: _activeGraphStyle.boxBackgroundColor || color.fill,
    titleFill: _activeGraphStyle.boxBackgroundColor || color.titleFill,
  };
}

const PRESENTATION_MARGIN = 24;
const PRESENTATION_GAP = 10;
const PRESENTATION_MIN_WIDTH = 360;

/**
 * Render top-level PlantUML presentation metadata around a laid-out graph.
 * Geometry is derived from emitted elements so this does not perturb ELK's
 * routing contract for boxes and connections.
 *
 * @param {import("../model/diagram.mjs").Diagram} diagram Diagram metadata.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderGraphPresentation(diagram, elements) {
  const presentation = {
    title: String(diagram.title || ""),
    caption: String(diagram.caption || ""),
    header: String(diagram.header || ""),
    footer: String(diagram.footer || ""),
    legend: String(diagram.legend || ""),
    mainframe: String(diagram.mainframe || ""),
  };
  if (!Object.values(presentation).some(Boolean)) return;

  const bounds = elementBounds(elements) ?? { minX: 20, minY: 60, maxX: 620, maxY: 220 };
  const width = Math.max(PRESENTATION_MIN_WIDTH, bounds.maxX - bounds.minX);
  const left = bounds.minX;
  let topY = bounds.minY - PRESENTATION_MARGIN;

  if (presentation.title) {
    const titleHeight = blockHeight(presentation.title, FONT.sizePlaneTitle);
    topY -= titleHeight;
    const title = text({
      x: left,
      y: topY,
      width,
      height: titleHeight,
      value: presentation.title,
      fontSize: FONT.sizePlaneTitle,
      color: "#1f2933",
      align: "center",
    });
    title.customData = { role: "diagramTitle" };
    elements.push(title);
    topY -= PRESENTATION_GAP;
  }

  if (presentation.header) {
    const headerHeight = blockHeight(presentation.header, FONT.sizeDescription);
    topY -= headerHeight;
    const header = text({
      x: left,
      y: topY,
      width,
      height: headerHeight,
      value: presentation.header,
      fontSize: FONT.sizeDescription,
      color: "#475569",
      align: "center",
    });
    header.customData = { role: "diagramHeader" };
    elements.push(header);
  }

  let bottomY = bounds.maxY + PRESENTATION_MARGIN;
  if (presentation.caption) {
    const captionHeight = blockHeight(presentation.caption, FONT.sizeDescription);
    const caption = text({
      x: left,
      y: bottomY,
      width,
      height: captionHeight,
      value: presentation.caption,
      fontSize: FONT.sizeDescription,
      color: "#475569",
      align: "center",
    });
    caption.customData = { role: "diagramCaption" };
    elements.push(caption);
    bottomY += captionHeight + PRESENTATION_GAP;
  }

  if (presentation.footer) {
    const footerHeight = blockHeight(presentation.footer, FONT.sizeDescription);
    const footer = text({
      x: left,
      y: bottomY,
      width,
      height: footerHeight,
      value: presentation.footer,
      fontSize: FONT.sizeDescription,
      color: "#475569",
      align: "center",
    });
    footer.customData = { role: "diagramFooter" };
    elements.push(footer);
    bottomY += footerHeight + PRESENTATION_GAP;
  }

  if (presentation.legend) {
    const legendMeasure = measureWrapped(presentation.legend, FONT.sizeDescription, width);
    const legendWidth = Math.min(width, Math.max(180, legendMeasure.width + 28));
    const legendHeight = blockHeight(presentation.legend, FONT.sizeDescription) + 20;
    const legendX = left + width - legendWidth;
    elements.push(
      rect({
        x: legendX,
        y: bottomY,
        width: legendWidth,
        height: legendHeight,
        strokeColor: "#94a3b8",
        backgroundColor: "#ffffff",
      }),
    );
    const legendText = text({
      x: legendX + 12,
      y: bottomY + 10,
      width: legendWidth - 24,
      height: legendHeight - 20,
      value: presentation.legend,
      fontSize: FONT.sizeDescription,
      color: "#334155",
    });
    legendText.customData = { role: "diagramLegend" };
    elements.push(legendText);
    bottomY += legendHeight;
  }

  if (presentation.mainframe) {
    const allBounds = elementBounds(elements) ?? bounds;
    const frame = rect({
      x: allBounds.minX - 12,
      y: allBounds.minY - 12,
      width: allBounds.maxX - allBounds.minX + 24,
      height: allBounds.maxY - allBounds.minY + 24,
      strokeColor: "#64748b",
      backgroundColor: "transparent",
    });
    frame.customData = { role: "diagramMainframe" };
    elements.push(frame);
    const label = text({
      x: allBounds.minX,
      y: allBounds.minY - 8,
      width: Math.max(
        80,
        measureWrapped(
          presentation.mainframe,
          FONT.sizeDescription,
          allBounds.maxX - allBounds.minX,
        ).width + 16,
      ),
      height: FONT.sizeDescription * FONT.lineHeight,
      value: presentation.mainframe,
      fontSize: FONT.sizeDescription,
      color: "#475569",
    });
    label.customData = { role: "diagramMainframeLabel" };
    elements.push(label);
  }
}

/**
 * @param {ExcalElement[]} elements
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null}
 */
function elementBounds(elements) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const x = Number(el.x);
    const y = Number(el.y);
    const width = Number(el.width);
    const height = Number(el.height);
    if (![x, y, width, height].every(Number.isFinite)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * @param {string} value
 * @param {number} fontSize
 * @returns {number}
 */
function blockHeight(value, fontSize) {
  const lines = String(value || "").split("\n").length;
  return lines * fontSize * FONT.lineHeight;
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
 *
 * The synthetic `"__floating__"` plane (created by the parser to hold
 * top-level boxes that were never enclosed in an explicit
 * `package`/`namespace`) is rendered transparently: its frame and
 * title tab are skipped so it does not appear as an all-encompassing
 * container on the canvas. Each direct child box receives its own
 * deterministic colour triple (derived from the box id) so individual
 * top-level types stay visually distinguishable.
 *
 * @param {Plane} plane Plane to draw.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderPlane(plane, elements) {
  const color = applyContainerStyle(
    plane.color || { stroke: "#444", fill: "#fafafa", titleFill: "#eaeaea" },
  );
  const isFloating = plane.id === "__floating__";

  if (!isFloating) {
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
  }

  for (const child of plane.children) {
    // Floating-plane direct children get their own per-box colour so
    // top-level classes / interfaces / enums are visually distinct.
    const childColor = isFloating && child instanceof Box ? planeColor(child.id) : color;
    if (child instanceof Subplane) renderSubplane(child, color, elements);
    else if (child instanceof Box) renderBox(child, childColor, elements);
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
  const color = applyContainerStyle(sub.color || planeC);
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
      color: _activeGraphStyle.containerFontColor || color.stroke,
    }),
  );
  for (const box of sub.boxes) renderBox(box, color, elements);
}

/**
 * Resolve the stroke (border) colour of a {@link Box}, mirroring the
 * colour-resolution rules used by {@link renderPlane} /
 * {@link renderSubplane} / {@link renderBox}. Used by the connection
 * loop so each arrow shares its source box's outline colour.
 * @param {Box} box Source box of a connection.
 * @returns {string} `#RRGGBB` stroke colour for the box outline.
 */
function boxStrokeColor(box) {
  const plane = box.plane;
  /** @type {ColorTriple} */
  let parentColor;
  if (box.parent instanceof Subplane) {
    const sub = box.parent;
    parentColor = sub.color ||
      plane?.color || { stroke: "#444", fill: "#fafafa", titleFill: "#eaeaea" };
  } else if (plane?.id === "__floating__") {
    parentColor = planeColor(box.id);
  } else {
    parentColor = plane?.color || { stroke: "#444", fill: "#fafafa", titleFill: "#eaeaea" };
  }
  return boxRenderColor(box, parentColor).stroke;
}

/**
 * Render a single {@link Box}; dispatches to a per-shape helper.
 * @param {Box} box Box to draw.
 * @param {ColorTriple} parentColor Owning plane/subplane colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderBox(box, parentColor, elements) {
  const color = boxRenderColor(box, parentColor);
  switch (box.shape) {
    case "actor":
      renderActor(box, color, elements);
      break;
    case "usecase":
      renderUsecase(box, color, elements);
      break;
    case "database":
    case "queue":
      renderDatabase(box, color, elements);
      break;
    case "cloud":
      renderCloud(box, color, elements);
      break;
    case "interface":
      // An interface declaration with member content is part of a UML
      // class diagram, so render it as a two-compartment class box
      // rather than the standalone "lollipop" interface symbol.
      if ((box.members && box.members.length) || box.stereotype) {
        renderClass(box, color, elements);
        break;
      }
      renderInterface(box, color, elements);
      break;
    case "entity":
      renderEntity(box, color, elements);
      break;
    case "node":
      renderNodeShape(box, color, elements);
      break;
    case "class":
    case "object":
    case "map":
      renderClass(box, color, elements);
      break;
    case "enum":
      renderClass(box, color, elements);
      break;
    case "diamond":
      renderDiamondShape(box, color, elements);
      break;
    case "note":
      renderNote(box, elements);
      break;
    case "state":
      renderStateShape(box, color, elements);
      break;
    case "start":
    case "end":
      renderStartEndShape(box, color, elements);
      break;
    case "choice":
      renderChoiceShape(box, color, elements);
      break;
    case "fork":
    case "join":
      renderForkJoinShape(box, color, elements);
      break;
    case "history":
    case "history_deep":
      renderHistoryShape(box, color, elements);
      break;
    default:
      renderRectangleShape(box, color, elements);
      break;
  }
  renderBoxPorts(box, color, elements);
}

/**
 * Render component/class ports as small side markers.
 * @param {Box} box Box whose ports are rendered.
 * @param {ColorTriple} color Colour triple.
 * @param {ExcalElement[]} elements Excalidraw element list.
 * @returns {void}
 */
function renderBoxPorts(box, color, elements) {
  const size = 10;
  /** @type {Array<"top"|"right"|"bottom"|"left">} */
  const sides = ["top", "right", "bottom", "left"];
  for (const side of sides) {
    const ports = box.ports?.[side] || [];
    for (let index = 0; index < ports.length; index++) {
      const port = ports[index];
      const t = (index + 1) / (ports.length + 1);
      let x = box.x;
      let y = box.y;
      if (side === "top") {
        x = box.x + box.width * t - size / 2;
        y = box.y - size / 2;
      } else if (side === "right") {
        x = box.x + box.width - size / 2;
        y = box.y + box.height * t - size / 2;
      } else if (side === "bottom") {
        x = box.x + box.width * t - size / 2;
        y = box.y + box.height - size / 2;
      } else {
        x = box.x - size / 2;
        y = box.y + box.height * t - size / 2;
      }
      const marker = rect({
        x,
        y,
        width: size,
        height: size,
        strokeColor: color.stroke,
        backgroundColor: "#ffffff",
      });
      marker.roughness = 0;
      marker.roundness = null;
      marker.strokeWidth = 1.5;
      marker.customData = {
        role: "boxPort",
        boxId: box.id,
        portId: port.id,
        side,
        direction: port.direction || "port",
      };
      elements.push(marker);
    }
  }
}

/**
 * Resolve the final colour triple for a box, including optional UML
 * class-diagram type colouring.
 * @param {Box} box Box to colour.
 * @param {ColorTriple} parentColor Owning plane/subplane colour triple.
 * @returns {ColorTriple} Final box colour triple.
 */
function boxRenderColor(box, parentColor) {
  const color = boxColor(parentColor);
  const classColor = classTypeColor(box, color);
  return applyBoxStyle(classColor || color, box);
}

/**
 * @param {import("../model/diagram.mjs").Connection} conn Connection to colour.
 * @returns {string} Stroke colour for the connection.
 */
function connectionStrokeColor(conn) {
  if (classTypeKey(conn.from) || classTypeKey(conn.to)) return boxStrokeColor(conn.from);
  return _activeGraphStyle.arrowColor || boxStrokeColor(conn.from);
}

/**
 * @param {Box} box Box to classify.
 * @returns {"class"|"abstract"|"interface"|"enum"|""} UML class-box type key.
 */
function classTypeKey(box) {
  if (box.shape === "interface") return "interface";
  if (box.shape === "enum") return "enum";
  if (box.shape === "class") {
    const stereotype = String(box.stereotype || "").toLowerCase();
    return stereotype.includes("abstract") ? "abstract" : "class";
  }
  return "";
}

/**
 * @param {Box} box Box to colour.
 * @param {ColorTriple} fallback Fallback colour triple.
 * @returns {ColorTriple|null} Type-specific colour, or null when disabled/not applicable.
 */
function classTypeColor(box, fallback) {
  const style = /** @type {any} */ (getStyle()).classDiagram || {};
  if (style.colorByType !== true) return null;
  const key = classTypeKey(box);
  if (!key) return null;
  const configured = style.typeColors?.[key];
  if (!configured || typeof configured !== "object") return fallback;
  return {
    stroke: typeof configured.stroke === "string" ? configured.stroke : fallback.stroke,
    fill: typeof configured.fill === "string" ? configured.fill : fallback.fill,
    titleFill: typeof configured.titleFill === "string" ? configured.titleFill : fallback.titleFill,
  };
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
 * Render a PlantUML object-diagram diamond node.
 * @param {Box} box Box to draw.
 * @param {ColorTriple} color Colour triple to apply.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderDiamondShape(box, color, elements) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const outline = line({
    points: [
      { x: cx, y: box.y },
      { x: box.x + box.width, y: cy },
      { x: cx, y: box.y + box.height },
      { x: box.x, y: cy },
      { x: cx, y: box.y },
    ],
    strokeColor: color.stroke,
  });
  outline.customData = { role: "diamondShape", boxId: box.id };
  elements.push(outline);
  renderDiamondText(box, color, elements);
}

/**
 * Render text in the central band of a diamond. Rectangular box padding
 * would place text into the narrowing top/bottom corners, where it can
 * visually cross the diagonal edges even though it fits the bounding box.
 * @param {Box} box Box being drawn.
 * @param {ColorTriple} color Colour triple supplying the text colour.
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderDiamondText(box, color, elements) {
  const textWidth = Math.max(40, Math.floor(box.width * 0.46));
  const cx = box.x + box.width / 2;
  const titleValue = box._wrappedTitle ?? String(box.title || "");
  const titleFontSize = box._wrappedTitleFontSize ?? FONT.sizeTitle;
  const titleHeight = titleValue.split("\n").length * titleFontSize * FONT.lineHeight;
  const stereotypeValue = box.stereotype ? `«${box.stereotype}»` : "";
  const stereotypeHeight = stereotypeValue ? FONT.sizeDescription * FONT.lineHeight : 0;
  const gap = stereotypeValue ? 2 : 0;
  const blockHeight = stereotypeHeight + gap + titleHeight;
  const top = box.y + (box.height - blockHeight) / 2;
  const x = cx - textWidth / 2;

  if (stereotypeValue) {
    const stereotype = text({
      x,
      y: top,
      width: textWidth,
      height: stereotypeHeight,
      value: stereotypeValue,
      fontSize: FONT.sizeDescription,
      color: _activeGraphStyle.boxFontColor || color.stroke,
      align: "center",
      vAlign: "middle",
    });
    stereotype.customData = { role: "diamondStereotypeText", boxId: box.id };
    elements.push(stereotype);
  }

  const title = applyLinkMetadata(
    text({
      x,
      y: top + stereotypeHeight + gap,
      width: textWidth,
      height: titleHeight,
      value: titleValue,
      fontSize: titleFontSize,
      color: _activeGraphStyle.boxFontColor || color.stroke,
      align: "center",
      vAlign: "middle",
    }),
    box,
  );
  title.customData = {
    ...(title.customData || {}),
    role: "diamondTitleText",
    boxId: box.id,
  };
  elements.push(title);
}

/**
 * Render title text in a central band for ellipse-like shapes.
 * The text width is reduced from full box width to avoid visual overflow
 * into curved edges when wrapped labels are long.
 * @param {{box: Box, color: ColorTriple, elements: ExcalElement[], ratio: number, role: string}} opts
 */
function renderCurvedTextBoxTitle({ box, color, elements, ratio, role }) {
  const textWidth = Math.max(40, Math.floor(box.width * (ratio ?? 0.7)));
  const titleValue = box._wrappedTitle ?? String(box.title || "");
  const titleFontSize = box._wrappedTitleFontSize ?? FONT.sizeTitle;
  const titleHeight = titleValue.split("\n").length * titleFontSize * FONT.lineHeight;
  const title = applyLinkMetadata(
    text({
      x: box.x + (box.width - textWidth) / 2,
      y: box.y + (box.height - titleHeight) / 2,
      width: textWidth,
      height: titleHeight,
      value: titleValue,
      fontSize: titleFontSize,
      color: _activeGraphStyle.boxFontColor || color.stroke,
      align: "center",
      vAlign: "middle",
    }),
    box,
  );
  if (role) {
    title.customData = {
      ...(title.customData || {}),
      role,
      boxId: box.id,
    };
  }
  elements.push(title);
}

/**
 * Render a UML state shape (rounded rectangle with optional compartments).
 * @param {Box} box Box (shape == `state`).
 * @param {{ stroke: string, fill: string, titleFill: string }} color
 * @param {ExcalElement[]} elements
 * @internal
 */
function renderStateShape(box, color, elements) {
  // State is rendered as a rounded rectangle
  const r = rect({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    strokeColor: color.stroke,
    backgroundColor: color.fill,
  });
  r.roundness = { type: ROUNDNESS.proportional, value: 0.2 };
  elements.push(r);
  renderBoxText(box, color, elements);
  if (box.members && box.members.length) {
    const titleValue = box._wrappedTitle ?? String(box.title || "");
    const titleFontSize = box._wrappedTitleFontSize ?? FONT.sizeTitle;
    const titleHeight = titleValue.split("\n").length * titleFontSize * FONT.lineHeight;
    const stereotypeHeight = box.stereotype ? FONT.sizeDescription * FONT.lineHeight : 0;
    const sepY =
      box.y + SIZING.boxPaddingY + stereotypeHeight + titleHeight + SIZING.classCompartmentGap;
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
    const memberLines = (
      box._wrappedMembers ?? box.members.map((member) => [String(member)])
    ).flat();
    elements.push(
      text({
        x: box.x + SIZING.boxPaddingX,
        y: sepY + SIZING.classCompartmentGap,
        width: box.width - SIZING.boxPaddingX * 2,
        height: memberLines.length * FONT.sizeDescription * FONT.lineHeight,
        value: memberLines.join("\n"),
        fontSize: FONT.sizeDescription,
        color: _activeGraphStyle.boxFontColor || "#222",
        align: "left",
      }),
    );
  }
}

/**
 * Render start/end pseudostate (filled circle for start, bullseye for end).
 * @param {Box} box Box (shape == `start` or `end`).
 * @param {{ stroke: string, fill: string }} color
 * @param {object[]} elements
 * @internal
 */
function renderStartEndShape(box, color, elements) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) / 2 - 2;

  if (box.shape === "start") {
    // Start state: filled black circle
    elements.push(
      ellipse({
        x: cx - radius,
        y: cy - radius,
        width: radius * 2,
        height: radius * 2,
        strokeColor: color.stroke,
        backgroundColor: "#000000",
      }),
    );
  } else {
    // End state: bullseye (outer circle + inner filled circle)
    elements.push(
      ellipse({
        x: cx - radius,
        y: cy - radius,
        width: radius * 2,
        height: radius * 2,
        strokeColor: color.stroke,
        backgroundColor: "#ffffff",
      }),
    );
    const innerRadius = radius * 0.5;
    elements.push(
      ellipse({
        x: cx - innerRadius,
        y: cy - innerRadius,
        width: innerRadius * 2,
        height: innerRadius * 2,
        strokeColor: color.stroke,
        backgroundColor: "#000000",
      }),
    );
  }
}

/**
 * Render choice pseudostate (small diamond).
 * @param {Box} box Box (shape == `choice`).
 * @param {{ stroke: string, fill: string }} color
 * @param {object[]} elements
 * @internal
 */
function renderChoiceShape(box, color, elements) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const size = Math.min(box.width, box.height) / 2 - 2;

  elements.push(
    line({
      points: [
        { x: cx, y: cy - size },
        { x: cx + size, y: cy },
        { x: cx, y: cy + size },
        { x: cx - size, y: cy },
        { x: cx, y: cy - size },
      ],
      strokeColor: color.stroke,
    }),
  );
}

/**
 * Render fork/join pseudostate (horizontal or vertical bar).
 * @param {Box} box Box (shape == `fork` or `join`).
 * @param {{ stroke: string, fill: string }} color
 * @param {object[]} elements
 * @internal
 */
function renderForkJoinShape(box, color, elements) {
  // Fork/join are rendered as thick bars
  const r = rect({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    strokeColor: color.stroke,
    backgroundColor: "#000000",
  });
  r.strokeWidth = 3;
  elements.push(r);
}

/**
 * Render history pseudostate (circle with H).
 * @param {Box} box Box (shape == `history` or `history_deep`).
 * @param {{ stroke: string, fill: string }} color
 * @param {object[]} elements
 * @internal
 */
function renderHistoryShape(box, color, elements) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) / 2 - 2;

  // Outer circle
  elements.push(
    ellipse({
      x: cx - radius,
      y: cy - radius,
      width: radius * 2,
      height: radius * 2,
      strokeColor: color.stroke,
      backgroundColor: "#ffffff",
    }),
  );

  // H or H* text
  const label = box.shape === "history_deep" ? "H*" : "H";
  elements.push(
    text({
      x: box.x + 4,
      y: box.y + 4,
      width: box.width - 8,
      height: box.height - 8,
      value: label,
      fontSize: FONT.sizeDescription,
      color: color.stroke,
      align: "center",
    }),
  );
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
  const titleFontSize = box._wrappedTitleFontSize ?? FONT.sizeTitle;
  const titleLines = titleValue.split("\n").length;
  const titleHeight = titleFontSize * FONT.lineHeight * titleLines;
  if (box.stereotype) {
    elements.push(
      text({
        x: tx,
        y: ty - 4,
        width: box.width - SIZING.boxPaddingX * 2,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: `«${box.stereotype}»`,
        fontSize: FONT.sizeDescription,
        color: _activeGraphStyle.boxFontColor || color.stroke,
        align: "center",
      }),
    );
  }
  elements.push(
    applyLinkMetadata(
      text({
        x: tx,
        y: ty + (box.stereotype ? FONT.sizeDescription * FONT.lineHeight : 0),
        width: box.width - SIZING.boxPaddingX * 2,
        height: titleHeight,
        value: titleValue,
        fontSize: titleFontSize,
        color: titleColor || _activeGraphStyle.boxFontColor || color.stroke,
        align: "center",
      }),
      box,
    ),
  );
  if (box.description) {
    const descValue = box._wrappedDescription ?? String(box.description);
    const descFontSize = box._wrappedDescriptionFontSize ?? FONT.sizeDescription;
    elements.push(
      applyLinkMetadata(
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
          fontSize: descFontSize,
          color: _activeGraphStyle.boxFontColor || "#444",
        }),
        box,
      ),
    );
  }
}

/**
 * @param {ExcalElement} element Text or shape element.
 * @param {{link?:string,tooltip?:string}} source Model object carrying link metadata.
 * @returns {ExcalElement} The same element for inline composition.
 */
function applyLinkMetadata(element, source) {
  const link = String(source.link || "");
  const tooltip = String(source.tooltip || "");
  if (link) element.link = link;
  if (link || tooltip) {
    element.customData = { ...(element.customData || {}), link, tooltip };
  }
  return element;
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
  renderCurvedTextBoxTitle({
    box,
    color,
    elements,
    ratio: 0.72,
    role: "usecaseTitleText",
  });
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
  renderCurvedTextBoxTitle({
    box,
    color,
    elements,
    ratio: 0.63,
    role: "cloudTitleText",
  });
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
    applyLinkMetadata(
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
      box,
    ),
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
  if (box.shape === "object") {
    const underline = line({
      points: [
        {
          x: box.x + SIZING.boxPaddingX,
          y: ty + titleH + 1,
        },
        {
          x: box.x + box.width - SIZING.boxPaddingX,
          y: ty + titleH + 1,
        },
      ],
      strokeColor: color.stroke,
      strokeWidth: 1,
    });
    underline.customData = { role: "objectTitleUnderline", boxId: box.id };
    elements.push(underline);
  }
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
    // Prefer the per-member wrapped lines cached by the sizing pass —
    // this preserves the semantic break points (after `,`, `(`, ` :`,
    // etc.) chosen by `wrapMemberSignature`, so long method signatures
    // wrap inside the box instead of bleeding past the right edge.
    /** @type {string[][] | undefined} */
    const wrapped = box._wrappedMembers;
    const groups = partitionClassMembers(box.members, wrapped);
    const textX = box.x + SIZING.boxPaddingX;
    const textWidth = box.width - SIZING.boxPaddingX * 2;
    const memberY = sepY + SIZING.classCompartmentGap;
    if (groups.attributes.length && groups.operations.length) {
      const attrHeight = groups.attributes.length * FONT.sizeDescription * FONT.lineHeight;
      elements.push(
        text({
          x: textX,
          y: memberY,
          width: textWidth,
          height: attrHeight,
          value: groups.attributes.join("\n"),
          fontSize: FONT.sizeDescription,
          color: "#222",
          align: "left",
        }),
      );
      const opSepY = memberY + attrHeight + SIZING.classCompartmentGap;
      elements.push(
        line({
          points: [
            { x: box.x, y: opSepY },
            { x: box.x + box.width, y: opSepY },
          ],
          strokeColor: color.stroke,
          strokeWidth: 1,
        }),
      );
      elements.push(
        text({
          x: textX,
          y: opSepY + SIZING.classCompartmentGap,
          width: textWidth,
          height: groups.operations.length * FONT.sizeDescription * FONT.lineHeight,
          value: groups.operations.join("\n"),
          fontSize: FONT.sizeDescription,
          color: "#222",
          align: "left",
        }),
      );
    } else {
      const memberLines = groups.attributes.length ? groups.attributes : groups.operations;
      elements.push(
        text({
          x: textX,
          y: memberY,
          width: textWidth,
          height: memberLines.length * FONT.sizeDescription * FONT.lineHeight,
          value: memberLines.join("\n"),
          fontSize: FONT.sizeDescription,
          color: "#222",
          align: "left",
        }),
      );
    }
  }
}

/**
 * Split wrapped UML class members into attribute and operation lines.
 * @param {string[]} members Raw member declarations.
 * @param {string[][]|undefined} wrapped Per-member wrapped lines from sizing.
 * @returns {{attributes:string[],operations:string[]}}
 */
function partitionClassMembers(members, wrapped) {
  /** @type {string[]} */
  const attributes = [];
  /** @type {string[]} */
  const operations = [];
  members.forEach((member, index) => {
    const lines = wrapped?.[index] || [String(member)];
    if (isOperationMember(member)) operations.push(...lines);
    else attributes.push(...lines);
  });
  return { attributes, operations };
}

// --- Note (yellow sticky) ----------------------------------------------
/**
 * Render a sticky-note shape with a folded corner.
 * @param {Box} box Box (shape == `note`).
 * @param {ExcalElement[]} elements Excalidraw element list — mutated in place.
 * @returns {void}
 */
function renderNote(box, elements) {
  const NOTE_FILL = _activeGraphStyle.noteBackgroundColor || "#fff5b1";
  const NOTE_STROKE = _activeGraphStyle.noteBorderColor || "#a07b00";
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
  const noteText = text({
    x: box.x + SIZING.boxPaddingX,
    y: box.y + SIZING.boxPaddingY,
    width: box.width - SIZING.boxPaddingX * 2,
    height: box.height - SIZING.boxPaddingY * 2,
    value: text_value,
    fontSize: FONT.sizeDescription,
    color: _activeGraphStyle.noteFontColor || "#000",
  });
  noteText.customData = { role: "noteText", boxId: box.id };
  elements.push(applyLinkMetadata(noteText, box));
}

/**
 * Collect a single edge-label layout item and keep all measurements in a
 * mutable structure so collisions can adjust the final position (and font
 * size, if needed) without re-parsing the diagram model.
 *
 * @param {import("../model/diagram.mjs").Connection} conn Connection whose label is rendered.
 * @returns {LabelLayoutItem|null}
 * @internal
 */
function collectEdgeLabelLayout(conn) {
  const path = conn.path;
  if (!path || path.length < 2) return null;
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

  // Label rotation: vertical segments always use -π/2 (90° CCW),
  // horizontal segments use 0. This makes vertical labels consistent
  // regardless of which direction the arrow points (up or down).
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const isVertical = Math.abs(dy) > Math.abs(dx);
  const angle = isVertical ? -Math.PI / 2 : 0;

  const style = /** @type {any} */ (getStyle()).edgeLabel || {};
  const lineColor = connectionStrokeColor(conn);
  const bgColor = style.useLineColor === false ? style.backgroundColor || "#444" : lineColor;
  const strokeColor = style.strokeColor || bgColor;
  const textColor = _activeGraphStyle.edgeFontColor || style.textColor || "#ffffff";
  const padX = typeof style.paddingX === "number" ? style.paddingX : 6;
  const padY = typeof style.paddingY === "number" ? style.paddingY : 2;
  const segMargin = typeof style.segmentMargin === "number" ? style.segmentMargin : 24;
  const maxWidthCap = typeof style.maxWidth === "number" ? style.maxWidth : 160;
  const minGap = Math.max(2, typeof style.minGap === "number" ? style.minGap : 2);

  // Prefer a chip that fits the segment, but keep enough inner width
  // for the smart wrapper's minimum four-character line budget. This
  // makes containment win for very short routed segments instead of
  // letting the text bleed out of the background.
  const segCap = Math.max(40, bestLen - segMargin);
  const preferredChipWidth = Math.min(maxWidthCap, segCap);
  /** @type {LabelLayoutItem} */
  const item = {
    id: `edge:${conn.id}`,
    kind: "edge",
    connectionId: conn.id,
    endpoint: null,
    text: String(conn.label),
    centerX: cx,
    centerY: cy,
    normalX: isVertical ? 1 : 0,
    normalY: isVertical ? 0 : 1,
    angle,
    padX,
    padY,
    strokeColor,
    backgroundColor: style.useLineColor === false ? style.backgroundColor || "#444" : lineColor,
    textColor: _activeGraphStyle.edgeFontColor || style.textColor || "#ffffff",
    minGap,
    minFontSize: Math.max(
      1,
      /** @type {any} */ (getStyle()).text?.minFontSize ??
        /** @type {any} */ (getStyle()).font?.minSize ??
        8,
    ),
    fontSize: FONT.sizeEdgeLabel,
    maxTextWidth: preferredChipWidth,
    minInnerTextWidth: Math.max(40, Math.ceil(FONT.sizeEdgeLabel * FONT.glyphRatio * 4)),
    x: cx,
    y: cy,
    width: 20,
    height: FONT.sizeEdgeLabel * FONT.lineHeight,
    measuredWidth: 0,
    measuredHeight: 0,
    fittedFontSize: FONT.sizeEdgeLabel,
    lines: [],
    avoidedOverlap: false,
    roleChip: "edgeLabelChip",
    roleText: "edgeLabelText",
    lineColor,
    link: conn.link,
    tooltip: conn.tooltip,
  };
  applyLabelMeasurement(item);
  return item;
}

/**
 * Collect optional endpoint label layouts for multiplicity labels.
 *
 * @param {import("../model/diagram.mjs").Connection} conn Routed connection.
 * @returns {LabelLayoutItem[]}
 */
function collectConnectionEndpointLabelLayouts(conn) {
  if (!conn.path || conn.path.length < 2) return [];
  /** @type {Array<{endpoint:"start"|"end",point:Pt,next:Pt,label:string|undefined}>} */
  const endpoints = [
    {
      endpoint: "start",
      point: conn.path[0],
      next: conn.path[1],
      label: conn.arrow.start.label,
    },
    {
      endpoint: "end",
      point: conn.path[conn.path.length - 1],
      next: conn.path[conn.path.length - 2],
      label: conn.arrow.end.label,
    },
  ];
  const out = /** @type {LabelLayoutItem[]} */ ([]);
  const style = /** @type {any} */ (getStyle()).edgeLabel || {};
  const minGap = Math.max(2, typeof style.minGap === "number" ? style.minGap : 2);
  const lineColor = connectionStrokeColor(conn);
  for (const endpoint of endpoints) {
    if (!endpoint.label) continue;
    const fontSize = Math.max(FONT.sizeEdgeLabel + 2, FONT.sizeDescription);
    const text = String(endpoint.label);
    const minFontSize = Math.max(9, FONT.sizeEdgeLabel);
    const padX = 5;
    const padY = 2;
    const dx = endpoint.next.x - endpoint.point.x;
    const dy = endpoint.next.y - endpoint.point.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    /** @type {LabelLayoutItem} */
    const tempLabel = {
      id: `endpoint:${conn.id}:${endpoint.endpoint}`,
      kind: "endpoint",
      connectionId: conn.id,
      endpoint: endpoint.endpoint,
      text,
      centerX: 0,
      centerY: 0,
      normalX: nx,
      normalY: ny,
      angle: 0,
      padX,
      padY,
      strokeColor: lineColor,
      backgroundColor: "#ffffff",
      textColor: _activeGraphStyle.edgeFontColor || lineColor,
      minGap,
      minFontSize,
      fontSize,
      maxTextWidth: 96,
      minInnerTextWidth: 30,
      x: 0,
      y: 0,
      width: 30,
      height: Math.max(fontSize * FONT.lineHeight, 0),
      measuredWidth: 0,
      measuredHeight: 0,
      fittedFontSize: fontSize,
      lines: [],
      avoidedOverlap: false,
      roleChip: "arrowEndpointLabelChip",
      roleText: "arrowEndpointLabel",
      lineColor,
      link: "",
      tooltip: "",
    };
    applyLabelMeasurement(tempLabel);
    const center = endpointLabelCenter(
      endpoint.point,
      endpoint.next,
      tempLabel.width,
      tempLabel.height,
    );
    tempLabel.centerX = center.x;
    tempLabel.centerY = center.y;
    out.push(tempLabel);
  }
  return out;
}

/**
 * Resolve all label layouts (edge labels and endpoint labels) so all chips keep
 * `minGap` px distance. Resolution is iterative:
 * 1) push colliding labels away from each other along their edge normals,
 * 2) retry until stable,
 * 3) shrink all currently-colliding labels and retry if needed.
 *
 * @param {LabelLayoutItem[]} labels	horizontal list of labels to place.
 */
function layoutGraphLabels(labels) {
  if (labels.length < 2) return;

  for (let shrinkPass = 0; shrinkPass <= EDGE_LABEL_MAX_SHRINK_PASSES; shrinkPass++) {
    for (let shiftPass = 0; shiftPass < EDGE_LABEL_MAX_SHIFT_PASSES; shiftPass++) {
      const pairs = collectOverlappingPairs(labels);
      if (!pairs.length) return;

      let movedInIteration = false;
      for (const [leftIdx, rightIdx] of pairs) {
        if (resolveOverlappingPair(labels, leftIdx, rightIdx)) {
          movedInIteration = true;
        }
      }
      if (!movedInIteration) break;
    }

    const remaining = collectOverlappingPairs(labels);
    if (!remaining.length) return;

    const overlapIndices = /** @type {Set<number>} */ (new Set());
    for (const [leftIdx, rightIdx] of remaining) {
      overlapIndices.add(leftIdx);
      overlapIndices.add(rightIdx);
    }
    let didShrink = false;
    for (const idx of overlapIndices) {
      didShrink = shrinkLabelFont(labels[idx]) || didShrink;
    }
    if (!didShrink) return;
  }
}

/**
 * Resolve one overlapping pair by moving the labels along their normals until
 * they no longer overlap.
 *
 * @param {LabelLayoutItem[]} labels All pending label items.
 * @param {number} leftIdx Index of first label.
 * @param {number} rightIdx Index of second label.
 * @returns {boolean}
 */
function resolveOverlappingPair(labels, leftIdx, rightIdx) {
  const left = labels[leftIdx];
  const right = labels[rightIdx];
  if (!pairOverlap(left, right)) return false;

  const movedLeft = moveLabelAway(left, right);
  if (movedLeft) return true;

  return moveLabelAway(right, left);
}

/**
 * Move `item` away from `other` along the item normal. If both labels overlap,
 * we move by the minimum clearance distance and keep the gap at 0 for the
 * expanded bounds.
 *
 * @param {LabelLayoutItem} item Label to move.
 * @param {LabelLayoutItem} other Obstacle label.
 * @returns {boolean} true when moved.
 */
function moveLabelAway(item, other) {
  if (!pairOverlap(item, other)) return false;

  const itemBounds = labelBoundsAtCandidate(item);
  const otherBounds = labelBoundsAtCandidate(other);
  const itemCenterX = item.x + item.width / 2;
  const itemCenterY = item.y + item.height / 2;
  const otherCenterX = other.x + other.width / 2;
  const otherCenterY = other.y + other.height / 2;
  const towardNormal =
    (itemCenterX - otherCenterX) * item.normalX + (itemCenterY - otherCenterY) * item.normalY;
  const sign = towardNormal >= 0 ? -1 : 1;

  const vx = item.normalX * sign;
  const vy = item.normalY * sign;
  const distance = minimumClearanceDistance(itemBounds, otherBounds, vx, vy);
  if (!Number.isFinite(distance) || distance <= 0) return false;

  item.x += vx * distance;
  item.y += vy * distance;
  item.avoidedOverlap = true;
  return true;
}

/**
 * @param {LabelLayoutItem} item
 * @param {LabelLayoutItem} other
 * @returns {boolean}
 */
function pairOverlap(item, other) {
  return boundsOverlap(labelBoundsAtCandidate(item), labelBoundsAtCandidate(other));
}

/**
 * @param {LabelLayoutItem[]} labels
 * @returns {Array<[number, number]>}
 */
function collectOverlappingPairs(labels) {
  const pairs = /** @type {Array<[number, number]>} */ ([]);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (pairOverlap(labels[i], labels[j])) pairs.push([i, j]);
    }
  }
  return pairs;
}

/**
 * @param {{x:number,y:number,width:number,height:number}} mover
 * @param {{x:number,y:number,width:number,height:number}} obstacle
 * @param {number} vx
 * @param {number} vy
 * @returns {number}
 */
function minimumClearanceDistance(mover, obstacle, vx, vy) {
  const eps = 1e-9;
  const dists = /** @type {number[]} */ ([]);
  if (vx > eps) dists.push((obstacle.x + obstacle.width - mover.x) / vx);
  else if (vx < -eps) dists.push((mover.x + mover.width - obstacle.x) / -vx);

  if (vy > eps) dists.push((obstacle.y + obstacle.height - mover.y) / vy);
  else if (vy < -eps) dists.push((mover.y + mover.height - obstacle.y) / -vy);

  if (!dists.length) return Infinity;
  const distance = Math.min(...dists);
  return distance <= 0 ? 0 : distance;
}

/**
 * @param {LabelLayoutItem} item
 * @param {boolean} [forceShrink]
 */
function applyLabelMeasurement(item, forceShrink = false) {
  const autoShrink = forceShrink || /** @type {any} */ (getStyle()).text?.autoShrink !== false;
  const minFontSize = item.minFontSize;
  let fontSize = item.fontSize;
  /** @type {{width:number, height:number, lines:string[], fontSize?:number}} */
  let wrapped = /** @type {{ width: number, height: number, lines: string[] }} */ ({
    width: 0,
    height: 0,
    lines: [],
  });

  const maxWidth = Math.max(4, item.maxTextWidth - item.padX * 2);
  if (item.kind === "edge") {
    const minInnerWidth = Math.max(
      item.minInnerTextWidth,
      Math.ceil(fontSize * FONT.glyphRatio * 4),
    );
    const innerWidth = Math.max(minInnerWidth, maxWidth);
    wrapped =
      autoShrink || forceShrink
        ? measureSmartFitted(item.text, fontSize, innerWidth, { minFontSize })
        : measureSmartWrapped(item.text, fontSize, innerWidth);
    while (forceShrink && fontSize > minFontSize) {
      const rawW = Math.max(
        0,
        ...wrapped.lines.map((line) => measureSmartWrapped(line, fontSize, innerWidth).width),
      );
      if (rawW <= innerWidth + 0.5) break;
      fontSize -= 1;
      wrapped = measureSmartWrapped(item.text, fontSize, innerWidth);
    }
  } else {
    wrapped =
      autoShrink || forceShrink
        ? measureSmartFitted(item.text, fontSize, item.maxTextWidth, { minFontSize })
        : measureSmartWrapped(item.text, fontSize, item.maxTextWidth);
    while (forceShrink && fontSize > minFontSize) {
      const rawW = Math.max(
        0,
        ...wrapped.lines.map((line) => line.length * fontSize * FONT.glyphRatio),
      );
      if (rawW <= item.maxTextWidth + 0.5) break;
      fontSize -= 1;
      wrapped = measureSmartWrapped(item.text, fontSize, item.maxTextWidth);
    }
  }
  item.fittedFontSize = wrapped.fontSize || fontSize;
  item.lines = wrapped.lines;
  item.measuredWidth = wrapped.width;
  item.measuredHeight = wrapped.height;
  item.width = Math.max(item.kind === "endpoint" ? 30 : 20, wrapped.width + item.padX * 2);
  item.height = Math.max(fontSize * FONT.lineHeight, wrapped.height) + item.padY * 2;
  item.fontSize = fontSize;
}

/**
 * @param {LabelLayoutItem} item
 * @returns {boolean}
 */
function shrinkLabelFont(item) {
  if (item.fontSize <= item.minFontSize) return false;
  const before = { fontSize: item.fontSize, width: item.width, height: item.height };
  item.fontSize -= 1;
  applyLabelMeasurement(item, true);
  if (item.width >= before.width && item.height >= before.height) {
    item.fontSize = before.fontSize;
    item.width = before.width;
    item.height = before.height;
    return false;
  }
  return true;
}

/**
 * @param {LabelLayoutItem} item
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function labelBoundsAtCandidate(item) {
  return expandedRotatedBounds(item.x, item.y, item.width, item.height, item.angle, item.minGap);
}

/**
 * Build final Excalidraw elements for one resolved label layout item.
 *
 * @param {LabelLayoutItem} item
 * @returns {ExcalElement[]}
 */
function renderLabelLayoutElements(item) {
  const out = /** @type {ExcalElement[]} */ ([]);
  const chip = rect({
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    strokeColor: item.strokeColor,
    backgroundColor: item.backgroundColor,
  });
  chip.angle = item.angle;
  chip.roughness = 0;
  chip.roundness = null;
  chip.strokeWidth = 1;
  chip.customData = {
    role: item.roleChip,
    connectionId: item.connectionId,
    endpoint: item.endpoint,
    lineColor: item.lineColor,
    fittedFontSize: item.fittedFontSize,
    avoidedOverlap: item.avoidedOverlap,
  };
  out.push(chip);

  const textValue = item.lines.join("\n");
  const label = text({
    x: item.x + item.padX,
    y: item.y + item.padY,
    width: item.width - item.padX * 2,
    height: item.height - item.padY * 2,
    value: textValue,
    fontSize: item.fittedFontSize,
    color: item.textColor,
    align: "center",
    vAlign: "middle",
  });
  label.angle = item.angle;
  label.customData = {
    role: item.roleText,
    connectionId: item.connectionId,
    endpoint: item.endpoint,
    lineColor: item.lineColor,
    fittedFontSize: item.fittedFontSize,
    measuredWidth: item.measuredWidth,
    measuredHeight: item.measuredHeight,
    avoidedOverlap: item.avoidedOverlap,
  };
  if (item.kind === "edge") {
    const placeholder = {
      link: item.link || "",
      tooltip: item.tooltip || "",
    };
    applyLinkMetadata(label, /** @type {any} */ (placeholder));
  }
  out.push(label);
  return out;
}

/**
 * @param {number} x Unrotated element x.
 * @param {number} y Unrotated element y.
 * @param {number} width Unrotated element width.
 * @param {number} height Unrotated element height.
 * @param {number} angle Rotation angle around the element centre.
 * @param {number} margin Bounds expansion in px.
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function expandedRotatedBounds(x, y, width, height, angle, margin) {
  if (!angle) {
    return {
      x: x - margin,
      y: y - margin,
      width: width + margin * 2,
      height: height + margin * 2,
    };
  }
  const cx = x + width / 2;
  const cy = y + height / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((point) => {
    const px = point.x - cx;
    const py = point.y - cy;
    return {
      x: cx + px * cos - py * sin,
      y: cy + px * sin + py * cos,
    };
  });
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));
  return {
    x: minX - margin,
    y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}

/**
 * @param {{x:number,y:number,width:number,height:number}} a
 * @param {{x:number,y:number,width:number,height:number}} b
 * @returns {boolean}
 */
function boundsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Place an endpoint label just inside the routed edge rather than on the
 * element border. The perpendicular offset keeps the label from sitting
 * directly on top of the line.
 * @param {Pt} point Endpoint on the element edge.
 * @param {Pt} next Adjacent point along the routed edge.
 * @param {number} width Label chip width.
 * @param {number} height Label chip height.
 * @returns {Pt} Label centre.
 */
function endpointLabelCenter(point, next, width, height) {
  const dx = next.x - point.x;
  const dy = next.y - point.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const along = Math.min(34, Math.max(20, len * 0.22));
  const away = Math.max(9, Math.min(14, Math.min(width, height) * 0.45));
  return {
    x: point.x + ux * along + nx * away,
    y: point.y + uy * along + ny * away,
  };
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
      color: _activeGraphStyle.containerFontColor || color.stroke,
      align: "left",
      vAlign: "middle",
    }),
  );
}
