import test from "node:test";
import assert from "node:assert/strict";
import {
  getDiagramModuleKind,
  layoutDiagramWithModule,
  parsePlantUml,
  exportDiagramWithModule,
} from "../../../../index.mjs";

test("regex diagrams parse documented literals, classes, alternatives and quantifiers", async () => {
  const diagram = parsePlantUml(`@startregex
title shorthandCharacterClasses
\\d\\w\\s|[0-9]ab{1,2}
@endregex`);
  assert.equal(getDiagramModuleKind(diagram), "regex");
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "\\d"));
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "[0-9]"));
  await layoutDiagramWithModule(diagram);
  const doc = exportDiagramWithModule(diagram, { sourceLabel: "regex-test" });
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
});
