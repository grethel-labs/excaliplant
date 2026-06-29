import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("json diagrams parse structured data and highlight paths", () => {
  const diagram = parsePlantUml(`@startjson
#highlight "address" / "city"
{
  "firstName": "John",
  "lastName": "Smith",
  "address": { "city": "New York" },
  "color": ["Red", "Green"]
}
@endjson`);
  assert.equal(getDiagramModuleKind(diagram), "json");
  const boxes = diagram.planes[0].allBoxes;
  assert.ok(boxes.some((box) => box.title === "address"));
  assert.ok(boxes.some((box) => box.title === "city" && box.stereotype === "<<highlight>>"));
});
