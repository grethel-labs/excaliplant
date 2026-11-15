/**
 * Draw a laid-out graph model onto the canvas.
 * @module diagrams/graph/draw
 */

import { shape as shapeDef, arc } from "../../draw/shapes.mjs";
import { roleStyle } from "../../draw/theme.mjs";
import { TRANSPARENT, mixColors } from "../../syntax/color.mjs";
import { Obstacles, alongPolyline, nearEnd, segmentInBox } from "../../layout/labels.mjs";

/** @typedef {import("../../model/graph.mjs").GraphModel} GraphModel */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */
/** @typedef {import("../../draw/canvas.mjs").Canvas} Canvas */

const VISIBILITY = {
  "+": { shape: "circle", color: "#2f9e44", filled: true },
  "-": { shape: "square", color: "#c92a2a", filled: false },
  "#": { shape: "diamond", color: "#e67700", filled: true },
  "~": { shape: "triangle", color: "#1971c2", filled: false },
};

/**
 * @param {GraphModel} model
 * @param {Canvas} canvas
 */
export function drawGraph(model, canvas) {
  const theme = canvas.theme;
  /** @type {Map<string, string>} */
  const ids = new Map();
  const nodes = [...model.nodes.values()].filter((n) => !n.hidden && !n.removed);
  nodes.sort((a, b) => Number(b.container) - Number(a.container) || a.depth - b.depth);

  // Everything labels must keep clear of: nodes, connector lines and their heads.
  const obstacles = new Obstacles();
  for (const n of nodes) {
    if (!n.container)
      obstacles.addBox(
        { x: n.x, y: n.y, w: n.width, h: n.height },
        { weight: 3, owner: `node:${n.id}` },
      );
  }
  /** @type {{ edge: import("../../model/graph.mjs").GraphEdge, from: GraphNode, to: GraphNode, pts: [number, number][] }[]} */
  const visible = [];
  for (const edge of model.edges) {
    if (edge.hidden || edge.points.length < 2) continue;
    const from = model.nodes.get(edge.from);
    const to = model.nodes.get(edge.to);
    if (!from || !to || from.hidden || to.hidden) continue;
    /** @type {[number, number][]} */
    const pts = edge.points.map((p) => [p[0], p[1]]);
    pts[0] = clip(pts[0], pts[1], from);
    pts[pts.length - 1] = clip(pts[pts.length - 1], pts[pts.length - 2], to);
    visible.push({ edge, from, to, pts });
    obstacles.addPolyline(pts, { owner: edge.id });
    if (edge.startHead) obstacles.addHead(pts[0], pts[1]);
    if (edge.endHead) obstacles.addHead(pts[pts.length - 1], pts[pts.length - 2]);
  }

  /** @type {(() => void)[]} */
  const headers = [];
  for (const node of nodes) {
    const id = canvas.group(() => drawNode(node, canvas, theme, headers));
    if (id) ids.set(node.id, id);
  }
  for (const v of visible) drawEdge(v.edge, v.from, v.to, canvas, ids, v.pts, obstacles);
  // Container titles last: placed where lines cross least, drawn above the lines.
  for (const draw of headers) draw.call(null, obstacles);
}

/**
 * Resolve node style from role, colour spec and theme.
 * @param {GraphNode} node
 * @param {import("../../draw/theme.mjs").Theme} theme
 */
export function nodeStyle(node, theme) {
  const c = node.colors;
  return roleStyle(theme, node.role, {
    fill: c.fill,
    stroke: c.stroke,
    text: c.text,
    strokeStyle: c.strokeStyle,
    strokeWidth: c.strokeWidth,
  });
}

/**
 * @param {GraphNode} node
 * @param {Canvas} canvas
 * @param {import("../../draw/theme.mjs").Theme} theme
 * @param {((obstacles: Obstacles) => void)[] | null} [headers] Deferred container titles.
 * @returns {string | null} Bindable element id.
 */
export function drawNode(node, canvas, theme, headers = null) {
  const s = nodeStyle(node, theme);
  const style = {
    stroke: s.stroke,
    fill: s.fill,
    strokeWidth: s.strokeWidth,
    strokeStyle: s.strokeStyle,
    link: node.link,
  };
  const { x, y, width: w, height: h } = node;
  const geo = node.data.geo;
  if (node.data.draw) return node.data.draw(canvas, node, style, s);
  if (geo?.kind === "container") {
    // Containers get a light tint so nested elements stay readable.
    const fill =
      node.colors.fill ??
      (s.fill === TRANSPARENT ? TRANSPARENT : mixColors(s.fill, theme.background, 0.6));
    return drawContainer(node, canvas, { ...style, fill }, s.text, headers);
  }
  if (geo?.kind === "class") return drawClass(node, canvas, style, s.text, theme);
  const def = shapeDef(node.shape);
  if (geo?.placement === "below") {
    const [iw, ih] = geo.icon;
    const id = def.draw(canvas, x + (w - iw) / 2, y, iw, ih, style);
    let ty = y + ih + 6;
    for (const b of geo.blocks) {
      canvas.richText(b, x + (w - b.width) / 2, ty, { color: s.text });
      ty += b.height + 4;
    }
    return id;
  }
  const id =
    node.shape === "port" ? canvas.rect(x, y, w, h, style) : def.draw(canvas, x, y, w, h, style);
  if (geo?.blocks?.length) {
    const [pt, pr, pb, pl] = def.pad;
    const innerW = w - pl - pr;
    const innerH = h - pt - pb;
    let ty = y + pt + Math.max(0, (innerH - geo.textHeight) / 2);
    const left = node.shape === "note";
    for (const b of geo.blocks) {
      const bx = left ? x + pl : x + pl + (innerW - b.width) / 2;
      canvas.richText(b, bx, ty, { color: s.text, align: left ? "left" : "center" });
      ty += b.height + 4;
    }
  }
  return id;
}

/**
 * @param {GraphNode} node
 * @param {Canvas} canvas
 * @param {import("../../draw/canvas.mjs").Style} style
 * @param {string} textColor
 */
function drawContainer(node, canvas, style, textColor, headers = null) {
  const { x, y, width: w, height: h } = node;
  const geo = node.data.geo;
  const def = shapeDef(node.shape === "package" ? "rectangle" : node.shape);
  let id;
  if (node.shape === "package" || node.shape === "folder") {
    const tabW = Math.min(w * 0.6, geo.minWidth);
    const tabH = geo.headerHeight;
    canvas.line(
      [
        [x, y + tabH],
        [x, y],
        [x + tabW - 8, y],
        [x + tabW, y + tabH],
      ],
      { ...style, closed: true },
    );
    id = canvas.rect(x, y + tabH, w, h - tabH, style);
    const drawTab = (/** @type {Obstacles | null} */ obstacles) => {
      const bw = Math.max(0, ...geo.blocks.map((/** @type {any} */ b) => b.width));
      const bh = geo.blocks.reduce(
        (/** @type {number} */ sum, /** @type {any} */ b) => sum + b.height,
        0,
      );
      const box = { x: x + 8, y: y + 5, w: bw + 8, h: bh + 4 };
      if (obstacles?.segments.some((sg) => segmentInBox(sg.a, sg.b, box) > 0)) {
        canvas.rect(box.x, box.y, box.w, box.h, {
          fill: canvas.theme.background,
          stroke: TRANSPARENT,
          strokeWidth: 1,
          roughness: 0,
          opacity: 85,
        });
      }
      let ty = y + 7;
      for (const b of geo.blocks) {
        canvas.richText(b, x + 12, ty, { color: textColor, align: "left" });
        ty += b.height;
      }
    };
    if (headers) headers.push(drawTab);
    else drawTab(null);
    return id;
  }
  id = def.draw(canvas, x, y, w, h, style);
  let ty = y + 8 + (node.shape === "node" ? 10 : 0) + (node.shape === "cloud" ? 14 : 0);
  if (node.shape === "frame") {
    const lw = Math.max(...geo.blocks.map((/** @type {any} */ b) => b.width)) + 20;
    const lh =
      geo.blocks.reduce((/** @type {number} */ s, /** @type {any} */ b) => s + b.height, 0) + 8;
    canvas.line(
      [
        [x, y + lh],
        [x + lw, y + lh],
        [x + lw + 8, y + lh - 8],
        [x + lw + 8, y],
      ],
      { ...style, fill: undefined },
    );
    for (const b of geo.blocks) {
      canvas.richText(b, x + 10, ty - 4, { color: textColor, align: "left" });
      ty += b.height;
    }
    return id;
  }
  const top = ty;
  const drawTitle = (/** @type {Obstacles | null} */ obstacles) => {
    const bw = Math.max(0, ...geo.blocks.map((/** @type {any} */ b) => b.width));
    const bh = geo.blocks.reduce(
      (/** @type {number} */ sum, /** @type {any} */ b) => sum + b.height,
      0,
    );
    // Prefer the centre, then the corners, whichever is crossed by fewest lines.
    const xs = [x + (w - bw) / 2, x + 14, x + w - bw - 14];
    const box = obstacles
      ? obstacles.place(
          xs.map((cx, i) => ({ x: cx - 4, y: top - 2, w: bw + 8, h: bh + 4, penalty: i * 30 })),
          { owner: `title:${node.id}` },
        )
      : { x: xs[0] - 4, y: top - 2, w: bw + 8, h: bh + 4 };
    // A plate only where a line actually runs behind the title.
    const crossed = obstacles
      ? obstacles.segments.some((sg) => segmentInBox(sg.a, sg.b, box) > 0)
      : false;
    if (crossed) {
      canvas.rect(box.x, box.y, box.w, box.h, {
        fill: canvas.theme.background,
        stroke: TRANSPARENT,
        strokeWidth: 1,
        roughness: 0,
        opacity: 85,
      });
    }
    let cy = top;
    for (const b of geo.blocks) {
      canvas.richText(b, box.x + 4 + (bw - b.width) / 2, cy, { color: textColor });
      cy += b.height;
    }
  };
  if (headers) headers.push(drawTitle);
  else drawTitle(null);
  if (node.role === "compositeState") {
    canvas.line(
      [
        [x, y + geo.headerHeight],
        [x + w, y + geo.headerHeight],
      ],
      { stroke: style.stroke, strokeWidth: 1 },
    );
  }
  return id;
}

/**
 * @param {GraphNode} node
 * @param {Canvas} canvas
 * @param {import("../../draw/canvas.mjs").Style} style
 * @param {string} textColor
 * @param {import("../../draw/theme.mjs").Theme} theme
 */
function drawClass(node, canvas, style, textColor, theme) {
  const { x, y, width: w, height: h } = node;
  /** @type {import("./layout.mjs").ClassGeo} */
  const geo = node.data.geo;
  const id = canvas.rect(x, y, w, h, style);
  const thin = { stroke: style.stroke, strokeWidth: 1 };
  // header
  const nameBlockW = geo.name.width + (geo.spot ? 30 : 0);
  let ty = y + 7;
  if (geo.stereo) {
    canvas.richText(geo.stereo, x + (w - geo.stereo.width) / 2 + (geo.spot ? 14 : 0), ty, {
      color: textColor,
    });
    ty += geo.stereo.height;
  }
  const nx = x + (w - nameBlockW) / 2 + (geo.spot ? 30 : 0);
  if (geo.spot) {
    const cy = ty + geo.name.height / 2;
    canvas.ellipse(nx - 30, cy - 11, 22, 22, {
      fill: geo.spot.color,
      stroke: theme.ink,
      strokeWidth: 1,
      roughness: Math.min(theme.roughness, 0.5),
    });
    canvas.text(geo.spot.char, nx - 19, cy - 9, { size: 14, color: "#ffffff", align: "center" });
  }
  const italic = node.classHeader?.abstract || node.classHeader?.keyword === "interface";
  if (geo.name.plain) {
    canvas.text(geo.name.text, nx, ty, {
      size: geo.name.fontSize,
      color: textColor,
      bold: true,
      italic,
      width: geo.name.width,
    });
  } else canvas.richText(geo.name, nx, ty, { color: textColor, align: "left" });
  if (node.keyword === "object" || node.keyword === "map") {
    canvas.line(
      [
        [nx, ty + geo.name.height - 1],
        [nx + geo.name.width, ty + geo.name.height - 1],
      ],
      thin,
    );
  }
  if (geo.generics) {
    const gw = geo.generics.width + 10;
    const gh = geo.generics.height + 4;
    canvas.rect(x + w - gw + 6, y - gh / 2, gw, gh, {
      fill: theme.background,
      stroke: style.stroke,
      strokeStyle: "dashed",
      strokeWidth: 1,
    });
    canvas.richText(geo.generics, x + w - gw + 11, y - gh / 2 + 2, { color: textColor });
  }
  let cy = y + geo.headerHeight;
  for (const comp of geo.compartments) {
    canvas.line(
      [
        [x, cy],
        [x + w, cy],
      ],
      { ...thin, strokeStyle: comp.separator === "dotted" ? "dotted" : "solid" },
    );
    if (comp.separator === "double") {
      canvas.line(
        [
          [x, cy + 3],
          [x + w, cy + 3],
        ],
        thin,
      );
    }
    let ry = cy + 5;
    if (comp.title) {
      canvas.richText(comp.title, x + (w - comp.title.width) / 2, ry, { color: textColor });
      ry += comp.title.height + 4;
    }
    for (const row of comp.rows) {
      let rx = x + 10;
      const vis = row.member.visibility ? VISIBILITY[row.member.visibility] : null;
      if (vis) {
        drawVisibility(canvas, vis, rx + 4, ry + row.text.height / 2, theme);
        rx += 16;
      }
      const t = row.text;
      if (t.plain) {
        canvas.text(t.text, rx, ry, {
          size: t.fontSize,
          color: textColor,
          italic: row.member.isAbstract,
          width: t.width,
        });
      } else canvas.richText(t, rx, ry, { color: textColor, align: "left" });
      if (row.member.isStatic) {
        canvas.line(
          [
            [rx, ry + t.height - 2],
            [rx + t.width, ry + t.height - 2],
          ],
          { stroke: textColor, strokeWidth: 1, roughness: 0 },
        );
      }
      ry += t.height;
    }
    cy += comp.height;
  }
  if (geo.table) {
    for (const row of geo.table) {
      canvas.line(
        [
          [x, cy],
          [x + w, cy],
        ],
        thin,
      );
      const rh = Math.max(row.key.height, row.value.height) + 6;
      canvas.richText(row.key, x + 8, cy + 3, { color: textColor, align: "left" });
      canvas.richText(row.value, x + geo.tableKeyWidth + 8, cy + 3, {
        color: textColor,
        align: "left",
      });
      canvas.line(
        [
          [x + geo.tableKeyWidth, cy],
          [x + geo.tableKeyWidth, cy + rh],
        ],
        thin,
      );
      cy += rh;
    }
  }
  return id;
}

/**
 * @param {Canvas} canvas
 * @param {{ shape: string, color: string, filled: boolean }} vis
 * @param {number} cx
 * @param {number} cy
 * @param {import("../../draw/theme.mjs").Theme} theme
 */
function drawVisibility(canvas, vis, cx, cy, theme) {
  const style = {
    stroke: vis.color,
    fill: vis.filled ? vis.color : TRANSPARENT,
    strokeWidth: 1,
    roughness: 0,
  };
  void theme;
  if (vis.shape === "circle") canvas.ellipse(cx - 4, cy - 4, 8, 8, style);
  else if (vis.shape === "square") canvas.rect(cx - 4, cy - 4, 8, 8, style);
  else if (vis.shape === "diamond") canvas.diamond(cx - 5, cy - 5, 10, 10, style);
  else
    canvas.line(
      [
        [cx, cy - 5],
        [cx + 5, cy + 4],
        [cx - 5, cy + 4],
      ],
      { ...style, closed: true },
    );
}

/**
 * Move a route endpoint from the bounding box onto curved outlines.
 * @param {[number, number]} p Endpoint on the bounding box.
 * @param {[number, number]} q Neighbour point.
 * @param {GraphNode} node
 * @returns {[number, number]}
 */
function clip(p, q, node) {
  const geo = node.data.geo;
  if (geo?.placement === "below") {
    // Horizontal approaches at icon height attach to the icon, not the label block.
    const [iw, ih] = geo.icon;
    const left = node.x + (node.width - iw) / 2;
    if (Math.abs(p[1] - q[1]) < 0.01 && p[1] <= node.y + ih)
      return [q[0] < p[0] ? left : left + iw, p[1]];
    return p;
  }
  const round =
    node.shape === "usecase" ||
    node.shape === "circle" ||
    node.shape === "diamond" ||
    node.data.round;
  if (!round) return p;
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const rx = node.width / 2;
  const ry = node.height / 2;
  const dx = p[0] - q[0];
  const dy = p[1] - q[1];
  if (Math.abs(dx) < 0.01 && Math.abs(dy) > 0) {
    const t = (p[0] - cx) / rx;
    const off =
      node.shape === "diamond" ? ry * (1 - Math.abs(t)) : ry * Math.sqrt(Math.max(0, 1 - t * t));
    return [p[0], dy > 0 ? cy - off : cy + off];
  }
  if (Math.abs(dy) < 0.01 && Math.abs(dx) > 0) {
    const t = (p[1] - cy) / ry;
    const off =
      node.shape === "diamond" ? rx * (1 - Math.abs(t)) : rx * Math.sqrt(Math.max(0, 1 - t * t));
    return [dx > 0 ? cx - off : cx + off, p[1]];
  }
  return p;
}

/**
 * @param {import("../../model/graph.mjs").GraphEdge} edge
 * @param {GraphNode} from
 * @param {GraphNode} to
 * @param {Canvas} canvas
 * @param {Map<string, string>} ids
 */
export function drawEdge(edge, from, to, canvas, ids, points = null, obstacles = null) {
  const theme = canvas.theme;
  const s = roleStyle(theme, edge.role === "note" ? "edge" : edge.role, {
    stroke: edge.color ?? undefined,
  });
  /** @type {[number, number][]} */
  const pts = points ?? edge.points.map((p) => [p[0], p[1]]);
  if (!points && pts.length >= 2) {
    pts[0] = clip(pts[0], pts[1], from);
    pts[pts.length - 1] = clip(pts[pts.length - 1], pts[pts.length - 2], to);
  }
  const strokeWidth =
    edge.thickness ?? (edge.bold ? s.strokeWidth * 1.8 : edge.role === "note" ? 1 : s.strokeWidth);
  canvas.arrow(pts, {
    start: edge.startHead,
    end: edge.endHead,
    stroke: s.stroke,
    strokeWidth,
    strokeStyle: edge.lineStyle,
    from: ids.get(from.id) ?? null,
    to: ids.get(to.id) ?? null,
  });
  const labelStyle = roleStyle(theme, "edgeLabel");
  if (edge.labelBox && edge.data.labelLayout) {
    const elk = edge.labelBox;
    const placed = obstacles
      ? obstacles.place(
          alongPolyline(pts, elk.width, elk.height, {
            preferred: { x: elk.x, y: elk.y, w: elk.width, h: elk.height },
          }),
          { owner: edge.id },
        )
      : { x: elk.x, y: elk.y, w: elk.width, h: elk.height };
    const b = { x: placed.x, y: placed.y, width: placed.w, height: placed.h };
    const laid = edge.data.labelLayout;
    canvas.group(() => {
      canvas.rect(b.x, b.y, b.width, b.height, {
        fill: theme.background,
        stroke: TRANSPARENT,
        strokeWidth: 1,
        roughness: 0,
        opacity: 85,
      });
      const arrowW = edge.data.labelArrow ? 14 : 0;
      const tx = b.x + (b.width - laid.width - arrowW) / 2;
      canvas.richText(laid, tx + (edge.data.labelArrow === "<" ? arrowW : 0), b.y + 1, {
        color: edge.color ?? labelStyle.text,
      });
      if (edge.data.labelArrow) {
        const ax = edge.data.labelArrow === ">" ? tx + laid.width + 4 : tx;
        const cy = b.y + b.height / 2;
        const tip = edge.data.labelArrow === ">" ? ax + 8 : ax;
        const back = edge.data.labelArrow === ">" ? ax : ax + 8;
        canvas.line(
          [
            [back, cy - 4],
            [tip, cy],
            [back, cy + 4],
          ],
          {
            closed: true,
            fill: labelStyle.text,
            stroke: labelStyle.text,
            strokeWidth: 1,
            roughness: 0,
          },
        );
      }
    });
  }
  for (const which of /** @type {const} */ (["fromLabel", "toLabel"])) {
    const laid = edge.data[`${which}Layout`];
    if (!laid || pts.length < 2) continue;
    const atStart = which === "fromLabel";
    const tip = atStart ? pts[0] : pts[pts.length - 1];
    const prev = atStart ? pts[1] : pts[pts.length - 2];
    const w = laid.width + 4;
    const h = laid.height;
    // Beside the line, beyond the arrowhead, away from other labels and lines.
    const box = obstacles
      ? obstacles.place(nearEnd(tip, prev, w, h), { owner: edge.id })
      : (() => {
          const b = edge[`${which}Box`];
          return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
        })();
    if (box) canvas.richText(laid, box.x + 2, box.y, { color: labelStyle.text });
  }
}

export { arc };
