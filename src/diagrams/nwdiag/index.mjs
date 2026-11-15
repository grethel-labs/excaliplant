/**
 * Network diagrams (`@startnwdiag` or `nwdiag { … }` inside `@startuml`):
 * networks with address/colour/description, nodes with addresses, shapes
 * and descriptions, nodes on several networks, groups and peer links.
 * @module diagrams/nwdiag
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColor } from "../../syntax/color.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle, paletteAt } from "../../draw/theme.mjs";
import { SHAPES } from "../../draw/shapes.mjs";
import { LimitError } from "../../core/errors.mjs";
import { score } from "../detect.mjs";

/**
 * @typedef {object} NwNode
 * @property {string} id
 * @property {string} label
 * @property {string} shape
 * @property {string | null} color
 * @property {Map<string, string>} addresses Network id → address.
 * @property {number} order
 */

/**
 * @typedef {object} NwModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {{ id: string, label: string, address: string, color: string | null }[]} networks
 * @property {Map<string, NwNode>} nodes
 * @property {{ label: string, color: string | null, members: string[] }[]} groups
 * @property {[string, string][]} peers
 */

/**
 * Parse `key = "value", key2 = value2` attribute lists.
 * @param {string} s
 * @returns {Record<string, string>}
 */
function attrs(s) {
  /** @type {Record<string, string>} */
  const out = Object.create(null);
  for (const m of s.matchAll(/(\w+)\s*=\s*("([^"]*)"|[^,;\]\s]+)/g))
    out[m[1].toLowerCase()] = m[3] ?? m[2];
  return out;
}

const SHAPE_MAP = new Map(
  Object.entries({
    database: "database",
    cloud: "cloud",
    actor: "actor",
    node: "node",
    storage: "storage",
    queue: "queue",
    component: "component",
    folder: "folder",
    file: "file",
    card: "card",
    collections: "collections",
    stack: "stack",
    agent: "rectangle",
    artifact: "artifact",
    boundary: "boundary",
    control: "control",
    entity: "entity",
    frame: "frame",
    hexagon: "hexagon",
    interface: "interface",
    package: "folder",
    person: "person",
    rectangle: "rectangle",
  }),
);

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 * @returns {NwModel}
 */
function parseNwdiag(lines, module) {
  /** @type {NwModel} */
  const model = { meta: createMeta(), networks: [], nodes: new Map(), groups: [], peers: [] };
  const reader = new LineReader(lines);
  /** @type {{ kind: "network" | "group", data: any } | null} */
  let scope = null;
  /** @param {string} id */
  const node = (id) => {
    let n = model.nodes.get(id);
    if (!n) {
      n = {
        id,
        label: id,
        shape: "rectangle",
        color: null,
        addresses: new Map(),
        order: model.nodes.size,
      };
      model.nodes.set(id, n);
      if (model.nodes.size > module.limits.maxNodes) throw new LimitError("Too many network nodes");
    }
    return n;
  };
  while (!reader.done) {
    const src = reader.next();
    const line = src.text.trim().replace(/;$/, "");
    if (!line || /^nwdiag\s*\{$/i.test(line)) continue;
    let m;
    if ((m = /^network\s+("[^"]+"|[\w.-]+)\s*\{?$/i.exec(line))) {
      const id = m[1].replace(/"/g, "");
      const net = { id, label: id, address: "", color: null };
      model.networks.push(net);
      scope = { kind: "network", data: net };
      continue;
    }
    if ((m = /^group\s*("[^"]+"|[\w.-]+)?\s*\{?$/i.exec(line))) {
      const g = { label: m[1]?.replace(/"/g, "") ?? "", color: null, members: [] };
      model.groups.push(g);
      scope = { kind: "group", data: g };
      continue;
    }
    if (line === "}") {
      scope = null;
      continue;
    }
    if ((m = /^(\w+)\s*=\s*(.+)$/.exec(line)) && scope) {
      const key = m[1].toLowerCase();
      const value = m[2].replace(/^"|"$/g, "");
      if (key === "address") scope.data.address = value;
      else if (key === "color") scope.data.color = parseColor(value);
      else if (key === "description") scope.data.label = label(value);
      continue;
    }
    if ((m = /^("[^"]+"|[\w.-]+)\s*--\s*("[^"]+"|[\w.-]+)$/.exec(line))) {
      node(m[1].replace(/"/g, ""));
      node(m[2].replace(/"/g, ""));
      model.peers.push([m[1].replace(/"/g, ""), m[2].replace(/"/g, "")]);
      continue;
    }
    if ((m = /^("[^"]+"|[\w.-]+)\s*(?:\[(.*)\])?$/.exec(line))) {
      if (parseCommon(line, model.meta, reader)) continue;
      const ids = m[1].replace(/"/g, "");
      for (const id of ids.split(/\s*,\s*/)) {
        const n = node(id);
        const a = attrs(m[2] ?? "");
        if (a.description) n.label = label(a.description);
        if (a.shape) n.shape = SHAPE_MAP.get(a.shape.toLowerCase()) ?? "rectangle";
        if (a.color) n.color = parseColor(a.color);
        if (scope?.kind === "network") n.addresses.set(scope.data.id, a.address ?? "");
        if (scope?.kind === "group") scope.data.members.push(id);
      }
      continue;
    }
    if (parseCommon(line, model.meta, reader)) continue;
    module.diagnostics.unknown(line, src.line);
  }
  return model;
}

/**
 * @param {NwModel} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutNwdiag(model, ctx) {
  const fs = ctx.theme.fontSize * 0.85;
  const nodes = [...model.nodes.values()];
  const netIndex = new Map(model.networks.map((n, i) => [n.id, i]));
  const colW = Math.max(150, ...nodes.map((n) => layoutText(n.label, { fontSize: fs }).width + 50));
  const netLabelW = Math.max(
    110,
    ...model.networks.map(
      (n) => layoutText(`${n.label}\n${n.address}`, { fontSize: fs * 0.8 }).width + 24,
    ),
  );
  const rowH = 150;
  const placed = nodes.map((n, i) => {
    const nets = [...n.addresses.keys()]
      .map((id) => /** @type {number} */ (netIndex.get(id)))
      .filter((x) => x !== undefined);
    // Nodes only connected through peer links sit above the first network.
    const row = nets.length
      ? Math.min(...nets)
      : model.peers.some((pr) => pr.includes(n.id))
        ? -1
        : model.networks.length;
    const text = layoutText(n.label, { fontSize: fs });
    return {
      n,
      col: i,
      row,
      nets,
      text,
      w: Math.max(100, text.width + 30),
      h: Math.max(44, text.height + 22),
    };
  });
  return { model, placed, colW, rowH, netLabelW, fs };
}

/**
 * @param {ReturnType<typeof layoutNwdiag>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawNwdiag(laid, c) {
  const { model, placed, colW, rowH, netLabelW, fs } = laid;
  const theme = c.theme;
  const x0 = netLabelW + 20;
  const netY = (/** @type {number} */ i) => 30 + i * rowH;
  const nodeX = (/** @type {number} */ col) => x0 + col * colW + colW / 2;
  const nodeY = (/** @type {number} */ row) => netY(row) + rowH / 2 + 10;

  for (const g of model.groups) {
    const members = placed.filter((p) => g.members.includes(p.n.id));
    if (!members.length) continue;
    const x1 = Math.min(...members.map((p) => nodeX(p.col) - p.w / 2)) - 14;
    const x2 = Math.max(...members.map((p) => nodeX(p.col) + p.w / 2)) + 14;
    const y1 = Math.min(...members.map((p) => nodeY(p.row) - p.h / 2)) - (g.label ? 30 : 14);
    const y2 = Math.max(...members.map((p) => nodeY(p.row) + p.h / 2)) + 14;
    c.rect(x1, y1, x2 - x1, y2 - y1, {
      fill: g.color ?? roleStyle(theme, "muted").fill,
      stroke: theme.muted,
      strokeWidth: 1,
      rounded: true,
      opacity: 80,
    });
    if (g.label) c.text(g.label, x1 + 8, y1 + 4, { size: fs * 0.85, color: theme.ink, bold: true });
  }

  model.networks.forEach((net, i) => {
    const members = placed.filter((p) => p.nets.includes(i));
    const pal = paletteAt(theme, i);
    const xs = members.map((p) => nodeX(p.col));
    const x1 = Math.min(x0, ...xs) - 10;
    const x2 = Math.max(x0 + colW, ...xs.map((x) => x + colW / 2)) - 10;
    const y = netY(i);
    c.rect(x1, y - 7, x2 - x1, 14, {
      fill: net.color ?? pal.fill,
      stroke: pal.stroke,
      rounded: true,
    });
    const t = layoutText(net.address ? `${net.label}\n${net.address}` : net.label, {
      fontSize: fs * 0.8,
      align: "right",
    });
    c.richText(t, x1 - 12 - t.width, y - t.height / 2, { color: theme.ink, align: "right" });
  });

  for (const p of placed) {
    const x = nodeX(p.col);
    const y = nodeY(p.row);
    for (const ni of p.nets) {
      const ny = netY(ni);
      const top = ni <= p.row ? ny + 7 : y + p.h / 2;
      const bottom = ni <= p.row ? y - p.h / 2 : ny - 7;
      c.line(
        [
          [x, top],
          [x, bottom],
        ],
        { stroke: theme.muted, strokeWidth: 1.5 },
      );
      const addr = p.n.addresses.get(model.networks[ni].id);
      if (addr)
        c.text(addr, x + 5, ni <= p.row ? top + 4 : bottom - fs * 1.1, {
          size: fs * 0.72,
          color: theme.muted,
        });
    }
  }
  for (const [a, b] of model.peers) {
    const pa = placed.find((p) => p.n.id === a);
    const pb = placed.find((p) => p.n.id === b);
    if (!pa || !pb) continue;
    c.line(
      [
        [nodeX(pa.col), nodeY(pa.row)],
        [nodeX(pb.col), nodeY(pb.row)],
      ],
      { stroke: theme.muted, strokeWidth: 1.5 },
    );
  }
  placed.forEach((p, i) => {
    const s = roleStyle(theme, "node", { fill: p.n.color ?? undefined });
    const pal = paletteAt(theme, i + 3);
    const x = nodeX(p.col) - p.w / 2;
    const y = nodeY(p.row) - p.h / 2;
    const def = SHAPES[p.n.shape] ?? SHAPES.rectangle;
    c.group(() => {
      const style = { fill: p.n.color ?? pal.fill, stroke: pal.stroke ?? s.stroke };
      if (def.label === "below") {
        const [iw, ih] = def.icon ?? [32, 32];
        def.draw(c, nodeX(p.col) - iw / 2, y - ih + p.h - p.text.height - 4, iw, ih, style);
        c.richText(p.text, nodeX(p.col) - p.text.width / 2, y + p.h - p.text.height, {
          color: theme.ink,
        });
      } else {
        def.draw(c, x, y, p.w, p.h, style);
        c.richText(
          p.text,
          nodeX(p.col) - p.text.width / 2,
          nodeY(p.row) - p.text.height / 2 + (p.n.shape === "database" ? 6 : 0),
          { color: theme.ink },
        );
      }
    });
  });
}

export default defineDiagram({
  kind: "nwdiag",
  title: "Network diagram",
  starts: ["nwdiag", "uml"],
  detect: (lines) =>
    score(lines, [
      [/^nwdiag\s*\{/i, 10],
      [/^network\s+\S+\s*\{/i, 4],
    ]),
  parse: parseNwdiag,
  layout: layoutNwdiag,
  draw: drawNwdiag,
});
