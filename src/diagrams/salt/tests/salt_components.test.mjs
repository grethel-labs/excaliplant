import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("salt diagrams parse documented basic controls", () => {
  const diagram = parsePlantUml(`@startsalt
{
  Just plain text
  [This is my button]
  () Unchecked radio
  (X) Checked radio
  [] Unchecked box
  [X] Checked box
  "Enter text here"
  ^This is a droplist^
}
@endsalt`);
  assert.equal(getDiagramModuleKind(diagram), "salt");
  const titles = diagram.planes[0].allBoxes.map((box) => box.title);
  assert.ok(titles.includes("This is my button"));
  assert.ok(titles.includes("Unchecked radio"));
  assert.ok(titles.includes("Enter text here"));
});
