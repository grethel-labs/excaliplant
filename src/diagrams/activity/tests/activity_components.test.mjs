/**
 * Activity diagram component tests.
 * @module diagrams/activity/tests/activity_components
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../../../../index.mjs";
import { excalidrawToSvg } from "../../../general/render/svg.mjs";

test("activity beta actions support start stop and multiline text", async () => {
  const source = `@startuml
start
:Hello world;
:This is on defined on
several **lines**;
stop
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(!(diagram instanceof SequenceDiagram));
  assert.equal(diagram.kind, "activity");
  assert.ok(diagram.allBoxes().some((box) => box.shape === "start"));
  assert.ok(diagram.allBoxes().some((box) => box.shape === "end"));
  assert.ok(diagram.allBoxes().some((box) => box.title.includes("several lines")));
  assert.ok(diagram.connections.length >= 2);

  const doc = await renderPlantUml(source, { sourceLabel: "activity/beta-actions" });
  assert.ok(doc.elements.length > 0);
  assert.match(excalidrawToSvg(doc), /Hello world/);
});

test("activity beta conditions loops and parallel controls parse strictly", () => {
  const source = `@startuml
start
if (Graphviz installed?) then (yes)
  :process all diagrams;
else (no)
  :process only sequence and activity diagrams;
endif
repeat
  :read data;
  :generate diagrams;
repeat while (more data?) is (yes) not (no)
fork
  :Treatment 1;
fork again
  :Treatment 2;
end fork
stop
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(
    diagram.allBoxes().some((box) => box.shape === "choice" && box.title.includes("Graphviz")),
  );
  assert.ok(diagram.allBoxes().some((box) => box.shape === "fork"));
  assert.ok(diagram.allBoxes().some((box) => box.shape === "join"));
  assert.ok(diagram.connections.length >= 8);
});

test("activity legacy arrows and labels parse into deterministic flow", () => {
  const source = `@startuml

(*) --> "First Activity"
-->[You can put also labels] "Second Activity"
--> (*)

@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.equal(diagram.kind, "activity");
  assert.ok(diagram.allBoxes().some((box) => box.title === "First Activity"));
  assert.ok(diagram.allBoxes().some((box) => box.title === "Second Activity"));
  assert.ok(
    diagram.connections.some((connection) => connection.label === "You can put also labels"),
  );
  assert.ok(diagram.allBoxes().some((box) => box.shape === "end"));
});

test("activity partitions swimlanes notes connectors and goto parse strictly", async () => {
  const source = `@startuml
|Swimlane1|
start
partition #lightGreen "Input Interface" {
  :read config file;
  note right: Reads <b>safe</b> config
  (A)
}
label retry
goto retry
detach
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(diagram.allBoxes().some((box) => box.stereotype === "swimlane"));
  assert.ok(diagram.allBoxes().some((box) => box.stereotype === "partition"));
  assert.ok(diagram.allBoxes().some((box) => box.shape === "note"));
  assert.ok(diagram.allBoxes().some((box) => box.shape === "interface" && box.title === "A"));

  const doc = await renderPlantUml(source, { sourceLabel: "activity/containers" });
  const svg = excalidrawToSvg(doc);
  assert.match(svg, /Input Interface/);
  assert.doesNotMatch(svg, /<b>/);
});

test("activity SDL stereotypes and simple list actions render", async () => {
  const source = `@startuml
* Action 1
** Sub-Action 1.1
:input shape; <<input>>
:output shape; <<output>>
kill
@enduml`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(diagram.allBoxes().some((box) => box.title === "Action 1"));
  assert.ok(diagram.allBoxes().some((box) => box.stereotype === "input"));
  assert.ok(diagram.allBoxes().some((box) => box.stereotype === "output"));

  const doc = await renderPlantUml(source, { sourceLabel: "activity/sdl-list" });
  assert.ok(doc.elements.length > 0);
});
