import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("math diagrams parse standalone AsciiMath with safe text fallback", () => {
  const diagram = parsePlantUml(`@startmath
f(t)=(a_0)/2 + sum_(n=1)^oo a_n cos((n pi t)/L)
@endmath`);
  assert.equal(getDiagramModuleKind(diagram), "math");
  assert.match(diagram.planes[0].allBoxes[0].description, /sum_/);
});

test("inline math tags normalize to readable plain text", () => {
  const diagram = parsePlantUml(`@startuml
Bob -> Alice : Can you solve: <math>ax^2+bx+c=0</math>
@enduml`);
  assert.equal(diagram.connections[0].label, "Can you solve: Math: ax^2+bx+c=0");
});
