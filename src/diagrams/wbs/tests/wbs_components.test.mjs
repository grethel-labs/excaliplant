import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("wbs diagrams parse orgmode and arithmetic hierarchy", () => {
  const diagram = parsePlantUml(`@startwbs
* Business Process Modelling WBS
** Launch the project
*** Complete Stakeholder Research
+ New Job
++ Decide on Job Requirements
@endwbs`);
  assert.equal(getDiagramModuleKind(diagram), "wbs");
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "Launch the project"));
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "Decide on Job Requirements"));
});
