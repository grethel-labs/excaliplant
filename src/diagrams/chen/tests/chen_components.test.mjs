import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("Chen diagrams parse entities, relationships and cardinalities", () => {
  const diagram = parsePlantUml(`@startchen
entity Person {
}
entity Location {
}
relationship Birthplace {
}
Person -N- Birthplace
Birthplace -1- Location
@endchen`);

  assert.equal(getDiagramModuleKind(diagram), "chen");
  assert.equal(diagram.boxById("Person").shape, "entity");
  assert.equal(diagram.boxById("Birthplace").shape, "diamond");
  assert.equal(diagram.connections.length, 2);
  assert.equal(diagram.connections[0].toMul, "N");
});

test("Chen diagrams parse attribute declarations", () => {
  const diagram = parsePlantUml(`@startchen
entity Person {
}
attribute Name {
}
Person - Name
@endchen`);

  assert.equal(diagram.boxById("Name").shape, "usecase");
  assert.equal(diagram.connections.length, 1);
});
