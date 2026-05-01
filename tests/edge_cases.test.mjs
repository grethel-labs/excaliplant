// Edge cases and parser-plugin extension points.
//
// These tests deliberately probe the *surface* of the parser & renderer
// rather than overall pipelines, so any future regression around a
// specific PlantUML construct surfaces quickly.

import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePlantUml, renderPlantUml,
  Diagram, SequenceDiagram, Box, Connection,
} from "../index.mjs";
import {
  DEFAULT_COMPONENT_PLUGINS,
} from "../src/parser/plantuml.mjs";

// ---------------------------------------------------------------------------
// Empty / minimal inputs
// ---------------------------------------------------------------------------

test("empty input returns an empty Diagram", () => {
  const d = parsePlantUml("");
  assert.ok(d instanceof Diagram);
  assert.equal(d.planes.length, 0);
  assert.equal(d.connections.length, 0);
});

test("just @startuml/@enduml with no body still parses", () => {
  const d = parsePlantUml("@startuml\n@enduml");
  assert.ok(d instanceof Diagram);
  assert.equal(d.planes.length, 0);
});

test("free-standing top-level boxes land in a synthetic floating plane", () => {
  const d = parsePlantUml(`
@startuml
actor User
[Service] as svc
User --> svc
@enduml
  `);
  // Floating plane gets injected with id "__floating__".
  assert.equal(d.planes.length, 1);
  assert.equal(d.planes[0].id, "__floating__");
  assert.equal(d.planes[0].allBoxes.length, 2);
  assert.equal(d.connections.length, 1);
});

// ---------------------------------------------------------------------------
// Comments / skinparam / unknown lines are tolerated
// ---------------------------------------------------------------------------

test("skinparam, !theme, hide, comments are silently skipped", () => {
  const d = parsePlantUml(`
@startuml
' a leading-quote comment line
skinparam monochrome true
!theme reddress-darkred
hide stereotype
[A] as a
[B] as b   ' trailing comment
a --> b
@enduml
  `);
  assert.equal(d.boxById("a").title, "A");
  assert.equal(d.connections.length, 1);
});

// ---------------------------------------------------------------------------
// Bidirectional + reverse arrows
// ---------------------------------------------------------------------------

test("reverse arrows swap from/to, bidirectional sets both arrowheads", () => {
  const d = parsePlantUml(`
@startuml
[A] as a
[B] as b
[C] as c
b <-- a : reversed
a <--> c : bidir
@enduml
  `);
  const rev = d.connections.find((c) => c.label === "reversed");
  assert.equal(rev.from.id, "a");
  assert.equal(rev.to.id, "b");
  const bidir = d.connections.find((c) => c.label === "bidir");
  assert.equal(bidir.startArrowhead, "arrow");
  assert.equal(bidir.endArrowhead, "arrow");
});

// ---------------------------------------------------------------------------
// Inline brace explosion
// ---------------------------------------------------------------------------

test("inline `{ … }` containers parse correctly", () => {
  const d = parsePlantUml(`
@startuml
package "P" as p {
  [a]
  [b]
}
a --> b
@enduml
  `);
  assert.equal(d.planes.length, 1);
  assert.equal(d.planes[0].allBoxes.length, 2);
  assert.equal(d.connections.length, 1);
});

// ---------------------------------------------------------------------------
// Multi-line note block
// ---------------------------------------------------------------------------

test("multi-line `note … end note` block keeps line breaks", () => {
  const d = parsePlantUml(`
@startuml
[X] as x
note right of x
  line one
  line two
end note
@enduml
  `);
  const noteBox = d.allBoxes().find((b) => b.shape === "note");
  assert.ok(noteBox);
  assert.match(noteBox.description, /line one/);
  assert.match(noteBox.description, /line two/);
});

// ---------------------------------------------------------------------------
// Self-message in sequence
// ---------------------------------------------------------------------------

test("sequence self-message is classified as kind=self", () => {
  const d = parsePlantUml(`
@startuml
participant A
A -> A : tick
@enduml
  `);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.messages.length, 1);
  assert.equal(d.messages[0].kind, "self");
});

// ---------------------------------------------------------------------------
// Async (>>) and reply (--) sequence arrows
// ---------------------------------------------------------------------------

test("sequence async (->>) and reply (-->) arrows are distinguished", () => {
  const d = parsePlantUml(`
@startuml
participant A
participant B
A ->> B : async
B --> A : reply
@enduml
  `);
  assert.equal(d.messages[0].kind, "async");
  assert.equal(d.messages[0].endArrowhead, "arrow");
  assert.equal(d.messages[1].kind, "reply");
  assert.equal(d.messages[1].dashed, true);
});

// ---------------------------------------------------------------------------
// Plugin extension API: a custom plugin recognises a fictional `gauge X`
// keyword without changing any library code.
// ---------------------------------------------------------------------------

test("custom plugins can be injected via opts.plugins.component", () => {
  const gaugePlugin = {
    name: "test.gauge",
    tryLine(line, ctx) {
      const m = line.match(/^gauge\s+"([^"]+)"\s+as\s+(\S+)$/);
      if (!m) return false;
      ctx.addBox({
        id: m[2], title: m[1], shape: "rectangle",
        stereotype: "gauge",
      });
      return true;
    },
  };
  const d = parsePlantUml(
    `@startuml\ngauge "CPU" as cpu\n@enduml`,
    { plugins: { component: [gaugePlugin, ...DEFAULT_COMPONENT_PLUGINS] } },
  );
  const cpu = d.boxById("cpu");
  assert.ok(cpu);
  assert.equal(cpu.stereotype, "gauge");
});

// ---------------------------------------------------------------------------
// Renderer determinism: same input → same element count.
// ---------------------------------------------------------------------------

test("renderPlantUml is deterministic in element count", async () => {
  const SRC = `
@startuml
[A] as a
[B] as b
a --> b : x
@enduml`;
  const a = await renderPlantUml(SRC);
  const b = await renderPlantUml(SRC);
  assert.equal(a.elements.length, b.elements.length);
});

// ---------------------------------------------------------------------------
// Direction hints survive round-trip into the model.
// ---------------------------------------------------------------------------

test("direction hint -up-/-down-/-left-/-right- is preserved", () => {
  const d = parsePlantUml(`
@startuml
[A] as a
[B] as b
[C] as c
[D] as d
a -up-> b
b -down-> c
c -left-> d
d -right-> a
@enduml
  `);
  const hints = d.connections.map((c) => c.directionHint);
  assert.deepEqual(hints.sort(), ["down", "left", "right", "up"]);
});

// ---------------------------------------------------------------------------
// Programmatic API: build a Diagram by hand, render it.
// ---------------------------------------------------------------------------

test("renderDiagram works with a hand-built model (no PlantUML)", async () => {
  const d = new Diagram();
  const { Plane } = await import("../src/model/diagram.mjs");
  const { planeColor } = await import("../src/style/colors.mjs");
  const plane = d.addPlane(new Plane({ id: "p", title: "P", color: planeColor("p"), kind: "package" }));
  const a = plane.addBox(new Box({ id: "a", title: "A" }));
  const b = plane.addBox(new Box({ id: "b", title: "B" }));
  d.addConnection(new Connection({ id: "a->b", from: a, to: b, label: "" }));
  const { renderDiagram } = await import("../index.mjs");
  const doc = await renderDiagram(d);
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
});
