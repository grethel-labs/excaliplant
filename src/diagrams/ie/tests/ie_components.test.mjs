import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("IE diagrams parse crow-foot relationships", () => {
  const diagram = parsePlantUml(`@startuml
Entität01 }|..|| Entität02
Entität03 }o..o| Entität04
Entität05 ||--o{ Entität06
Entität07 |o--|| Entität08
@enduml`);

  assert.equal(getDiagramModuleKind(diagram), "ie");
  assert.equal(diagram.connections.length, 4);
  assert.equal(diagram.connections[0].fromMul, "}|");
  assert.equal(diagram.connections[1].fromMul, "}o");
  assert.equal(diagram.connections[1].toMul, "o|");
  assert.equal(diagram.connections[2].toMul, "o{");
});

test("IE diagrams parse entity attributes", () => {
  const diagram = parsePlantUml(`@startuml
entity Entität01 {
  * identifizierendes_attribut
  --
  * vorgeschriebenes_attribut
  optionales_attribut
}
Entität01 ||--o{ Entität02
@enduml`);

  const entity = diagram.boxById("Entität01");
  assert.ok(entity);
  assert.deepEqual(entity.members, [
    "* identifizierendes_attribut",
    "* vorgeschriebenes_attribut",
    "optionales_attribut",
  ]);
});
