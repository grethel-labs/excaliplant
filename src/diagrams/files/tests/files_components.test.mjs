import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("files diagrams merge shared path ancestors", () => {
  const diagram = parsePlantUml(`@startfiles
/.github
/src/example.py
/tests/example_test.py
/src/example1.py
/README.md
/LICENSE
@endfiles`);
  assert.equal(getDiagramModuleKind(diagram), "files");
  assert.equal(diagram.planes[0].allBoxes.filter((box) => box.title === "src").length, 1);
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "example.py"));
});
