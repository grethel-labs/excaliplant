/**
 * State diagrams: simple and composite states, concurrent regions,
 * pseudo-states (`[*]`, choice, fork/join, history, entry/exit points),
 * descriptions and notes. Layout and edge drawing reuse the graph engine.
 * @module diagrams/state
 */

import { graphModule } from "../graph/module.mjs";
import { declare, ensureNode, parseNameAlias } from "../graph/parse.mjs";
import { parseLink, headsOf } from "../../syntax/arrows.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { label, takeStereotypes, takeColor, takeBlockOpen } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { score } from "../detect.mjs";

/** @typedef {import("../graph/parse.mjs").GraphContext} GraphContext */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */

/** Pseudo-state stereotypes → fixed sizes and drawing. */
const PSEUDO = new Map(
  Object.entries({
    start: [22, 22],
    end: [26, 26],
    choice: [26, 26],
    fork: [90, 8],
    join: [90, 8],
    history: [26, 26],
    "history*": [26, 26],
    entrypoint: [16, 16],
    exitpoint: [16, 16],
    inputpin: [14, 14],
    outputpin: [14, 14],
    expansioninput: [36, 14],
    expansionoutput: [36, 14],
    sdlreceive: [80, 36],
  }),
);

const STATE_KIND = { shape: "rounded", role: "state" };

/**
 * @param {GraphContext} ctx
 * @returns {GraphNode | null}
 */
function parentOf(ctx) {
  for (let i = ctx.stack.length - 1; i >= 0; i--) if (ctx.stack[i]) return ctx.stack[i];
  return null;
}

/**
 * Make a node a pseudo-state.
 * @param {GraphNode} node
 * @param {string} kind
 */
function makePseudo(node, kind) {
  const size = PSEUDO.get(kind) ?? [22, 22];
  node.data.pseudo = kind;
  node.data.fixed = size;
  node.role = "pseudo";
  node.shape = kind === "choice" ? "diamond" : "circle";
  node.data.round = kind !== "fork" && kind !== "join";
  node.data.draw = drawPseudo;
}

/**
 * Resolve `[*]`, `[H]`, `[H*]` relative to the current container.
 * @param {GraphContext} ctx
 * @param {string} token
 * @param {"source" | "target"} side
 */
function endpoint(ctx, token, side) {
  const t = token.trim();
  const parent = parentOf(ctx);
  const scope = parent ? parent.id : "root";
  if (t === "[*]") {
    const kind = side === "source" ? "start" : "end";
    const id = `__${kind}_${scope}`;
    let node = ctx.model.find(id);
    if (!node) {
      node = ctx.model.add(id, { label: "", parent, keyword: "state" });
      makePseudo(node, kind);
    }
    return node;
  }
  const hist = /^(?:(.+)\[(H\*?)\]|\[(H\*?)\])$/.exec(t);
  if (hist) {
    const owner = hist[1] ? ctx.model.find(hist[1]) : parent;
    const deep = (hist[2] ?? hist[3]) === "H*";
    const id = `__hist${deep ? "deep" : ""}_${owner?.id ?? "root"}`;
    let node = ctx.model.find(id);
    if (!node) {
      node = ctx.model.add(id, { label: deep ? "H*" : "H", parent: owner ?? null, keyword: "state" });
      makePseudo(node, deep ? "history*" : "history");
    }
    return node;
  }
  const node = ensureNode(ctx, t, "state");
  if (!node.parent && parent && node.id !== parent.id && !ctx.model.edges.some((e) => e.from === node.id || e.to === node.id)) {
    ctx.model.reparent(node, parent);
  }
  return node;
}

/** @type {import("../../syntax/reader.mjs").Rule<GraphContext>[]} */
const RULES = [
  // closing a composite also closes its open region
  (line, ctx) => {
    if (!/^}\s*$/.test(line)) return false;
    const top = ctx.stack.pop();
    if (top?.data.region) ctx.stack.pop();
    return true;
  },
  // state declarations
  (line, ctx) => {
    const m = /^state\s+(.*)$/i.exec(line);
    if (!m) return false;
    let rest = m[1];
    const block = takeBlockOpen(rest);
    rest = block.rest;
    /** @type {string | null} */
    let description = null;
    const colon = /^(.*?)\s*:\s*(.*)$/.exec(rest);
    if (colon && !/^"[^"]*:/.test(rest)) {
      rest = colon[1];
      description = colon[2];
    }
    const st = takeStereotypes(rest);
    const col = takeColor(st.rest);
    const named = parseNameAlias(col.rest);
    if (!named) return false;
    const node = declare(
      ctx,
      {
        keyword: "state",
        id: named.id,
        label: named.label,
        stereotypes: [],
        colors: parseColorSpec(col.color),
        link: null,
        opensBlock: block.opens,
        opensDescription: false,
        description: "",
        rest: "",
      },
      STATE_KIND,
    );
    const pseudo = st.stereotypes.map((s) => s.toLowerCase()).find((s) => PSEUDO.has(s));
    if (pseudo) makePseudo(node, pseudo);
    else node.stereotypes.push(...st.stereotypes);
    if (description) node.description = node.description ? `${node.description}\n${label(description)}` : label(description);
    if (block.opens) {
      node.container = true;
      node.role = "compositeState";
      ctx.stack.push(node);
      node.data.regions = 0;
    }
    return true;
  },
  // concurrent region separators inside composite states
  (line, ctx) => {
    if (!/^(--|\|\|)$/.test(line)) return false;
    const parent = parentOf(ctx);
    if (!parent) return true;
    splitRegion(ctx, parent, line === "||");
    return true;
  },
  // transitions with [*] / [H] endpoints
  (line, ctx) => {
    const link = parseLink(line);
    if (!link) return false;
    const from = endpoint(ctx, link.from, "source");
    const to = endpoint(ctx, link.to, "target");
    const heads = headsOf(link.arrow);
    ctx.lastEdge = ctx.model.connect(from.id, to.id, {
      startHead: heads.start,
      endHead: heads.end ?? (heads.start ? null : "arrow"),
      lineStyle: link.arrow.lineStyle,
      bold: link.arrow.bold,
      hidden: link.arrow.hidden,
      color: link.arrow.color,
      label: link.label ? label(link.label) : null,
      direction: link.arrow.direction,
      length: link.arrow.length,
    });
    return true;
  },
  // `State : description`
  (line, ctx) => {
    const m = /^([\w.]+|"[^"]+")\s*:\s*(.*)$/.exec(line);
    if (!m) return false;
    const node = ensureNode(ctx, m[1], "state");
    node.description = node.description ? `${node.description}\n${label(m[2])}` : label(m[2]);
    return true;
  },
];

/**
 * Close the current region of a composite state and start a new one. The
 * first split moves existing children into region 0.
 * @param {GraphContext} ctx
 * @param {GraphNode} parent
 * @param {boolean} horizontal
 */
function splitRegion(ctx, parent, horizontal) {
  const { model } = ctx;
  const host = parent.data.region ? /** @type {GraphNode} */ (parent.parent) : parent;
  if (!host.data.regionized) {
    host.data.regionized = true;
    host.data.horizontalRegions = horizontal;
    const first = model.add(`${host.id}__r0`, { label: "", parent: host, keyword: "region" });
    first.container = true;
    first.data.region = true;
    for (const child of host.children.slice()) if (child !== first) model.reparent(child, first);
    ctx.stack.push(first);
  }
  const n = host.children.filter((c) => c.data.region).length;
  const region = model.add(`${host.id}__r${n}`, { label: "", parent: host, keyword: "region" });
  region.container = true;
  region.data.region = true;
  // Replace the innermost region on the stack.
  if (ctx.stack[ctx.stack.length - 1]?.data.region) ctx.stack.pop();
  ctx.stack.push(region);
}

/**
 * Draw pseudo-states.
 * @param {import("../../draw/canvas.mjs").Canvas} c
 * @param {GraphNode} n
 * @param {import("../../draw/canvas.mjs").Style} style
 * @param {any} s
 */
function drawPseudo(c, n, style, s) {
  const { x, y, width: w, height: h } = n;
  const ink = c.theme.ink;
  const solid = { stroke: ink, fill: ink, fillStyle: /** @type {const} */ ("solid") };
  switch (n.data.pseudo) {
    case "start":
      return c.ellipse(x, y, w, h, solid);
    case "end": {
      const id = c.ellipse(x, y, w, h, { stroke: ink, fill: c.theme.background });
      c.ellipse(x + 6, y + 6, w - 12, h - 12, solid);
      return id;
    }
    case "choice":
      return c.diamond(x, y, w, h, { ...style, fill: s.fill === "transparent" ? c.theme.background : c.theme.roles.decision.fill });
    case "fork":
    case "join":
      return c.rect(x, y, w, h, { ...solid, strokeWidth: 1 });
    case "history":
    case "history*": {
      const id = c.ellipse(x, y, w, h, { stroke: ink, fill: c.theme.background });
      c.text(n.data.pseudo === "history" ? "H" : "H*", x + w / 2, y + 3, { size: 14, align: "center" });
      return id;
    }
    case "exitpoint": {
      const id = c.ellipse(x, y, w, h, { stroke: ink, fill: c.theme.background });
      c.line(
        [
          [x + 3, y + 3],
          [x + w - 3, y + h - 3],
        ],
        { stroke: ink, strokeWidth: 1.5 },
      );
      c.line(
        [
          [x + w - 3, y + 3],
          [x + 3, y + h - 3],
        ],
        { stroke: ink, strokeWidth: 1.5 },
      );
      return id;
    }
    default:
      return c.rect(x, y, w, h, { stroke: ink, fill: c.theme.background });
  }
}

/**
 * Simple states: rounded box, name, separator and description.
 * @param {import("../../draw/canvas.mjs").Canvas} c
 * @param {GraphNode} n
 * @param {import("../../draw/canvas.mjs").Style} style
 * @param {any} s
 */
function drawState(c, n, style, s) {
  const { x, y, width: w, height: h } = n;
  const { name, desc } = n.data.stateText;
  const id = c.rect(x, y, w, h, { ...style, rounded: true });
  c.richText(name, x + (w - name.width) / 2, y + 8, { color: s.text });
  if (desc) {
    const ly = y + name.height + 14;
    c.line(
      [
        [x, ly],
        [x + w, ly],
      ],
      { stroke: style.stroke, strokeWidth: 1 },
    );
    c.richText(desc, x + 12, ly + 6, { color: s.text, align: "left" });
  }
  return id;
}

export default graphModule({
  kind: "state",
  title: "State diagram",
  keywords: [
    ["state", STATE_KIND],
    ["note", { shape: "note", role: "note" }],
  ],
  implicit: (token) => ({ id: token.replace(/^"|"$/g, ""), label: token.replace(/^"|"$/g, ""), keyword: "state" }),
  rules: RULES,
  finish: (model, ctx) => {
    const fs = ctx.module.theme.fontSize;
    for (const n of model.nodes.values()) {
      if (n.data.region) {
        n.role = "compositeState";
        n.colors = { stroke: ctx.module.theme.muted, strokeStyle: "dashed", fill: "transparent" };
        n.data.draw = (/** @type {any} */ c, /** @type {GraphNode} */ r, /** @type {any} */ st) =>
          c.rect(r.x, r.y, r.width, r.height, { ...st, strokeWidth: 1, strokeStyle: "dashed", fill: "transparent" });
        continue;
      }
      if (n.data.pseudo || n.shape === "note") continue;
      if (n.container) {
        if (n.description) n.label = `${n.label}\n${n.description}`;
        n.description = "";
        n.shape = "rounded";
        continue;
      }
      const name = layoutText(n.label, { fontSize: fs, bold: true });
      const desc = n.description ? layoutText(n.description, { fontSize: fs * 0.85, align: "left", maxWidth: 320 }) : null;
      n.data.stateText = { name, desc };
      n.data.fixed = [Math.max(90, name.width + 32, (desc?.width ?? 0) + 28), name.height + 18 + (desc ? desc.height + 14 : 0)];
      n.data.draw = drawState;
    }
  },
  detect: (lines) =>
    score(lines, [
      [/^state\s/i, 3],
      [/\[\*\]\s*-+>/, 3],
      [/-+>\s*\[\*\]/, 3],
      [/\[H\*?\]/, 2],
    ]),
});
