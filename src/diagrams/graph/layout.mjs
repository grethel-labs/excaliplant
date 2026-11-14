/**
 * Graph sizing and ELK layout. Node geometry (text blocks, compartments,
 * icon sizes) is computed once here and reused by the draw step, so the
 * layout always reserves exactly the space the renderer needs.
 * @module diagrams/graph/layout
 */

import ELK from "elkjs/lib/elk.bundled.js";
import { layoutText } from "../../layout/measure.mjs";
import { shape as shapeDef } from "../../draw/shapes.mjs";
import { roleStyle } from "../../draw/theme.mjs";

/** @typedef {import("../../model/graph.mjs").GraphModel} GraphModel */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */
/** @typedef {import("../../layout/measure.mjs").RichLayout} RichLayout */

const elk = new ELK();

/**
 * @typedef {object} ClassGeo
 * @property {"class"} kind
 * @property {RichLayout | null} stereo
 * @property {RichLayout} name
 * @property {RichLayout | null} generics
 * @property {{ char: string, color: string } | null} spot
 * @property {number} headerHeight
 * @property {{ title: RichLayout | null, separator: string, rows: { text: RichLayout, member: import("../../model/graph.mjs").Member }[], height: number }[]} compartments
 * @property {{ key: RichLayout, value: RichLayout }[] | null} table
 * @property {number} tableKeyWidth
 */

/**
 * @typedef {object} BoxGeo
 * @property {"box"} kind
 * @property {RichLayout[]} blocks Stereotype, label, description blocks (stacked).
 * @property {number} textWidth
 * @property {number} textHeight
 * @property {"inside" | "below"} placement
 * @property {[number, number] | null} icon
 */

/**
 * @typedef {object} ContainerGeo
 * @property {"container"} kind
 * @property {RichLayout[]} blocks
 * @property {number} headerHeight
 * @property {number} minWidth
 */

const ICON_ROW = 16;

/**
 * Compute node geometry and size for every node.
 * @param {GraphModel} model
 * @param {import("../../draw/theme.mjs").Theme} theme
 */
export function sizeGraph(model, theme) {
  const hide = model.meta.hide;
  const hideStereo = hide.has("stereotype") || hide.has("stereotypes");
  for (const node of model.nodes.values()) {
    const style = roleStyle(theme, node.role);
    const fs = style.fontSize;
    const stereo = !hideStereo && node.stereotypes.length ? node.stereotypes.map((s) => `«${s}»`).join(" ") : "";
    if (node.data.fixed) {
      node.width = node.data.fixed[0];
      node.height = node.data.fixed[1];
      node.data.geo = { kind: "box", blocks: [], textWidth: 0, textHeight: 0, placement: "inside", icon: null };
      continue;
    }
    if (node.container) {
      /** @type {RichLayout[]} */
      const blocks = [];
      if (stereo) blocks.push(layoutText(stereo, { fontSize: fs * 0.75 }));
      if (node.label) blocks.push(layoutText(node.label, { fontSize: fs, bold: true }));
      if (node.description) blocks.push(layoutText(node.description, { fontSize: fs * 0.8 }));
      const textH = blocks.reduce((s, b) => s + b.height, 0);
      const textW = Math.max(0, ...blocks.map((b) => b.width));
      const isPackage = node.shape === "package" || node.shape === "folder";
      const headerHeight = textH + (isPackage ? 14 : 16) + (node.shape === "node" ? 10 : 0) + (node.shape === "cloud" ? 16 : 0);
      node.data.geo = { kind: "container", blocks, headerHeight, minWidth: textW + (isPackage ? 40 : 32) };
      node.headerHeight = headerHeight;
      continue;
    }
    if (node.classHeader || node.data.table) {
      node.data.geo = classGeometry(node, fs, stereo, hide);
      continue;
    }
    const def = shapeDef(node.shape);
    /** @type {RichLayout[]} */
    const blocks = [];
    const isNote = node.shape === "note";
    if (stereo) blocks.push(layoutText(stereo, { fontSize: fs * 0.75 }));
    if (node.label) blocks.push(layoutText(node.label, { fontSize: isNote ? fs * 0.875 : fs, align: isNote ? "left" : "center", maxWidth: isNote ? 320 : 360 }));
    if (node.description) blocks.push(layoutText(node.description, { fontSize: fs * 0.8, align: "center", maxWidth: 360 }));
    const textW = Math.max(0, ...blocks.map((b) => b.width));
    const textH = blocks.reduce((s, b) => s + b.height, 0) + Math.max(0, blocks.length - 1) * 4;
    if (def.label === "below") {
      const icon = /** @type {[number, number]} */ (def.icon ?? [32, 32]);
      node.width = Math.max(icon[0], textW + 4);
      node.height = icon[1] + (textH ? textH + 6 : 0);
      node.data.geo = { kind: "box", blocks, textWidth: textW, textHeight: textH, placement: "below", icon };
      continue;
    }
    const [pt, pr, pb, pl] = def.pad;
    const min = def.min ?? [isNote ? 40 : 80, isNote ? 30 : 44];
    node.width = Math.max(min[0], textW + pl + pr);
    node.height = Math.max(min[1], textH + pt + pb);
    if (node.shape === "port") {
      node.width = 14;
      node.height = 14;
    }
    node.data.geo = { kind: "box", blocks, textWidth: textW, textHeight: textH, placement: "inside", icon: null };
  }
}

/**
 * @param {GraphNode} node
 * @param {number} fs
 * @param {string} stereo
 * @param {Set<string>} hide
 * @returns {ClassGeo}
 */
function classGeometry(node, fs, stereo, hide) {
  const header = node.classHeader;
  const showSpot = !!header?.spot && !hide.has("circle") && !hide.has("circles") && !hide.has("spot");
  const name = layoutText(node.label, { fontSize: fs, bold: true });
  const generics = header?.generics ? layoutText(header.generics, { fontSize: fs * 0.7 }) : null;
  const stereoLayout = stereo ? layoutText(stereo, { fontSize: fs * 0.75 }) : null;
  const headerHeight = name.height + (stereoLayout?.height ?? 0) + 14;
  const memberFs = fs * 0.85;

  /** @type {ClassGeo["compartments"]} */
  const compartments = [];
  if (!node.data.table) {
    const explicit = node.compartments.some((c) => c.title !== null) || node.compartments.length > 1;
    let comps = node.compartments;
    if (!explicit) {
      const members = node.compartments.flatMap((c) => c.members);
      const isEnumLike = header?.keyword === "enum" || node.keyword === "object" || node.keyword === "entity";
      comps = isEnumLike
        ? [{ title: null, separator: "line", members }]
        : [
            { title: null, separator: "line", members: members.filter((m) => !m.isMethod) },
            { title: null, separator: "line", members: members.filter((m) => m.isMethod) },
          ];
    }
    const hideAll = hide.has("members") || hide.has(`${node.id.toLowerCase()} members`);
    comps.forEach((c, i) => {
      const kind = i === 0 && !explicit ? "fields" : "methods";
      if (hideAll) return;
      if (!explicit && (hide.has(kind) || hide.has(`${kind === "fields" ? "attributes" : kind}`))) return;
      if (!c.members.length && (hide.has("empty members") || hide.has(`empty ${kind}`) || hide.has("empty attributes") && kind === "fields")) return;
      const rows = c.members.map((member) => ({
        member,
        text: layoutText(member.text, { fontSize: memberFs, align: "left" }),
      }));
      const title = c.title ? layoutText(c.title, { fontSize: fs * 0.75 }) : null;
      const height = rows.reduce((s, r) => s + r.text.height, 0) + (title ? title.height + 4 : 0) + (rows.length ? 10 : 8);
      compartments.push({ title, separator: c.separator, rows, height });
    });
  }

  /** @type {ClassGeo["table"]} */
  let table = null;
  let tableKeyWidth = 0;
  let tableHeight = 0;
  if (node.data.table) {
    table = node.data.table.map((/** @type {[string, string]} */ [k, v]) => ({
      key: layoutText(k, { fontSize: memberFs, align: "left" }),
      value: layoutText(v, { fontSize: memberFs, align: "left" }),
    }));
    tableKeyWidth = Math.max(0, ...table.map((r) => r.key.width)) + 16;
    tableHeight = table.reduce((s, r) => s + Math.max(r.key.height, r.value.height) + 6, 0);
  }

  const headerW = name.width + (showSpot ? 34 : 0) + (generics ? generics.width / 2 + 8 : 0);
  const memberW = Math.max(0, ...compartments.flatMap((c) => c.rows.map((r) => r.text.width + (r.member.visibility ? ICON_ROW : 0)), ...compartments.map((c) => c.title?.width ?? 0)));
  const tableW = table ? tableKeyWidth + Math.max(0, ...table.map((r) => r.value.width)) + 16 : 0;
  node.width = Math.max(110, headerW + 28, (stereoLayout?.width ?? 0) + 28, memberW + 24, tableW);
  node.height = headerHeight + compartments.reduce((s, c) => s + c.height, 0) + tableHeight;
  return {
    kind: "class",
    stereo: stereoLayout,
    name,
    generics,
    spot: showSpot ? /** @type {any} */ (header).spot : null,
    headerHeight,
    compartments,
    table,
    tableKeyWidth,
  };
}

/**
 * @typedef {object} GraphLayoutOptions
 * @property {"layered" | "mrtree" | "force" | "stress"} [algorithm]
 * @property {number} [nodeSpacing]
 * @property {number} [layerSpacing]
 * @property {"ORTHOGONAL" | "POLYLINE" | "SPLINES"} [routing]
 */

/**
 * Lay out a sized graph with ELK and write positions back into the model.
 * @param {GraphModel} model
 * @param {import("../../draw/theme.mjs").Theme} theme
 * @param {GraphLayoutOptions} [options]
 * @returns {Promise<GraphModel>}
 */
export async function layoutGraph(model, theme, options = {}) {
  sizeGraph(model, theme);
  const lr = model.direction === "LR";
  const linetype = (model.meta.skin.get("linetype") ?? "").toLowerCase();
  const routing = options.routing ?? (linetype === "polyline" ? "POLYLINE" : "ORTHOGONAL");
  const visible = [...model.nodes.values()].filter((n) => !n.removed);
  const fs = theme.fontSize;

  /** @param {GraphNode} n @returns {any} */
  const toElk = (n) => {
    const kids = n.children.filter((c) => !c.removed);
    if (n.container) {
      const geo = /** @type {ContainerGeo} */ (n.data.geo);
      const top = geo.headerHeight + 10;
      return {
        id: n.id,
        layoutOptions: {
          "elk.padding": `[top=${top},left=20,bottom=20,right=20]`,
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": `(${Math.max(geo.minWidth, 100)}, ${top + 40})`,
        },
        children: kids.map(toElk),
      };
    }
    return { id: n.id, width: n.width, height: n.height };
  };

  const edges = model.edges
    .filter((e) => model.nodes.has(e.from) && model.nodes.has(e.to))
    .map((e) => {
      const reverse = (!lr && e.direction === "up") || (lr && e.direction === "left");
      e.data.reversed = reverse;
      /** @type {any[]} */
      const labels = [];
      if (e.label) {
        const laid = layoutText(e.label, { fontSize: fs * 0.8, maxWidth: 220 });
        e.data.labelLayout = laid;
        labels.push({ id: `${e.id}_l`, text: e.label, width: laid.width + 8 + (e.data.labelArrow ? 14 : 0), height: laid.height + 2 });
      }
      for (const [which, text] of /** @type {const} */ ([
        ["fromLabel", e.fromLabel],
        ["toLabel", e.toLabel],
      ])) {
        if (!text) continue;
        const laid = layoutText(text, { fontSize: fs * 0.75 });
        e.data[`${which}Layout`] = laid;
        const atSource = (which === "fromLabel") !== reverse;
        labels.push({
          id: `${e.id}_${which}`,
          text,
          width: laid.width + 4,
          height: laid.height,
          layoutOptions: { "elk.edgeLabels.placement": atSource ? "TAIL" : "HEAD" },
        });
      }
      return {
        id: e.id,
        sources: [reverse ? e.to : e.from],
        targets: [reverse ? e.from : e.to],
        labels,
        layoutOptions: e.length === 1 && !e.data.note ? { "elk.layered.priority.direction": "0" } : {},
      };
    });

  const graph = {
    id: "__root",
    layoutOptions: {
      "elk.algorithm": options.algorithm ?? "layered",
      "elk.direction": lr ? "RIGHT" : "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": routing,
      "elk.spacing.nodeNode": String(options.nodeSpacing ?? 44),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(options.layerSpacing ?? 64),
      "elk.spacing.edgeNode": "22",
      "elk.spacing.edgeEdge": "14",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.spacing.edgeNodeBetweenLayers": "22",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "12",
      "elk.spacing.labelLabel": "4",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "false",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.edgeLabels.sideSelection": "SMART_DOWN",
      "elk.edgeLabels.inline": "false",
      "elk.layered.mergeEdges": "false",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "60",
      "elk.layered.unnecessaryBendpoints": "true",
      "elk.layered.thoroughness": "10",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: visible.filter((n) => !n.parent).map(toElk),
    edges,
  };

  const result = await elk.layout(graph);

  /** @type {Map<string, { x: number, y: number }>} */
  const abs = new Map([["__root", { x: 0, y: 0 }]]);
  /** @param {any} n @param {number} ox @param {number} oy */
  const walk = (n, ox, oy) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0);
      const y = oy + (c.y ?? 0);
      abs.set(c.id, { x, y });
      const node = model.nodes.get(c.id);
      if (node) {
        node.x = x;
        node.y = y;
        node.width = c.width ?? node.width;
        node.height = c.height ?? node.height;
      }
      walk(c, x, y);
    }
  };
  walk(result, 0, 0);

  /** @param {any[]} list */
  const collectEdges = (list) => {
    for (const re of list ?? []) {
      const e = model.edges.find((x) => x.id === re.id);
      if (!e) continue;
      const off = abs.get(re.container ?? "__root") ?? { x: 0, y: 0 };
      /** @type {[number, number][]} */
      const pts = [];
      for (const s of re.sections ?? []) {
        if (!pts.length) pts.push([off.x + s.startPoint.x, off.y + s.startPoint.y]);
        for (const bp of s.bendPoints ?? []) pts.push([off.x + bp.x, off.y + bp.y]);
        pts.push([off.x + s.endPoint.x, off.y + s.endPoint.y]);
      }
      e.points = e.data.reversed ? pts.reverse() : pts;
      for (const l of re.labels ?? []) {
        const box = { x: off.x + l.x, y: off.y + l.y, width: l.width, height: l.height };
        if (l.id.endsWith("_l")) e.labelBox = box;
        else if (l.id.endsWith("_fromLabel")) e.fromLabelBox = box;
        else if (l.id.endsWith("_toLabel")) e.toLabelBox = box;
      }
    }
  };
  collectEdges(result.edges);
  /** @param {any} n */
  const nested = (n) => {
    for (const c of n.children ?? []) {
      collectEdges(c.edges);
      nested(c);
    }
  };
  nested(result);
  model.width = result.width ?? 0;
  model.height = result.height ?? 0;
  return model;
}
