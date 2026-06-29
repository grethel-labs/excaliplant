import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("Ditaa diagrams preserve ASCII canvas lines", () => {
  const diagram = parsePlantUml(`@startditaa
+---+
| A |
+---+
@endditaa`);
  assert.equal(getDiagramModuleKind(diagram), "ditaa");
  const box = diagram.boxById("ditaa_ascii");
  assert.ok(box);
  assert.ok(box.members.includes("| A |"));
});
