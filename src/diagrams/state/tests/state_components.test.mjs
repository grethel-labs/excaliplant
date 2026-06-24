/**
 * State diagram component tests.
 * @module diagrams/state/tests/state_components
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, Diagram } from "../../../../index.mjs";
import { excalidrawToSvg } from "../../../general/render/svg.mjs";

test("state official simple transitions and descriptions parse strictly", async () => {
  const source = `@startuml
[*] --> State1
State1 --> [*]
State1 : this is a string
State1 : this is another string
State1 -> State2
State2 --> [*]
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(diagram instanceof Diagram);
  assert.equal(diagram.kind, "state");
  assert.deepEqual(diagram.boxById("State1").members, [
    "this is a string",
    "this is another string",
  ]);
  assert.equal(diagram.boxById("state_start").shape, "start");
  assert.equal(diagram.boxById("state_end").shape, "end");
  assert.ok(
    diagram.connections.some(
      (connection) => connection.from.id === "State1" && connection.to.id === "State2",
    ),
  );

  const doc = await renderPlantUml(source, { sourceLabel: "state/simple" });
  assert.ok(doc.elements.length > 0);
  assert.match(excalidrawToSvg(doc), /this is a string/);
});

test("state official composite example parses inner transitions", () => {
  const source = `@startuml
scale 350 width
[*] --> NotShooting

state NotShooting {
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(diagram.boxById("NotShooting"));
  assert.ok(diagram.boxById("Idle"));
  assert.ok(diagram.boxById("Configuring"));
  assert.ok(diagram.connections.some((connection) => connection.label === "EvConfig"));
});

test("state pseudostates, aliases and concurrent separators are modeled", () => {
  const source = `@startuml
state "Complex State" as complex
state choice1 <<choice>>
state fork1 <<fork>>
state join1 <<join>>
state h <<history>>
state hd <<history*>>
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn
  --
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn
}
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.equal(diagram.boxById("complex").title, "Complex State");
  assert.equal(diagram.boxById("choice1").shape, "choice");
  assert.equal(diagram.boxById("fork1").shape, "fork");
  assert.equal(diagram.boxById("join1").shape, "join");
  assert.equal(diagram.boxById("h").shape, "history");
  assert.equal(diagram.boxById("hd").shape, "history_deep");
  assert.ok(diagram.boxById("Active"));
  assert.ok(diagram.connections.some((connection) => connection.to.id === "NumLockOn"));
});

test("state notes and JSON display render safely", async () => {
  const source = `@startuml
state CurrentSite #pink {
  state HardwareSetup #lightblue
}
note right of CurrentSite : composite <b>note</b>
json JSON {
  "fruit":"Apple",
  "size":"Large"
}
CurrentSite --> JSON : exports
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.equal(diagram.boxById("JSON").shape, "map");
  assert.ok(diagram.boxById("JSON").members.some((member) => member.includes('"fruit":"Apple"')));
  assert.ok(diagram.allBoxes().some((box) => box.shape === "note"));

  const doc = await renderPlantUml(source, { sourceLabel: "state/json-note" });
  const svg = excalidrawToSvg(doc);
  assert.match(svg, /composite note/);
  assert.doesNotMatch(svg, /<b>/);
});
