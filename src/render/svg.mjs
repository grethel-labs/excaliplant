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

const FONT_FAMILY = "Helvetica, Arial, sans-serif";
const ROUGHNESS = 1;            // Excalidraw's default roughness.
const BOWING = 1;
const FILL_WEIGHT = 0;          // 0 → roughjs picks a sensible default.

const generator = rough.generator();

/**
 * Convert an Excalidraw JSON document to a stand-alone SVG string.
 *
 * @param {object} doc           The Excalidraw JSON document.
 * @param {object} [opts]
 * @param {number} [opts.padding=16]    Whitespace around the bounds.
 * @param {string} [opts.background]    Optional background fill colour.
 * @returns {string}             A complete `<svg>...</svg>` document.
 */
export function excalidrawToSvg(doc, opts = {}) {
  const padding = opts.padding ?? 16;
  const elements = (doc.elements || []).filter((e) => !e.isDeleted);
  const bounds = computeBounds(elements);
  const w = Math.max(1, bounds.maxX - bounds.minX) + padding * 2;
  const h = Math.max(1, bounds.maxY - bounds.minY) + padding * 2;
  const tx = -bounds.minX + padding;
  const ty = -bounds.minY + padding;

  const bg = opts.background ?? doc.appState?.viewBackgroundColor ?? "#ffffff";
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT_FAMILY}">`);
  out.push(`<rect width="100%" height="100%" fill="${escapeAttr(bg)}"/>`);
  out.push(`<g transform="translate(${tx} ${ty})">`);
  out.push(arrowheadDefs());

  for (const el of elements) {
    const node = renderOne(el);
    if (node) out.push(node);
  }

  out.push(`</g></svg>`);
  return out.join("\n");
}

function computeBounds(elements) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const include = (x, y) => {
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
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }
  return { minX, minY, maxX, maxY };
}

function renderOne(el) {
  switch (el.type) {
    case "rectangle": return roughRect(el);
    case "ellipse":   return roughEllipse(el);
    case "line":      return roughPolyline(el, false);
    case "arrow":     return roughPolyline(el, true);
    case "text":      return svgText(el);
    default:          return null;
  }
}

// ── roughjs helpers ───────────────────────────────────────────────────────

// Pull a deterministic seed off each Excalidraw element so re-rendering
// the same JSON document yields the same wobble. Excalidraw assigns
// `seed` to every element; if it's missing we fall back to a hash of
// the element's id so output is still deterministic per-document.
function seedFor(el) {
  if (typeof el.seed === "number") return el.seed % 2_147_483_647;
  if (el.id) {
    let h = 0;
    for (const c of String(el.id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h) % 2_147_483_647;
  }
  return 1;
}

function roughOpts(el) {
  return {
    seed: seedFor(el),
    roughness: ROUGHNESS,
    bowing: BOWING,
    stroke: el.strokeColor || "#000",
    strokeWidth: el.strokeWidth || 1.5,
    fill: undefined,
    fillStyle: "solid",
    fillWeight: FILL_WEIGHT,
    disableMultiStroke: false,
  };
}

function dasharray(el) {
  if (el.strokeStyle === "dashed") return "8 4";
  if (el.strokeStyle === "dotted") return "1.5 6";
  return null;
}

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
      const fill = el.backgroundColor && el.backgroundColor !== "transparent"
        ? el.backgroundColor : null;
      if (!fill) continue;
      out.push(
        `<path d="${d}" fill="${escapeAttr(fill)}" stroke="none"/>`,
      );
    } else if (set.type === "path") {
      out.push(
        `<path d="${d}" fill="none" stroke="${escapeAttr(stroke)}" `
        + `stroke-width="${strokeWidth}" stroke-linecap="round" `
        + `stroke-linejoin="round"${dashAttr}/>`,
      );
    }
  }
  return out.join("");
}

function roughRect(el) {
  const fill = colorOrNone(el.backgroundColor);
  // Solid fill underneath. roughjs' fill modes look noisy on small
  // shapes, and Excalidraw's own export uses solid fills + sketchy
  // outlines, so we mirror that.
  const fillSvg = fill !== "none"
    ? `<path d="${rectPath(el)}" fill="${escapeAttr(fill)}" stroke="none"/>`
    : "";
  const drawable = generator.rectangle(
    el.x, el.y, el.width, el.height, roughOpts(el),
  );
  return fillSvg + drawableToSvg(drawable, el);
}

function rectPath(el) {
  const r = el.roundness ? Math.min(8, el.width / 4, el.height / 4) : 0;
  if (!r) {
    return `M${el.x},${el.y} h${el.width} v${el.height} h${-el.width} z`;
  }
  const x = el.x, y = el.y, w = el.width, h = el.height;
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

function roughEllipse(el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const fill = colorOrNone(el.backgroundColor);
  const fillSvg = fill !== "none"
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${el.width / 2}" `
      + `ry="${el.height / 2}" fill="${escapeAttr(fill)}" stroke="none"/>`
    : "";
  const drawable = generator.ellipse(cx, cy, el.width, el.height, roughOpts(el));
  return fillSvg + drawableToSvg(drawable, el);
}

function roughPolyline(el, withArrow) {
  const pts = (el.points || []).map(([dx, dy]) => [el.x + dx, el.y + dy]);
  if (pts.length < 2) return "";
  const drawable = generator.linearPath(pts, roughOpts(el));
  let body = drawableToSvg(drawable, el);

  // Arrowheads: keep the same marker-based mechanism, but apply it to
  // a thin invisible <polyline> so the marker ends up at the geometric
  // endpoint (not a wobble-jittered endpoint of the rough path).
  if (withArrow && (el.startArrowhead || el.endArrowhead)) {
    const polyPts = pts.map(([x, y]) => `${x},${y}`).join(" ");
    const startMarker = el.startArrowhead
      ? ` marker-start="url(#m_${el.startArrowhead}_start)"` : "";
    const endMarker = el.endArrowhead
      ? ` marker-end="url(#m_${el.endArrowhead}_end)"` : "";
    body += `<polyline points="${polyPts}" fill="none" stroke="${escapeAttr(el.strokeColor || "#000")}" stroke-width="0" stroke-opacity="0"${startMarker}${endMarker}/>`;
  }
  return body;
}

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
  const tspans = lines.map((l, i) =>
    `<tspan x="${xRef}" dy="${i === 0 ? 0 : lineHeight}">${escapeText(l)}</tspan>`,
  ).join("");
  return `<text x="${xRef}" y="${yTop}" fill="${escapeAttr(fill)}" font-size="${fs}" text-anchor="${anchor}">${tspans}</text>`;
}

// ── arrowheads ────────────────────────────────────────────────────────────

function arrowheadDefs() {
  return `<defs>
    <marker id="m_arrow_end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker>
    <marker id="m_arrow_start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker>
    <marker id="m_triangle_end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker>
    <marker id="m_triangle_start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#000"/></marker>
    <marker id="m_triangle_outline_end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#fff" stroke="#000"/></marker>
    <marker id="m_triangle_outline_start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#fff" stroke="#000"/></marker>
    <marker id="m_diamond_end" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="10" markerHeight="8" orient="auto"><path d="M0,5 L6,0 L12,5 L6,10 z" fill="#000"/></marker>
    <marker id="m_diamond_start" viewBox="0 0 12 10" refX="1" refY="5" markerWidth="10" markerHeight="8" orient="auto-start-reverse"><path d="M0,5 L6,0 L12,5 L6,10 z" fill="#000"/></marker>
    <marker id="m_diamond_outline_end" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="10" markerHeight="8" orient="auto"><path d="M0,5 L6,0 L12,5 L6,10 z" fill="#fff" stroke="#000"/></marker>
    <marker id="m_diamond_outline_start" viewBox="0 0 12 10" refX="1" refY="5" markerWidth="10" markerHeight="8" orient="auto-start-reverse"><path d="M0,5 L6,0 L12,5 L6,10 z" fill="#fff" stroke="#000"/></marker>
  </defs>`;
}

// ── misc ──────────────────────────────────────────────────────────────────

function colorOrNone(c) {
  if (!c || c === "transparent") return "none";
  return c;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function escapeText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
