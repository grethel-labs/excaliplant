/**
 * Excalidraw JSON → standalone SVG.
 *
 * Sketchy elements (`roughness > 0`) are drawn through roughjs with the same
 * per-element seed Excalidraw uses, so the SVG mirrors what Excalidraw shows.
 * Clean elements (`roughness === 0`) become plain SVG primitives. All text and
 * attribute values are escaped; colours are validated before use.
 * @module render/svg
 */

import rough from "roughjs";
import { excalifontFaceCss } from "./font.mjs";
import { ASCENDER, DESCENDER, UNITS_PER_EM } from "../layout/font_metrics.mjs";

const generator = rough.generator();

/**
 * @typedef {object} SvgOptions
 * @property {number} [padding] Whitespace around the drawing (default 24).
 * @property {string} [background] Background colour (default: document background).
 * @property {boolean} [embedFont] Inline Excalifont as a data URL (default true).
 */

/**
 * Escape text content for XML.
 * @param {string} s
 */
export function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * Validate a colour before it is written into an attribute.
 * @param {unknown} c
 * @param {string} fallback
 */
function color(c, fallback) {
  return typeof c === "string" && /^(#[0-9a-fA-F]{3,8}|transparent)$/.test(c) ? c : fallback;
}

/** @param {number} n */
const num = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

/**
 * Convert an Excalidraw document to SVG markup.
 * @param {import("./excalidraw.mjs").ExcalidrawDocument} doc
 * @param {SvgOptions} [options]
 * @returns {string}
 * @public
 */
export function excalidrawToSvg(doc, options = {}) {
  const padding = Math.max(0, Math.min(1000, options.padding ?? 24));
  const elements = (doc.elements ?? []).filter((e) => !e.isDeleted);
  const b = bounds(elements);
  const w = num(b.w + padding * 2);
  const h = num(b.h + padding * 2);
  const bg = color(options.background ?? doc.appState?.viewBackgroundColor, "#ffffff");
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
  );
  const css = options.embedFont === false ? "" : excalifontFaceCss();
  out.push(`<defs><style>${css}text{font-family:Excalifont,"Segoe UI Emoji",sans-serif;white-space:pre;}</style></defs>`);
  if (bg !== "transparent") out.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>`);
  out.push(`<g transform="translate(${num(padding - b.x)} ${num(padding - b.y)})">`);
  for (const el of elements) out.push(renderElement(el, bg));
  out.push("</g></svg>");
  return out.join("");
}

/**
 * @param {any[]} elements
 */
function bounds(elements) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const e of elements) {
    const pts = e.points ? e.points.map((/** @type {number[]} */ p) => [e.x + p[0], e.y + p[1]]) : [
      [e.x, e.y],
      [e.x + e.width, e.y + e.height],
    ];
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 1, h: 1 };
  // Arrowheads and rough strokes can overshoot slightly.
  return { x: minX - 4, y: minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 };
}

/**
 * @param {any} el
 * @param {string} bg
 */
function renderElement(el, bg) {
  let body = "";
  switch (el.type) {
    case "rectangle":
      body = shape(el, "rect");
      break;
    case "ellipse":
      body = shape(el, "ellipse");
      break;
    case "diamond":
      body = shape(el, "diamond");
      break;
    case "line":
      body = linear(el, bg, false);
      break;
    case "arrow":
      body = linear(el, bg, true);
      break;
    case "text":
      body = text(el);
      break;
    default:
      return "";
  }
  if (!body) return "";
  const opacity = el.opacity < 100 ? ` opacity="${num(el.opacity / 100)}"` : "";
  const link = typeof el.link === "string" && /^(https?:|mailto:)/i.test(el.link) ? el.link : null;
  const g = `<g${opacity}>${body}</g>`;
  return link ? `<a xlink:href="${escapeXml(link)}" href="${escapeXml(link)}">${g}</a>` : g;
}

/**
 * Rough options derived the same way Excalidraw derives them.
 * @param {any} el
 * @param {boolean} filled
 */
function roughOptions(el, filled) {
  const sw = el.strokeWidth;
  /** @type {any} */
  const o = {
    seed: (el.seed >>> 0) % 2147483647 || 1,
    roughness: el.roughness,
    stroke: color(el.strokeColor, "#000000"),
    strokeWidth: el.strokeStyle === "solid" ? sw : sw + 0.5,
    disableMultiStroke: el.strokeStyle !== "solid",
    preserveVertices: el.roughness < 2,
    fillWeight: sw / 2,
    hachureGap: sw * 4,
  };
  if (el.strokeStyle === "dashed") o.strokeLineDash = [8, 8 + sw];
  if (el.strokeStyle === "dotted") o.strokeLineDash = [1.5, 6 + sw];
  const fill = color(el.backgroundColor, "transparent");
  if (filled && fill !== "transparent") {
    o.fill = fill;
    o.fillStyle = el.fillStyle ?? "solid";
  }
  return o;
}

/** @param {any} el */
function dashAttr(el) {
  const sw = el.strokeWidth;
  if (el.strokeStyle === "dashed") return ` stroke-dasharray="8 ${num(8 + sw)}"`;
  if (el.strokeStyle === "dotted") return ` stroke-dasharray="1.5 ${num(6 + sw)}"`;
  return "";
}

/**
 * @param {any} el
 * @param {"rect" | "ellipse" | "diamond"} kind
 */
function shape(el, kind) {
  const { x, y, width: w, height: h } = el;
  const stroke = color(el.strokeColor, "#000000");
  const fill = color(el.backgroundColor, "transparent");
  const r = el.roundness ? Math.min(32, Math.min(w, h) * 0.25) : 0;
  if (el.roughness === 0) {
    const common = `fill="${fill === "transparent" ? "none" : fill}" stroke="${stroke === "transparent" ? "none" : stroke}" stroke-width="${num(el.strokeWidth)}"${dashAttr(el)}`;
    if (kind === "rect") return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(r)}" ${common}/>`;
    if (kind === "ellipse") return `<ellipse cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}" ${common}/>`;
    return `<polygon points="${num(x + w / 2)},${num(y)} ${num(x + w)},${num(y + h / 2)} ${num(x + w / 2)},${num(y + h)} ${num(x)},${num(y + h / 2)}" ${common}/>`;
  }
  const o = roughOptions(el, true);
  if (stroke === "transparent") o.stroke = "none";
  let d;
  if (kind === "rect") {
    d = r
      ? generator.path(
          `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y}`,
          o,
        )
      : generator.rectangle(x, y, w, h, o);
  } else if (kind === "ellipse") {
    d = generator.ellipse(x + w / 2, y + h / 2, w, h, { ...o, curveFitting: 1 });
  } else {
    d = generator.polygon(
      [
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ],
      o,
    );
  }
  return drawable(d);
}

/**
 * Serialise a roughjs drawable into SVG paths.
 * @param {any} d
 */
function drawable(d) {
  return generator
    .toPaths(d)
    .map((p) => {
      const stroke = p.stroke && p.stroke !== "none" ? p.stroke : "none";
      const fill = p.fill && p.fill !== "none" ? p.fill : "none";
      const dash = d.options.strokeLineDash && stroke !== "none" && fill === "none" ? ` stroke-dasharray="${d.options.strokeLineDash.join(" ")}"` : "";
      return `<path d="${p.d}" stroke="${stroke}" stroke-width="${num(p.strokeWidth)}" fill="${fill}"${dash} stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
}

/**
 * Lines and arrows (open or closed polylines, optionally curved).
 * @param {any} el
 * @param {string} bg
 * @param {boolean} isArrow
 */
function linear(el, bg, isArrow) {
  /** @type {[number, number][]} */
  const pts = el.points.map((/** @type {number[]} */ p) => [el.x + p[0], el.y + p[1]]);
  if (pts.length < 2) return "";
  const stroke = color(el.strokeColor, "#000000");
  const fill = color(el.backgroundColor, "transparent");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const closed = !isArrow && pts.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.5;
  const curved = !!el.roundness;
  let out = "";
  if (el.roughness === 0) {
    const d = curved ? smoothPath(pts, closed) : `M ${pts.map((p) => `${num(p[0])} ${num(p[1])}`).join(" L ")}${closed ? " Z" : ""}`;
    const f = closed && fill !== "transparent" ? fill : "none";
    if (stroke !== "transparent" || f !== "none") {
      out += `<path d="${d}" fill="${f}" stroke="${stroke === "transparent" ? "none" : stroke}" stroke-width="${num(el.strokeWidth)}"${dashAttr(el)} stroke-linejoin="round" stroke-linecap="round"/>`;
    }
  } else {
    const o = roughOptions(el, closed);
    if (stroke === "transparent") o.stroke = "none";
    let d;
    if (curved && pts.length > 2) d = closed ? generator.curve(pts, o) : generator.curve(pts, o);
    else if (closed) d = generator.polygon(pts.slice(0, -1), o);
    else d = generator.linearPath(pts, o);
    out += drawable(d);
  }
  if (isArrow) {
    out += arrowhead(el, pts[1], pts[0], el.startArrowhead, bg);
    out += arrowhead(el, pts[pts.length - 2], pts[pts.length - 1], el.endArrowhead, bg);
  }
  return out;
}

/**
 * Catmull-Rom spline through points as cubic Béziers.
 * @param {[number, number][]} pts
 * @param {boolean} closed
 */
function smoothPath(pts, closed) {
  let d = `M ${num(pts[0][0])} ${num(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${num(c1[0])} ${num(c1[1])} ${num(c2[0])} ${num(c2[1])} ${num(p2[0])} ${num(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}

/**
 * Draw an arrowhead at `tip`, pointing away from `from`.
 * @param {any} el
 * @param {[number, number]} from
 * @param {[number, number]} tip
 * @param {string | null} head
 * @param {string} bg
 */
function arrowhead(el, from, tip, head, bg) {
  if (!head) return "";
  const stroke = color(el.strokeColor, "#000000");
  const sw = el.strokeWidth;
  const seg = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const ux = (tip[0] - from[0]) / seg;
  const uy = (tip[1] - from[1]) / seg;
  const nx = -uy;
  const ny = ux;
  const scale = Math.min(1, seg / 30) * (1 + Math.max(0, sw - 2) * 0.15);
  /** @param {number} back @param {number} side @returns {[number, number]} */
  const at = (back, side) => [tip[0] - ux * back * scale + nx * side * scale, tip[1] - uy * back * scale + ny * side * scale];
  const o = { ...roughOptions({ ...el, strokeStyle: "solid", backgroundColor: "transparent" }, false), roughness: Math.min(el.roughness, 0.6) };
  /** @param {[number, number][]} poly @param {string} fill */
  const polygon = (poly, fill) =>
    el.roughness === 0
      ? `<polygon points="${poly.map((p) => `${num(p[0])},${num(p[1])}`).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${num(sw)}" stroke-linejoin="round"/>`
      : drawable(generator.polygon(poly, { ...o, fill, fillStyle: "solid" }));
  /** @param {[number, number][]} poly */
  const polyline = (poly) =>
    el.roughness === 0
      ? `<polyline points="${poly.map((p) => `${num(p[0])},${num(p[1])}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${num(sw)}" stroke-linecap="round" stroke-linejoin="round"/>`
      : drawable(generator.linearPath(poly, o));
  /** @param {[number, number]} c @param {number} r @param {string} fill */
  const circle = (c, r, fill) =>
    el.roughness === 0
      ? `<circle cx="${num(c[0])}" cy="${num(c[1])}" r="${num(r * scale)}" fill="${fill}" stroke="${stroke}" stroke-width="${num(sw)}"/>`
      : drawable(generator.circle(c[0], c[1], r * 2 * scale, { ...o, fill, fillStyle: "solid" }));
  switch (head) {
    case "arrow":
      return polyline([at(16, -8), tip, at(16, 8)]);
    case "triangle":
      return polygon([tip, at(16, -8), at(16, 8)], stroke);
    case "triangle_outline":
      return polygon([tip, at(18, -9), at(18, 9)], bg);
    case "diamond":
      return polygon([tip, at(10, -7), at(20, 0), at(10, 7)], stroke);
    case "diamond_outline":
      return polygon([tip, at(10, -7), at(20, 0), at(10, 7)], bg);
    case "dot":
    case "circle":
      return circle(at(6, 0), 6, stroke);
    case "circle_outline":
      return circle(at(6, 0), 6, bg);
    case "bar":
      return polyline([at(0, -9), at(0, 9)]);
    case "crowfoot_one":
      return polyline([at(8, -8), at(8, 8)]);
    case "crowfoot_many":
      return polyline([at(0, -9), at(14, 0), at(0, 9)]);
    case "crowfoot_one_or_many":
      return polyline([at(0, -9), at(14, 0), at(0, 9)]) + polyline([at(18, -9), at(18, 9)]);
    default:
      return "";
  }
}

/**
 * Text element with per-line positioning matching Excalidraw's baseline maths.
 * @param {any} el
 */
function text(el) {
  const size = el.fontSize;
  const lh = size * (el.lineHeight ?? 1.25);
  const em = size / UNITS_PER_EM;
  const gap = lh - em * ASCENDER + em * DESCENDER;
  const baseline = em * ASCENDER + gap / 2;
  const anchor = el.textAlign === "center" ? "middle" : el.textAlign === "right" ? "end" : "start";
  const ax = el.textAlign === "center" ? el.width / 2 : el.textAlign === "right" ? el.width : 0;
  const fill = color(el.strokeColor, "#000000");
  const bold = el.customData?.bold === true;
  const italic = el.customData?.italic === true;
  const family = el.fontFamily === 8 ? ` font-family="'Comic Shanns','Cascadia Code',ui-monospace,monospace"` : "";
  const weight = bold ? ` stroke="${fill}" stroke-width="${num(size / 30)}" paint-order="stroke"` : "";
  const lines = String(el.text ?? "").split("\n");
  const tspans = lines
    .map((line, i) => `<text x="${num(ax)}" y="${num(baseline + i * lh)}" xml:space="preserve" font-size="${num(size)}" fill="${fill}" text-anchor="${anchor}"${family}${weight}>${escapeXml(line)}</text>`)
    .join("");
  const transform = italic ? `translate(${num(el.x)} ${num(el.y)}) skewX(-10) translate(${num(lh * 0.15)} 0)` : `translate(${num(el.x)} ${num(el.y)})`;
  return `<g transform="${transform}">${tspans}</g>`;
}
