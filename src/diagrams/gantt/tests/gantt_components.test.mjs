import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("gantt diagrams parse project start, durations and explicit starts", () => {
  const diagram = parsePlantUml(`@startgantt
Project starts 2020-07-01
[Prototype design] requires 15 days
[Test prototype] requires 10 days
[Prototype design] starts 2020-07-01
@endgantt`);
  assert.equal(getDiagramModuleKind(diagram), "gantt");
  assert.ok(diagram.boxById("gantt_prototype_design"));
  assert.match(diagram.boxById("gantt_prototype_design").description, /duration: 15 days/);
});
