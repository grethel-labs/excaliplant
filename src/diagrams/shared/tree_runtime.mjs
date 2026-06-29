/** @module diagrams/shared/tree_runtime */
import { Box, Connection, Diagram, Plane } from "../../general/model/diagram.mjs";
import { normalisePlantUmlText, slug, stripQuotes } from "../../util/plantuml_utils.mjs";
import { GRAPH_RENDERERS, layoutGraphModel } from "./graph_runtime.mjs";

/** @public */
export const treeRenderers = GRAPH_RENDERERS;
/** @public */
export const layoutTreeDiagram = layoutGraphModel;

/** @param {string} kind @param {string} title */
export function createTreeParseContext(kind, title) {
  const diagram = new Diagram();
  diagram.kind = kind;
  const plane = diagram.addPlane(new Plane({ id: `${kind}_tree`, title, kind: "frame" }));
  /** @type {Record<string, any>} */
  const ctx = { diagram, plane, kind, index: 0, stack: [], pathNodes: new Map() };
  ctx.result = diagram;
  return ctx;
}

/** @param {Record<string, any>} ctx @param {number} level @param {string} label @param {string} [shape] @param {string} [stereotype] */
export function addTreeNode(ctx, level, label, shape = "rectangle", stereotype = "") {
  const safe = normalisePlantUmlText(stripQuotes(label.trim()));
  if (!safe) return null;
  const parent = level > 1 ? ctx.stack[level - 2] : null;
  const id = `${ctx.kind}_${ctx.index++}_${slug(`${level}_${safe}`)}`;
  const box = new Box({ id, title: safe, shape, stereotype });
  ctx.plane.addBox(box);
  ctx.stack[level - 1] = box;
  ctx.stack.length = level;
  if (parent) {
    ctx.diagram.addConnection(
      new Connection({
        id: `${parent.id}->${box.id}`,
        from: parent,
        to: box,
        directionHint: "right",
      }),
    );
  }
  return box;
}

/** @param {Record<string, any>} ctx @param {string} rawPath */
export function addFilePath(ctx, rawPath) {
  const segments = rawPath
    .split("/")
    .map((part) => normalisePlantUmlText(part.trim()))
    .filter(Boolean);
  let parent = null;
  let key = "";
  for (let i = 0; i < segments.length; i++) {
    key = `${key}/${segments[i]}`;
    let box = ctx.pathNodes.get(key);
    if (!box) {
      const isLeaf = i === segments.length - 1;
      box = new Box({
        id: `file_${slug(key)}`,
        title: segments[i],
        shape: "rectangle",
        stereotype: isLeaf ? "<<file>>" : "<<folder>>",
      });
      ctx.pathNodes.set(key, box);
      ctx.plane.addBox(box);
      if (parent) {
        ctx.diagram.addConnection(
          new Connection({
            id: `${parent.id}->${box.id}`,
            from: parent,
            to: box,
            directionHint: "right",
          }),
        );
      }
    }
    parent = box;
  }
}

/** @param {string[]} lines @param {string[]} directives */
export function prepareTreeLines(lines, directives) {
  const skip = new Set([...directives.map((d) => d.toLowerCase()), "@enduml"]);
  return lines.filter((line) => !skip.has(line.trim().toLowerCase()));
}

/** @param {string} line */
export function parseHierarchyLine(line) {
  const trimmed = line.trim();
  let match = trimmed.match(/^([*+#-]+)\s*(.+)$/);
  if (match) return { level: match[1].length, label: match[2].replace(/^[-+]\s*/, "") };
  match = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (match) return { level: match[1].length, label: match[2] };
  match = line.match(/^(\s*)[-*+]\s+(.+)$/);
  if (match) return { level: Math.floor(match[1].length / 2) + 1, label: match[2] };
  return null;
}
