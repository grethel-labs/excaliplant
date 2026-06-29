import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("ebnf diagrams parse rules, terminals, options and repetitions", () => {
  const diagram = parsePlantUml(`@startebnf
binaryDigit = "0" | "1";
optional = [a];
zero_or_more = {a};
@endebnf`);
  assert.equal(getDiagramModuleKind(diagram), "ebnf");
  const titles = diagram.planes[0].allBoxes.map((box) => box.title);
  assert.ok(titles.includes("binaryDigit"));
  assert.ok(titles.includes("0"));
  assert.ok(titles.includes("a"));
});
