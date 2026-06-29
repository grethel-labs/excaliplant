/** @module diagrams/shared/special_runtime */
import { Box, Connection, Diagram, Plane } from "../../general/model/diagram.mjs";
import { normalisePlantUmlText, slug, stripQuotes } from "../../util/plantuml_utils.mjs";
import { GRAPH_RENDERERS, layoutGraphModel } from "./graph_runtime.mjs";

/** @public */
export const specialRenderers = GRAPH_RENDERERS;
/** @public */
export const layoutSpecialDiagram = layoutGraphModel;

/** @param {string} kind @param {string} title */
export function createSpecialParseContext(kind, title) {
  const diagram = new Diagram();
  diagram.kind = kind;
  const plane = diagram.addPlane(new Plane({ id: `${kind}_canvas`, title, kind: "frame" }));
  /** @type {Record<string, any>} */
  const ctx = { diagram, plane, kind, title, asciiLines: [], chart: null };
  ctx.result = diagram;
  return ctx;
}

/** @param {Record<string, any>} ctx @param {string} id @param {string} title @param {string[]} members @param {string} [stereotype] */
export function addSpecialBox(ctx, id, title, members, stereotype = "") {
  const box = new Box({
    id: `${ctx.kind}_${slug(id)}`,
    title: normalisePlantUmlText(stripQuotes(title)),
    shape: "rectangle",
    stereotype,
    members: members.map((member) => normalisePlantUmlText(member)).filter(Boolean),
  });
  ctx.plane.addBox(box);
  return box;
}

/** @param {Record<string, any>} ctx */
export function finalizeDitaa(ctx) {
  const box = new Box({
    id: `${ctx.kind}_ascii`,
    title: "Ditaa",
    shape: "rectangle",
    stereotype: "<<ditaa>>",
    members: ctx.asciiLines.slice(0, 240).filter(Boolean),
  });
  ctx.plane.addBox(box);
}

/** @param {Record<string, any>} ctx */
export function finalizeChart(ctx) {
  const chart = ctx.chart || { axes: [], series: [], options: [] };
  const axisBox = addSpecialBox(
    ctx,
    "axes",
    "Chart axes",
    [...chart.axes, ...chart.options],
    "<<chart-axes>>",
  );
  for (const series of chart.series) {
    const box = addSpecialBox(
      ctx,
      `series_${series.name}`,
      series.name,
      [
        `kind: ${series.kind}`,
        `values: ${series.values.join(", ")}`,
        series.color ? `color: ${series.color}` : "",
      ],
      `<<chart-${series.kind}>>`,
    );
    ctx.diagram.addConnection(
      new Connection({
        id: `${axisBox.id}->${box.id}`,
        from: axisBox,
        to: box,
        label: series.kind,
        directionHint: "right",
      }),
    );
  }
}
