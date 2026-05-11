/**
 * Activity diagram component tests.
 * @module diagrams/activity/tests/activity_components
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { parsePlantUml } from "../../../main/parser.mjs";
import { layoutDiagram } from "../../../general/layout/elk_layout.mjs";
import { exportDiagram } from "../../../general/render/excalidraw.mjs";

describe("Activity Diagram Parser", () => {
  describe("Basic Actions", () => {
    it("should parse start and stop", () => {
      const puml = `@startuml
start
:Hello world;
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram, "Should produce a diagram");
      assert.strictEqual(result.diagram.kind, "activity");
    });

    it("should parse action with text", () => {
      const puml = `@startuml
start
:This is an action;
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });

    it("should parse multiline action", () => {
      const puml = `@startuml
start
:This is on
several lines;
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });
  });

  describe("Conditions", () => {
    it("should parse if/then/else", () => {
      const puml = `@startuml
start
if (Graphviz installed?) then (yes)
  :process all diagrams;
else (no)
  :skip;
endif
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });

    it("should parse switch/case", () => {
      const puml = `@startuml
start
switch (mode?)
case (A)
  :A;
case (B)
  :B;
endswitch
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });
  });

  describe("Loops", () => {
    it("should parse while loop", () => {
      const puml = `@startuml
start
while (queue?)
  :consume;
endwhile
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });

    it("should parse repeat loop", () => {
      const puml = `@startuml
start
repeat
  :read data;
  :generate diagrams;
repeat while (more data?)
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });
  });

  describe("Parallel Flows", () => {
    it("should parse fork", () => {
      const puml = `@startuml
start
fork
  :Treatment 1;
fork again
  :Treatment 2;
end fork
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });

    it("should parse split", () => {
      const puml = `@startuml
start
split
  :A;
split again
  :B;
end split
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });
  });

  describe("Swimlanes", () => {
    it("should parse swimlane", () => {
      const puml = `@startuml
|Swimlane1|
start
:Action 1;
|Swimlane2|
:Action 2;
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });
  });

  describe("Notes", () => {
    it("should parse floating note", () => {
      const puml = `@startuml
start
:Action;
floating note left: This is a note
stop
@enduml`;

      const result = parsePlantUml(puml);
      assert.ok(result.diagram);
    });
  });
});

describe("Activity Diagram Layout", () => {
  it("should layout basic activity diagram", () => {
    const puml = `@startuml
start
:Hello world;
stop
@enduml`;

    const parseResult = parsePlantUml(puml);
    assert.ok(parseResult.diagram);

    const layoutResult = layoutDiagram(parseResult.diagram);
    assert.ok(layoutResult);
  });
});

describe("Activity Diagram Renderer", () => {
  it("should render basic activity diagram to Excalidraw", () => {
    const puml = `@startuml
start
:Hello world;
stop
@enduml`;

    const parseResult = parsePlantUml(puml);
    const layoutResult = layoutDiagram(parseResult.diagram);
    const exportResult = exportDiagram(layoutResult, { format: "excalidraw" });

    assert.ok(exportResult.elements);
    assert.ok(Array.isArray(exportResult.elements));
  });
});
