/**
 * Chen entity-relationship diagrams (`@startchen`): entities (weak),
 * relationships (identifying), attributes (key, derived, multi-valued,
 * composite) and cardinalities with total participation (`=`).
 * @module diagrams/chen
 */

import { graphModule } from "../graph/module.mjs";
import { label, takeStereotypes, takeBlockOpen } from "../../syntax/text.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { takeColor } from "../../syntax/text.mjs";

/** @typedef {import("../graph/parse.mjs").GraphContext} GraphContext */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */

/**
 * Parse attribute lines inside an entity/relationship body.
 * @param {GraphContext} ctx
 * @param {GraphNode} owner
 * @param {import("../../syntax/reader.mjs").LineReader} reader
 */
function readAttributes(ctx, owner, reader) {
  while (!reader.done) {
    const raw = reader.next().text.trim();
    if (!raw) continue;
    if (raw === "}") return;
    const block = takeBlockOpen(raw);
    const st = takeStereotypes(block.rest);
    const m = /^(.*?)(?:\s*:\s*(.*))?$/.exec(st.rest);
    const name = label(m?.[1] ?? st.rest);
    const id = `${owner.id}.${name}#${ctx.noteSeq++}`;
    const flags = st.stereotypes.map((s) => s.toLowerCase());
    const node = ctx.model.add(id, { label: m?.[2] ? `${name} : ${label(m[2])}` : name, shape: "usecase", role: "usecase", keyword: "attribute", parent: owner.parent });
    node.data.attr = { key: flags.includes("key"), derived: flags.includes("derived"), multi: flags.includes("multi"), partial: flags.includes("partial") };
    node.data.round = true;
    ctx.model.connect(owner.id, node.id, { role: "edge", lineStyle: node.data.attr.derived ? "dashed" : "solid" });
    if (block.opens) readAttributes(ctx, node, reader);
  }
}

/** @type {import("../../syntax/reader.mjs").Rule<GraphContext>[]} */
const RULES = [
  (line, ctx, reader) => {
    const m = /^(entity|relationship)\s+(.*)$/i.exec(line);
    if (!m) return false;
    const block = takeBlockOpen(m[2]);
    const st = takeStereotypes(block.rest);
    const col = takeColor(st.rest);
    const named = /^("[^"]+"|\S+)(?:\s+as\s+(\S+))?$/.exec(col.rest.trim());
    if (!named) return false;
    const id = named[2] ?? named[1].replace(/^"|"$/g, "");
    const isRel = m[1].toLowerCase() === "relationship";
    const node = ctx.model.add(id, {
      label: label(named[1]),
      shape: isRel ? "diamond" : "rectangle",
      role: isRel ? "decision" : "entity",
      keyword: m[1].toLowerCase(),
      colors: parseColorSpec(col.color),
    });
    const flags = st.stereotypes.map((s) => s.toLowerCase());
    node.data.weak = flags.includes("weak") || flags.includes("identifying");
    if (isRel) node.data.round = true;
    if (block.opens) readAttributes(ctx, node, reader);
    return true;
  },
  // RENTS =1= PERSON, RENTS -N- MOVIE, specialisation arrows ->-
  (line, ctx) => {
    const m = /^(\S+)\s+([-=])(\(?[\w.,]*\)?)?([-=])\s+(\S+)(?:\s*:\s*(.*))?$/.exec(line);
    if (!m) return false;
    const a = ctx.model.find(m[1]);
    const b = ctx.model.find(m[5]);
    if (!a || !b) return false;
    const e = ctx.model.connect(a.id, b.id, { label: m[3] ? m[3] : m[6] ? label(m[6]) : null, bold: m[2] === "=" || m[4] === "=" });
    if (e.bold) e.thickness = 4;
    return true;
  },
  (line, ctx) => {
    const m = /^(\S+)\s+->-\s*(?:([du])\s*)?\{\s*(.*?)\s*\}$/.exec(line);
    if (!m) return false;
    const parent = ctx.model.find(m[1]);
    if (!parent) return false;
    for (const child of m[3].split(",").map((s) => s.trim()).filter(Boolean)) {
      const c = ctx.model.find(child);
      if (c) ctx.model.connect(c.id, parent.id, { endHead: "triangle_outline", label: m[2] ?? null });
    }
    return true;
  },
];

export default graphModule({
  kind: "chen",
  title: "Chen ER diagram",
  starts: ["chen"],
  keywords: [["entity", { shape: "rectangle", role: "entity" }]],
  rules: RULES,
  finish: (model) => {
    for (const n of model.nodes.values()) {
      if (n.data.weak) {
        n.data.padX = 12;
        n.data.draw = (/** @type {any} */ c, /** @type {any} */ node, /** @type {any} */ st, /** @type {any} */ s) => {
          const outer = n.shape === "diamond" ? c.diamond(node.x, node.y, node.width, node.height, st) : c.rect(node.x, node.y, node.width, node.height, st);
          if (n.shape === "diamond") c.diamond(node.x + 8, node.y + 5, node.width - 16, node.height - 10, { ...st, fill: "transparent" });
          else c.rect(node.x + 4, node.y + 4, node.width - 8, node.height - 8, { ...st, fill: "transparent" });
          const b = node.data.geo.blocks[0];
          if (b) c.richText(b, node.x + (node.width - b.width) / 2, node.y + (node.height - b.height) / 2, { color: s.text });
          return outer;
        };
      }
      const attr = n.data.attr;
      if (!attr) continue;
      n.data.draw = (/** @type {any} */ c, /** @type {any} */ node, /** @type {any} */ st, /** @type {any} */ s) => {
        const style = { ...st, strokeStyle: attr.derived ? "dashed" : st.strokeStyle };
        const id = c.ellipse(node.x, node.y, node.width, node.height, style);
        if (attr.multi) c.ellipse(node.x + 4, node.y + 4, node.width - 8, node.height - 8, { ...style, fill: "transparent" });
        const b = node.data.geo.blocks[0];
        if (b) {
          const tx = node.x + (node.width - b.width) / 2;
          const ty = node.y + (node.height - b.height) / 2;
          c.richText(b, tx, ty, { color: s.text });
          if (attr.key || attr.partial) {
            c.line(
              [
                [tx, ty + b.height],
                [tx + b.width, ty + b.height],
              ],
              { stroke: s.text, strokeWidth: 1, roughness: 0, strokeStyle: attr.partial ? "dashed" : "solid" },
            );
          }
        }
        return id;
      };
    }
  },
});
