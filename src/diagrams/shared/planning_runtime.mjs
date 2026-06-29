/** @module diagrams/shared/planning_runtime */
import { Box, Connection, Diagram, Plane } from "../../general/model/diagram.mjs";
import { normalisePlantUmlText, slug, stripQuotes } from "../../util/plantuml_utils.mjs";
import { GRAPH_RENDERERS, layoutGraphModel } from "./graph_runtime.mjs";

/**
 * @typedef {object} PlanningItemSpec
 * @property {string} [duration]
 * @property {string} [projectStart]
 * @property {string} [start]
 * @property {string} [end]
 * @property {string} [date]
 * @property {boolean} [milestone]
 * @property {string} [resource]
 * @property {string} [label]
 */

/** @public */
export const planningRenderers = GRAPH_RENDERERS;
/** @public */
export const layoutPlanningDiagram = layoutGraphModel;

/** @param {string} kind @param {string} title */
export function createPlanningParseContext(kind, title) {
  const diagram = new Diagram();
  diagram.kind = kind;
  const plane = diagram.addPlane(new Plane({ id: `${kind}_timeline`, title, kind: "frame" }));
  /** @type {Record<string, any>} */
  const ctx = { diagram, plane, kind, index: 0, boxes: new Map(), projectStart: "" };
  ctx.result = diagram;
  return ctx;
}

/** @param {Record<string, any>} ctx @param {string} rawTitle @param {PlanningItemSpec} [spec] */
export function addPlanningItem(ctx, rawTitle, spec = {}) {
  const title = normalisePlantUmlText(stripQuotes(rawTitle));
  const id = `${ctx.kind}_${slug(title)}`;
  let box = ctx.boxes.get(id);
  if (!box) {
    box = new Box({
      id,
      title,
      description: describePlanningSpec(spec),
      shape: spec.milestone ? "diamond" : "rectangle",
      stereotype: spec.resource
        ? `<<${spec.resource}>>`
        : spec.milestone
          ? "<<milestone>>"
          : "<<task>>",
    });
    ctx.boxes.set(id, box);
    ctx.plane.addBox(box);
  } else {
    box.description = [box.description, describePlanningSpec(spec)].filter(Boolean).join("\n");
  }
  return box;
}

/** @param {Record<string, any>} ctx @param {string} fromTitle @param {string} toTitle @param {string} label */
export function addPlanningDependency(ctx, fromTitle, toTitle, label = "") {
  const from = addPlanningItem(ctx, fromTitle);
  const to = addPlanningItem(ctx, toTitle);
  ctx.diagram.addConnection(
    new Connection({
      id: `${from.id}->${to.id}`,
      from,
      to,
      label: normalisePlantUmlText(label),
      directionHint: "right",
    }),
  );
}

/** @param {PlanningItemSpec} spec */
function describePlanningSpec(spec) {
  return Object.entries(spec)
    .filter(([, value]) => value !== "" && value !== false && value != null)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

/** @param {string[]} lines @param {string[]} directives */
export function preparePlanningLines(lines, directives) {
  const skip = new Set([...directives.map((d) => d.toLowerCase()), "@enduml"]);
  return lines.filter((line) => !skip.has(line.trim().toLowerCase()));
}
