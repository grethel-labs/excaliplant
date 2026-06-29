import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("Chart diagrams parse axes and bar series", () => {
  const diagram = parsePlantUml(`@startchart
h-axis [Q1, Q2, Q3, Q4]
v-axis "Revenue" 0 --> 100
bar "Sales" [45, 62, 58, 70] #3498db
legend right
@endchart`);
  assert.equal(getDiagramModuleKind(diagram), "chart");
  assert.ok(diagram.boxById("chart_axes"));
  const series = diagram.boxById("chart_series_sales");
  assert.ok(series);
  assert.ok(series.members.includes("values: 45, 62, 58, 70"));
});
