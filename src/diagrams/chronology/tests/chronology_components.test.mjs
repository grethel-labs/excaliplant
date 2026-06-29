import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("chronology diagrams parse dated milestones and dependencies", () => {
  const diagram = parsePlantUml(`@startchronology
[A: Release candidate] happens on 2024-01-15 01:08:12
[B] happens on 2024-02-01
[A] -> [B]
@endchronology`);

  assert.equal(getDiagramModuleKind(diagram), "chronology");
  assert.ok(diagram.boxById("chronology_a"));
  assert.match(diagram.boxById("chronology_a").description, /date: 2024-01-15 01:08:12/);
  assert.equal(diagram.connections.length, 1);
});
