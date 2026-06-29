import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("yaml diagrams parse mappings, sequences and unicode keys", () => {
  const diagram = parsePlantUml(`@startyaml
fruit: Apple
color:
  - Red
  - Green
❤: Heart
@endyaml`);
  assert.equal(getDiagramModuleKind(diagram), "yaml");
  const titles = diagram.planes[0].allBoxes.map((box) => box.title);
  assert.ok(titles.includes("color"));
  assert.ok(titles.includes("[0]"));
  assert.ok(titles.includes("❤"));
});
