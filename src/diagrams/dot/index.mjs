/**
 * Graphviz DOT diagrams (`@startdot`): graph/digraph, node and edge
 * statements with attributes, edge chains, default attributes, clusters
 * (`subgraph cluster_*`) and `rankdir`. Rendered through the ELK graph
 * engine instead of Graphviz.
 * @module diagrams/dot
 */

import { defineDiagram } from "../../core/registry.mjs";
import { GraphModel } from "../../model/graph.mjs";
import { parseColor } from "../../syntax/color.mjs";
import { unescapeLabel } from "../../syntax/text.mjs";
import { layoutGraph } from "../graph/layout.mjs";
import { drawGraph } from "../graph/draw.mjs";
import { LimitError, ParseError } from "../../core/errors.mjs";

/** DOT shape → excaliplant shape. */
const SHAPES = new Map(
  Object.entries({
    box: "rectangle",
    rect: "rectangle",
    rectangle: "rectangle",
    square: "rectangle",
    record: "rectangle",
    mrecord: "rounded",
    ellipse: "usecase",
    oval: "usecase",
    circle: "circle",
    doublecircle: "circle",
    point: "start",
    diamond: "diamond",
    cylinder: "database",
    note: "note",
    folder: "folder",
    tab: "folder",
    component: "component",
    box3d: "node",
    hexagon: "hexagon",
    plaintext: "label",
    plain: "label",
    none: "label",
    underline: "label",
    cds: "process",
    larrow: "action",
    rarrow: "process",
  }),
);

/**
 * Tokenise DOT source (identifiers, numbers, quoted strings, HTML strings, operators).
 * @param {string} src
 * @returns {string[]}
 */
function tokenize(src) {
  /** @type {string[]} */
  const out = [];
  let i = 0;
  const text = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/^\s*#[^\n]*/gm, "");
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c) || c === ";" || c === ",") {
      if (c === ";" || c === ",") out.push(c);
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "\\" && text[j + 1] === '"') {
          s += '"';
          j += 2;
          continue;
        }
        s += text[j++];
      }
      out.push(`"${s}`);
      i = j + 1;
      continue;
    }
    if (c === "<") {
      let depth = 0;
      let j = i;
      for (; j < text.length; j++) {
        if (text[j] === "<") depth++;
        else if (text[j] === ">" && --depth === 0) break;
      }
      out.push(
        `"${text
          .slice(i + 1, j)
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()}`,
      );
      i = j + 1;
      continue;
    }
    if (text.startsWith("->", i) || text.startsWith("--", i)) {
      out.push(text.slice(i, i + 2));
      i += 2;
      continue;
    }
    if ("{}[]=".includes(c)) {
      out.push(c);
      i++;
      continue;
    }
    let j = i;
    while (
      j < text.length &&
      /[\w.\-:]/.test(text[j]) &&
      !text.startsWith("->", j) &&
      !text.startsWith("--", j)
    )
      j++;
    if (j === i) j++;
    out.push(text.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function parseDot(lines, ctx) {
  const tokens = tokenize(lines.map((l) => l.text).join("\n"));
  const model = new GraphModel("dot");
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  /** @param {string | undefined} t */
  const val = (t) => (t === undefined ? "" : t.startsWith('"') ? t.slice(1) : t);
  if (/^strict$/i.test(peek() ?? "")) next();
  const kind = (next() ?? "").toLowerCase();
  if (kind !== "graph" && kind !== "digraph")
    throw new ParseError("DOT source must start with graph or digraph");
  const directed = kind === "digraph";
  if (peek() !== "{") next();
  if (next() !== "{") throw new ParseError("Expected '{' in DOT source");

  /** @returns {Record<string, string>} */
  const attrList = () => {
    /** @type {Record<string, string>} */
    const attrs = Object.create(null);
    while (peek() === "[") {
      next();
      while (pos < tokens.length && peek() !== "]") {
        const k = val(next()).toLowerCase();
        if (k === "," || k === ";") continue;
        if (peek() === "=") {
          next();
          attrs[k] = val(next());
        } else attrs[k] = "true";
      }
      next();
    }
    return attrs;
  };

  /**
   * @param {import("../../model/graph.mjs").GraphNode | null} parent
   * @param {Record<string, string>} nodeDefaults
   * @param {Record<string, string>} edgeDefaults
   */
  const statements = (parent, nodeDefaults, edgeDefaults) => {
    const nd = { ...nodeDefaults };
    const ed = { ...edgeDefaults };
    while (pos < tokens.length && peek() !== "}") {
      const t = next();
      if (t === ";" || t === ",") continue;
      const low = t.toLowerCase();
      if (low === "node" || low === "edge" || low === "graph") {
        const a = attrList();
        if (low === "node") Object.assign(nd, a);
        else if (low === "edge") Object.assign(ed, a);
        else if (parent && a.label) parent.label = unescapeLabel(a.label);
        else if (a.rankdir) model.direction = /LR|RL/i.test(a.rankdir) ? "LR" : "TB";
        continue;
      }
      if (low === "subgraph" || t === "{") {
        let name = "";
        if (low === "subgraph") {
          if (peek() !== "{") name = val(next());
          next();
        }
        const cluster = /^cluster/i.test(name);
        const group = cluster
          ? model.add(name, {
              label: "",
              shape: "rectangle",
              role: "container",
              keyword: "cluster",
              parent,
            })
          : null;
        if (group) group.container = true;
        statements(group ?? parent, nd, ed);
        next();
        continue;
      }
      if (peek() === "=") {
        next();
        const v = val(next());
        if (low === "rankdir") model.direction = /LR|RL/i.test(v) ? "LR" : "TB";
        else if (low === "label" && parent) parent.label = unescapeLabel(v);
        else if (low === "label") model.meta.title = unescapeLabel(v);
        continue;
      }
      // node or edge chain
      const chain = [val(t)];
      while (peek() === "->" || peek() === "--") {
        next();
        chain.push(val(next()));
      }
      const attrs = attrList();
      for (const id of chain) {
        if (!model.nodes.has(id)) {
          const a = chain.length === 1 ? { ...nd, ...attrs } : nd;
          const node = model.add(id, {
            label: unescapeLabel(a.label ?? id),
            shape: SHAPES.get((a.shape ?? "ellipse").toLowerCase()) ?? "usecase",
            role: "default",
            keyword: "node",
            parent,
          });
          applyNodeAttrs(node, a);
        } else if (chain.length === 1) {
          const node = /** @type {any} */ (model.nodes.get(id));
          if (attrs.label) node.label = unescapeLabel(attrs.label);
          if (attrs.shape) node.shape = SHAPES.get(attrs.shape.toLowerCase()) ?? node.shape;
          applyNodeAttrs(node, attrs);
        }
      }
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = { ...ed, ...attrs };
        const dir = a.dir ?? (directed ? "forward" : "none");
        model.connect(chain[i], chain[i + 1], {
          endHead: dir === "forward" || dir === "both" ? "triangle" : null,
          startHead: dir === "back" || dir === "both" ? "triangle" : null,
          label: a.label ? unescapeLabel(a.label) : null,
          lineStyle: /dash/.test(a.style ?? "")
            ? "dashed"
            : /dot/.test(a.style ?? "")
              ? "dotted"
              : "solid",
          bold: /bold/.test(a.style ?? ""),
          hidden: /invis/.test(a.style ?? ""),
          color: parseColor(a.color ?? ""),
        });
      }
      if (model.nodes.size > ctx.limits.maxNodes) throw new LimitError("Too many DOT nodes");
      if (model.edges.length > ctx.limits.maxEdges) throw new LimitError("Too many DOT edges");
    }
  };
  statements(null, {}, {});
  return model;
}

/**
 * @param {import("../../model/graph.mjs").GraphNode} node
 * @param {Record<string, string>} a
 */
function applyNodeAttrs(node, a) {
  const fill = parseColor(a.fillcolor ?? (a.style?.includes("filled") ? a.color : "") ?? "");
  const stroke = parseColor(a.color ?? "");
  const text = parseColor(a.fontcolor ?? "");
  if (fill) node.colors.fill = fill;
  if (stroke) node.colors.stroke = stroke;
  if (text) node.colors.text = text;
  if (/dash/.test(a.style ?? "")) node.colors.strokeStyle = "dashed";
  if (/invis/.test(a.style ?? "")) node.hidden = true;
  if (node.shape === "usecase" || node.shape === "circle") node.data.round = true;
  if (node.shape === "start") {
    node.data.fixed = [10, 10];
    node.label = "";
  }
}

export default defineDiagram({
  kind: "dot",
  title: "Graphviz DOT",
  starts: ["dot"],
  parse: parseDot,
  layout: (model, ctx) => layoutGraph(model, ctx.theme),
  draw: (model, canvas) => drawGraph(model, canvas),
});
