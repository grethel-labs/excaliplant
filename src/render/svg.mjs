// Convert an Excalidraw JSON document to a self-contained SVG string.
//
// The Excalidraw renderer emits a flat list of elements with absolute
// positions; SVG needs the same. We translate the subset we actually
// produce: rectangle, ellipse, line, arrow, text. Roughness is dropped
// (we render geometric primitives — readable in README, no rough-style
// wobble needed).
//
// This exists to give the build pipeline a Node-only path from
// PlantUML → SVG without spinning up a headless browser.

const FONT_FAMILY = "Helvetica, Arial, sans-serif";

/**
 * @param {object} doc          Excalidraw JSON document.
 * @param {object} [opts]
 * @param {number} [opts.padding=16]   Extra margin around content.
 * @param {string} [opts.background]   Document background colour.
 * @returns {string} SVG markup.
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
    case "rectangle": return svgRect(el);
    case "ellipse":   return svgEllipse(el);
    case "line":      return svgPolyline(el, false);
    case "arrow":     return svgPolyline(el, true);
    case "text":      return svgText(el);
    default:          return null;
  }
}

function svgRect(el) {
  const fill = colorOrNone(el.backgroundColor);
  const stroke = el.strokeColor || "#000";
  const rx = el.roundness ? 6 : 0;
  return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${rx}" ry="${rx}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${el.strokeWidth || 1.5}"/>`;
}

function svgEllipse(el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = el.width / 2;
  const ry = el.height / 2;
  const fill = colorOrNone(el.backgroundColor);
  const stroke = el.strokeColor || "#000";
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${el.strokeWidth || 1.5}"/>`;
}

function svgPolyline(el, withArrow) {
  const pts = (el.points || []).map(([dx, dy]) => `${el.x + dx},${el.y + dy}`).join(" ");
  const stroke = el.strokeColor || "#000";
  const dash = el.strokeStyle === "dashed" ? `stroke-dasharray="6 4"` : "";
  const startMarker = withArrow && el.startArrowhead ? markerForArrowhead(el.startArrowhead, "start") : "";
  const endMarker   = withArrow && el.endArrowhead   ? markerForArrowhead(el.endArrowhead,   "end")   : "";
  return `<polyline points="${pts}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${el.strokeWidth || 1.5}" ${dash} ${startMarker} ${endMarker}/>`;
}

function svgText(el) {
  const fill = el.strokeColor || "#000";
  const fs = el.fontSize || 16;
  const lineHeight = fs * (el.lineHeight || 1.2);
  const lines = String(el.text ?? "").split("\n");
  const align = el.textAlign || "left";
  const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
  // Excalidraw text x is the box's left edge; baseline depends on align.
  let xRef = el.x;
  if (align === "center") xRef = el.x + (el.width || 0) / 2;
  else if (align === "right") xRef = el.x + (el.width || 0);
  const yTop = el.y + fs;       // first baseline
  const tspans = lines.map((l, i) =>
    `<tspan x="${xRef}" dy="${i === 0 ? 0 : lineHeight}">${escapeText(l)}</tspan>`,
  ).join("");
  return `<text x="${xRef}" y="${yTop}" fill="${escapeAttr(fill)}" font-size="${fs}" text-anchor="${anchor}">${tspans}</text>`;
}

// Arrowhead helpers --------------------------------------------------------

function markerForArrowhead(kind, end) {
  const id = `m_${kind}_${end}`;
  return `marker-${end}="url(#${id})"`;
}

function arrowheadDefs() {
  // Inline definitions so each generated SVG is self-contained.
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

// Misc helpers -------------------------------------------------------------

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
