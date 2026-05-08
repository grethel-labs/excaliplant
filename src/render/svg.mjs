// Convert an Excalidraw JSON document to a self-contained SVG string.
//
// The Excalidraw renderer emits a flat list of elements with absolute
// positions; we translate the subset we actually produce: rectangle,
// ellipse, line, arrow, text. Strokes are routed through `roughjs`
// (the same library Excalidraw uses internally) so the exported SVG
// inherits the recognisable hand-drawn wobble — and since the PNG
// path rasterises this very SVG, the PNG keeps the look too.
//
// The roughjs Generator is dependency-free at runtime: it produces
// SVG path commands as strings, no DOM required.

import rough from "roughjs";

import { getExcalifontFontFace, EXCALIFONT_FONT_STACK } from "../style/font.mjs";

const FONT_FAMILY = EXCALIFONT_FONT_STACK;
const ROUGHNESS = 1; // Excalidraw's default roughness.
const BOWING = 1;
const FILL_WEIGHT = 0; // 0 → roughjs picks a sensible default.
// Arrowhead size in user-space pixels. Sized so multiple parallel
// arrowheads stacked along the same node side (ELK distributes them
// evenly across the side height — typically 20–30 px apart for dense
// diagrams) do not overlap their tips. Increasing this beyond ~25 px
// causes visible overlap on heavily connected nodes.
const ARROWHEAD_PX = 20;

const generator = rough.generator();

/**
 * Convert an Excalidraw JSON document to a stand-alone SVG string.
 *
 * @param {any} doc           The Excalidraw JSON document.
 * @param {object} [opts]
 * @param {number} [opts.padding=16]    Whitespace around the bounds.
 * @param {string} [opts.background]    Optional background fill colour.
 * @returns {string}             A complete `<svg>...</svg>` document.
 */
export function excalidrawToSvg(doc, opts = {}) {
  const padding = opts.padding ?? 16;
  const elements = (doc.elements || []).filter((/** @type {any} */ e) => !e.isDeleted);
  const bounds = computeBounds(elements);
  const w = Math.max(1, bounds.maxX - bounds.minX) + padding * 2;
  const h = Math.max(1, bounds.maxY - bounds.minY) + padding * 2;
  const tx = -bounds.minX + padding;
  const ty = -bounds.minY + padding;

  const bg = opts.background ?? doc.appState?.viewBackgroundColor ?? "#ffffff";
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family='${FONT_FAMILY}'>`,
  );
  // Collect every (arrowhead-type, end, stroke-colour) triple that
  // actually appears so we only emit the markers we need. Each marker
  // bakes the colour into its `fill` / `stroke` so SVG renderers
  // without `context-stroke` support (resvg-js, some Markdown
  // sanitisers) still produce coloured arrowheads.
  /** @type {Set<string>} */
  const markerKeys = new Set();
  for (const el of elements) {
    if (el.type !== "arrow") continue;
    const color = el.strokeColor || "#000000";
    if (el.startArrowhead) markerKeys.add(`${el.startArrowhead}|start|${color}`);
    if (el.endArrowhead) markerKeys.add(`${el.endArrowhead}|end|${color}`);
  }
  // Root-level <defs>: font-face + arrowhead markers. Keeping both here
  // (rather than inside the translate <g>) ensures every SVG renderer
  // finds the markers, as some implementations (Safari, resvg, some
  // Markdown sanitisers) only resolve <marker> IDs when the <defs>
  // is a direct child of the root <svg> element.
  out.push(
    `<defs><style type="text/css"><![CDATA[${getExcalifontFontFace()}]]></style>${arrowheadMarkers(markerKeys)}</defs>`,
  );
  out.push(`<rect width="100%" height="100%" fill="${escapeAttr(bg)}"/>`);
  out.push(`<g transform="translate(${tx} ${ty})">`);

  for (const el of elements) {
    const node = renderOne(el);
    if (node) out.push(node);
  }

  out.push(`</g></svg>`);
  return out.join("\n");
}

/** @internal */
/**
 * Compute the axis-aligned bounding box that covers every element.
 * @param {any[]} elements Excalidraw element list.
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}} Bounding rectangle in absolute coords.
 */
function computeBounds(elements) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const include = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const e of elements) {
    if (e.type === "arrow" || e.type === "line") {
      for (const [dx, dy] of e.points || []) include(e.x + dx, e.y + dy);
    } else {
      include(e.x, e.y);
      include(e.x + (e.width || 0), e.y + (e.height || 0));
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  return { minX, minY, maxX, maxY };
}

/** @internal */
/**
 * Render one Excalidraw element as an SVG fragment.
 * Elements with a non-zero `angle` are wrapped in a `<g transform="rotate(...)">`.
 * Excalidraw rotates around the element centre in degrees; SVG rotates in
 * degrees too so the conversion is direct.
 * @param {any} el Excalidraw element.
 * @returns {string} SVG markup for the element (empty string when unsupported).
 */
function renderOne(el) {
  let inner;
  switch (el.type) {
    case "rectangle":
      inner = roughRect(el);
      break;
    case "ellipse":
      inner = roughEllipse(el);
      break;
    case "line":
      inner = roughPolyline(el, false);
      break;
    case "arrow":
      inner = roughPolyline(el, true);
      break;
    case "text":
      inner = svgText(el);
      break;
    default:
      return "";
  }
  if (!inner) return "";
  // Wrap in a rotation transform when the element has a non-zero angle.
  // Excalidraw stores radians; SVG rotate() takes degrees.
  const angleDeg = ((el.angle || 0) * 180) / Math.PI;
  if (Math.abs(angleDeg) < 0.001) return inner;
  // Rotation centre: element centre (x + w/2, y + h/2). For arrows/lines
  // that have no explicit width/height we fall back to their first point.
  const cx = el.x + (el.width || 0) / 2;
  const cy = el.y + (el.height || 0) / 2;
  return `<g transform="rotate(${angleDeg.toFixed(4)},${cx},${cy})">${inner}</g>`;
}

// ── roughjs helpers ───────────────────────────────────────────────────────

// Pull a deterministic seed off each Excalidraw element so re-rendering
// the same JSON document yields the same wobble. Excalidraw assigns
// `seed` to every element; if it's missing we fall back to a hash of
// the element's id so output is still deterministic per-document.
/** @internal */
/**
 * Stable seed derived from the element id so re-renders are deterministic.
 * @param {any} el Excalidraw element.
 * @returns {number} Non-negative 31-bit seed.
 */
function seedFor(el) {
  if (typeof el.seed === "number") return el.seed % 2_147_483_647;
  if (el.id) {
    let h = 0;
    for (const c of String(el.id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h) % 2_147_483_647;
  }
  return 1;
}

/** @internal */
/**
 * Build the options object passed to roughjs for one element.
 * @param {any} el Excalidraw element.
 * @returns {any} roughjs options.
 */
function roughOpts(el) {
  // Honour the per-element roughness Excalidraw stores: arrows /
  // connection lines are emitted with `roughness: 0` so their SVG
  // representation must be perfectly straight too. Falling back to
  // the default (1) keeps Excalidraw's hand-drawn look for boxes.
  const r = typeof el.roughness === "number" ? el.roughness : ROUGHNESS;
  return {
    seed: seedFor(el),
    roughness: r,
    bowing: r === 0 ? 0 : BOWING,
    stroke: el.strokeColor || "#000",
    strokeWidth: el.strokeWidth || 1.5,
    fill: /** @type {string|undefined} */ (undefined),
    fillStyle: "solid",
    fillWeight: FILL_WEIGHT,
    disableMultiStroke: r === 0,
  };
}

/** @internal */
/**
 * Translate Excalidraw `strokeStyle` to an SVG `stroke-dasharray` value.
 * Returns an empty string for solid strokes so the caller can interpolate
 * directly without a null-check.
 * @param {any} el Excalidraw element.
 * @returns {string} `stroke-dasharray` value, or `""` for solid strokes.
 */
function dasharray(el) {
  if (el.strokeStyle === "dashed") return "8 4";
  if (el.strokeStyle === "dotted") return "1.5 6";
  return "";
}

/**
 * Convert a roughjs drawable to SVG markup, preserving fill/stroke/dash.
 * @param {any} drawable roughjs drawable produced by the generator.
 * @param {any} el       Originating Excalidraw element (provides colours).
 * @returns {string} SVG markup.
 */
function drawableToSvg(drawable, el) {
  // roughjs returns one or more `OpSet`s. We render path-typed sets
  // as <path> elements. fillSketch/fillPath sets get the fill colour;
  // path sets get the stroke colour.
  const stroke = el.strokeColor || "#000";
  const strokeWidth = el.strokeWidth || 1.5;
  const dash = dasharray(el);
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";

  const out = [];
  for (const set of drawable.sets) {
    const d = generator.opsToPath(set);
    if (!d) continue;
    if (set.type === "fillPath" || set.type === "fillSketch") {
      const fill =
        el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : null;
      if (!fill) continue;
      out.push(`<path d="${d}" fill="${escapeAttr(fill)}" stroke="none"/>`);
    } else if (set.type === "path") {
      out.push(
        `<path d="${d}" fill="none" stroke="${escapeAttr(stroke)}" ` +
          `stroke-width="${strokeWidth}" stroke-linecap="round" ` +
          `stroke-linejoin="round"${dashAttr}/>`,
      );
    }
  }
  return out.join("");
}

/**
 * Render a rectangle using roughjs (sketchy stroke).
 * @param {any} el Rectangle element.
 * @returns {string} SVG markup.
 */
function roughRect(el) {
  const fill = colorOrNone(el.backgroundColor);
  // Solid fill underneath. roughjs' fill modes look noisy on small
  // shapes, and Excalidraw's own export uses solid fills + sketchy
  // outlines, so we mirror that.
  const fillSvg =
    fill !== "none" ? `<path d="${rectPath(el)}" fill="${escapeAttr(fill)}" stroke="none"/>` : "";
  const drawable = el.roundness
    ? generator.path(rectPath(el), roughOpts(el))
    : generator.rectangle(el.x, el.y, el.width, el.height, roughOpts(el));
  return fillSvg + drawableToSvg(drawable, el);
}

/**
 * Build an SVG `path` `d` attribute for a (rounded) rectangle.
 * @param {any} el Rectangle element.
 * @returns {string} `d` value (no `<path>` wrapper).
 */
function rectPath(el) {
  // `roundness: {type: 3}` (proportional) mirrors Excalidraw's "rounded
  // corners" toggle. Excalidraw uses ~10% of the shorter side, clamped to
  // a sensible maximum. We replicate that formula here so the SVG output
  // matches the visual look of the Excalidraw editor.
  const r = el.roundness ? Math.min(el.width * 0.1, el.height * 0.1, 32) : 0;
  if (!r) {
    return `M${el.x},${el.y} h${el.width} v${el.height} h${-el.width} z`;
  }
  const x = el.x,
    y = el.y,
    w = el.width,
    h = el.height;
  return [
    `M${x + r},${y}`,
    `h${w - 2 * r}`,
    `a${r},${r} 0 0 1 ${r},${r}`,
    `v${h - 2 * r}`,
    `a${r},${r} 0 0 1 ${-r},${r}`,
    `h${-(w - 2 * r)}`,
    `a${r},${r} 0 0 1 ${-r},${-r}`,
    `v${-(h - 2 * r)}`,
    `a${r},${r} 0 0 1 ${r},${-r}`,
    "z",
  ].join(" ");
}

/**
 * Render an ellipse using roughjs.
 * @param {any} el Ellipse element.
 * @returns {string} SVG markup.
 */
function roughEllipse(el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const fill = colorOrNone(el.backgroundColor);
  const fillSvg =
    fill !== "none"
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${el.width / 2}" ` +
        `ry="${el.height / 2}" fill="${escapeAttr(fill)}" stroke="none"/>`
      : "";
  const drawable = generator.ellipse(cx, cy, el.width, el.height, roughOpts(el));
  return fillSvg + drawableToSvg(drawable, el);
}

/**
 * Render a polyline (with optional arrowhead) using roughjs.
 * @param {any} el Line / arrow element.
 * @param {boolean} withArrow When `true`, attach an arrowhead at the end.
 * @returns {string} SVG markup.
 */
function roughPolyline(el, withArrow) {
  const pts = (el.points || []).map((/** @type {[number,number]} */ [dx, dy]) => [
    el.x + dx,
    el.y + dy,
  ]);
  if (pts.length < 2) return "";
  const drawable = generator.linearPath(pts, roughOpts(el));
  let body = drawableToSvg(drawable, el);

  // Arrowheads: keep the same marker-based mechanism, but apply it to
  // a thin invisible <polyline> so the marker ends up at the geometric
  // endpoint (not a wobble-jittered endpoint of the rough path).
  if (withArrow && (el.startArrowhead || el.endArrowhead)) {
    const polyPts = pts.map((/** @type {[number,number]} */ [x, y]) => `${x},${y}`).join(" ");
    const colorSuffix = colorMarkerSuffix(el.strokeColor || "#000000");
    const startMarker = el.startArrowhead
      ? ` marker-start="url(#m_${el.startArrowhead}_start_${colorSuffix})"`
      : "";
    const endMarker = el.endArrowhead
      ? ` marker-end="url(#m_${el.endArrowhead}_end_${colorSuffix})"`
      : "";
    // Marker rendering rules vary across renderers:
    //   - stroke-width="0" : Safari and resvg skip markers (degenerate stroke)
    //   - stroke="none"    : some renderers also skip markers
    // Safest combination: a real, non-zero stroke width in a fully
    // transparent colour. The polyline contributes no visible pixels
    // but markers still attach at the vertices everywhere.
    body += `<polyline points="${polyPts}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="1"${startMarker}${endMarker}/>`;
  }
  return body;
}

/**
 * Render a text element as an SVG `<text>` block (with line wrapping).
 * @param {any} el Text element.
 * @returns {string} SVG markup.
 */
function svgText(el) {
  const fill = el.strokeColor || "#000";
  const fs = el.fontSize || 16;
  const lineHeight = fs * (el.lineHeight || 1.2);
  const lines = String(el.text ?? "").split("\n");
  const align = el.textAlign || "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  let xRef = el.x;
  if (align === "center") xRef = el.x + (el.width || 0) / 2;
  else if (align === "right") xRef = el.x + (el.width || 0);
  const yTop = el.y + fs;
  const tspans = lines
    .map((l, i) => `<tspan x="${xRef}" dy="${i === 0 ? 0 : lineHeight}">${escapeText(l)}</tspan>`)
    .join("");
  return `<text x="${xRef}" y="${yTop}" fill="${escapeAttr(fill)}" font-size="${fs}" text-anchor="${anchor}">${tspans}</text>`;
}

// ── arrowheads ────────────────────────────────────────────────────────────

/**
 * Sanitise an arbitrary CSS colour into a marker-id-safe suffix.
 * Hex colours collapse to their 6-digit lowercase form; everything
 * else is reduced to its alphanumerics. Used by both the marker
 * registry and the polyline marker reference so they always agree.
 * @param {string} color
 * @returns {string}
 */
function colorMarkerSuffix(color) {
  return String(color || "")
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "");
}

// Marker geometry presets: viewBox, refX (for end-side), markerWidth /
// markerHeight, and the path. Outline variants flip the fill rule:
// `outline` markers use `fill="<canvas>" stroke="<color>"`, while solid
// markers use `fill="<color>"`. The canvas colour is currently fixed
// at white (matching the Excalidraw default canvas).
const ARROWHEAD_GEOMETRY = {
  // Excalidraw "arrow" type is an open chevron (two stroke lines, no fill)
  // — analogous to ">" — not a filled triangle. Use `open: true` so the
  // marker builder emits `fill="none" stroke="<color>"` instead of
  // `fill="<color>"`. The path has no closing `z`.
  arrow: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 1,
    width: ARROWHEAD_PX,
    height: ARROWHEAD_PX,
    path: "M0.7,0.6 L9.4,5 L0.9,9.5",
    outline: false,
    open: true,
  },
  triangle: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 1,
    width: ARROWHEAD_PX,
    height: ARROWHEAD_PX,
    path: "M0.7,0.7 L9.4,5 L1.1,9.3 z",
    outline: false,
    open: false,
  },
  triangle_outline: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 1,
    width: ARROWHEAD_PX + 2,
    height: ARROWHEAD_PX + 2,
    path: "M0.7,0.7 L9.4,5 L1.1,9.3 z",
    outline: true,
    open: false,
  },
  diamond: {
    viewBox: "0 0 12 10",
    refXEnd: 11,
    refXStart: 1,
    width: Math.round(ARROWHEAD_PX * 1.3),
    height: ARROWHEAD_PX,
    path: "M0.8,5 L6.1,0.8 L11.5,5 L6,9.2 z",
    outline: false,
    open: false,
  },
  diamond_outline: {
    viewBox: "0 0 12 10",
    refXEnd: 11,
    refXStart: 1,
    width: Math.round(ARROWHEAD_PX * 1.3),
    height: ARROWHEAD_PX,
    path: "M0.8,5 L6.1,0.8 L11.5,5 L6,9.2 z",
    outline: true,
    open: false,
  },
  circle: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 9,
    width: ARROWHEAD_PX,
    height: ARROWHEAD_PX,
    path: "M5.1,5 m-3.9,0 a3.9,4.1 0 1,0 7.8,0 a3.9,4.1 0 1,0 -7.8,0",
    outline: false,
    open: false,
  },
  circle_outline: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 9,
    width: ARROWHEAD_PX,
    height: ARROWHEAD_PX,
    path: "M5.1,5 m-3.9,0 a3.9,4.1 0 1,0 7.8,0 a3.9,4.1 0 1,0 -7.8,0",
    outline: true,
    open: false,
  },
  dot: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 9,
    width: Math.round(ARROWHEAD_PX * 0.8),
    height: Math.round(ARROWHEAD_PX * 0.8),
    path: "M5.1,5 m-2.8,0 a2.8,3.1 0 1,0 5.6,0 a2.8,3.1 0 1,0 -5.6,0",
    outline: false,
    open: false,
  },
  bar: {
    viewBox: "0 0 10 10",
    refXEnd: 5,
    refXStart: 5,
    width: Math.round(ARROWHEAD_PX * 0.8),
    height: ARROWHEAD_PX,
    path: "M5.2,0.5 L4.8,9.5",
    outline: false,
    open: true,
  },
  partial_top: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 9,
    width: ARROWHEAD_PX,
    height: ARROWHEAD_PX,
    path: "M0.6,0.8 L9.5,5",
    outline: false,
    open: true,
  },
  partial_bottom: {
    viewBox: "0 0 10 10",
    refXEnd: 9,
    refXStart: 9,
    width: ARROWHEAD_PX,
    height: ARROWHEAD_PX,
    path: "M0.8,9.2 L9.4,5",
    outline: false,
    open: true,
  },
};

// Returns only the <marker> elements (no wrapping <defs>). The caller
// merges them into the root <defs> block so SVG renderers that only
// resolve marker IDs from root-level <defs> (Safari, resvg) work.
//
// `keys` is a Set of `${type}|${start|end}|${color}` triples collected
// from the actual arrow elements; one marker is emitted per triple so
// each arrowhead inherits the colour of its arrow.
/**
 * @param {Set<string>} keys
 * @returns {string}
 */
function arrowheadMarkers(keys) {
  const out = [];
  for (const key of keys) {
    const [type, side, color] = key.split("|");
    const geom = ARROWHEAD_GEOMETRY[/** @type {keyof typeof ARROWHEAD_GEOMETRY} */ (type)];
    if (!geom) continue;
    const suffix = colorMarkerSuffix(color);
    const id = `m_${type}_${side}_${suffix}`;
    // Both start and end markers are anchored at the visual tip. With
    // `auto-start-reverse`, using the base-side refX for start markers
    // makes the arrowhead begin at the endpoint instead of pointing to it.
    const refX = geom.refXEnd;
    const orient = side === "end" ? "auto" : "auto-start-reverse";
    const safeColor = escapeAttr(color);
    // Three fill/stroke modes:
    //   open    — open chevron: fill=none, stroke=color (e.g. Excalidraw "arrow")
    //   outline — hollow shape: fill=white, stroke=color
    //   solid   — filled shape: fill=color
    const fillStroke = geom.open
      ? `fill="none" stroke="${safeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`
      : geom.outline
        ? `fill="#fff" stroke="${safeColor}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"`
        : `fill="${safeColor}" stroke="${safeColor}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"`;
    out.push(
      // markerUnits="userSpaceOnUse" makes width/height explicit pixel
      // values (ARROWHEAD_PX) independent of the element's stroke-width.
      `<marker id="${id}" viewBox="${geom.viewBox}" refX="${refX}" refY="5" markerWidth="${geom.width}" markerHeight="${geom.height}" markerUnits="userSpaceOnUse" orient="${orient}"><path d="${geom.path}" ${fillStroke}/></marker>`,
    );
  }
  return out.join("\n    ");
}

// ── misc ──────────────────────────────────────────────────────────────────

/**
 * Map an Excalidraw colour to an SVG fill/stroke (or `"none"`).
 * @param {string|null|undefined} c Excalidraw colour value.
 * @returns {string} SVG colour string.
 */
function colorOrNone(c) {
  if (!c || c === "transparent") return "none";
  return c;
}

/**
 * Escape a string for safe interpolation into an SVG attribute value.
 * Escapes `&`, `"`, `<` and `>` so attacker-controlled input cannot
 * break out of the surrounding `"..."` and inject extra attributes
 * or markup.
 * @param {string} s Raw string.
 * @returns {string} Escaped string.
 */
export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
/**
 * Escape a string for safe interpolation into SVG text content.
 * @param {string} s Raw string.
 * @returns {string} Escaped string.
 */
export function escapeText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
