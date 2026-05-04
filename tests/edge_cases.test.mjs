// Edge cases and parser-plugin extension points.
//
// These tests deliberately probe the *surface* of the parser & renderer
// rather than overall pipelines, so any future regression around a
// specific PlantUML construct surfaces quickly.

import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePlantUml,
  renderPlantUml,
  Diagram,
  SequenceDiagram,
  Box,
  Connection,
} from "../index.mjs";
import { DEFAULT_COMPONENT_PLUGINS } from "../src/parser/plantuml.mjs";

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
        id: m[2],
        title: m[1],
        shape: "rectangle",
        stereotype: "gauge",
      });
      return true;
    },
  };
  const d = parsePlantUml(`@startuml\ngauge "CPU" as cpu\n@enduml`, {
    plugins: { component: [gaugePlugin, ...DEFAULT_COMPONENT_PLUGINS] },
  });
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
  const plane = d.addPlane(
    new Plane({ id: "p", title: "P", color: planeColor("p"), kind: "package" }),
  );
  const a = plane.addBox(new Box({ id: "a", title: "A" }));
  const b = plane.addBox(new Box({ id: "b", title: "B" }));
  d.addConnection(new Connection({ id: "a->b", from: a, to: b, label: "" }));
  const { renderDiagram } = await import("../index.mjs");
  const doc = await renderDiagram(d);
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
});

// ---------------------------------------------------------------------------
// Class-diagram support (tplant-style PlantUML)
// ---------------------------------------------------------------------------

test("class diagram: interface / enum / abstract class blocks parse with members", () => {
  const src = `@startuml
interface SerializationContext {
    +visited: Set<number>
    +maxDepth: number
}

enum CanvasObjectState {
    PLACING
    SELECTABLE
    EDITING
}

abstract class BaseStyle {
    +color: Colord
    +{abstract} toSnapshot(): StyleSnapshot
    +{static} fromSnapshot(s: BorderSnapshot): BaseStyle
}
@enduml`;
  const d = parsePlantUml(src);
  const ctx = d.boxById("SerializationContext");
  assert.ok(ctx, "interface box should exist");
  assert.equal(ctx.shape, "interface");
  assert.equal(ctx.stereotype, "interface");
  assert.deepEqual(ctx.members, ["+visited: Set<number>", "+maxDepth: number"]);

  const enumBox = d.boxById("CanvasObjectState");
  assert.equal(enumBox.shape, "enum");
  assert.equal(enumBox.stereotype, "enumeration");
  assert.deepEqual(enumBox.members, ["PLACING", "SELECTABLE", "EDITING"]);

  const base = d.boxById("BaseStyle");
  assert.equal(base.shape, "class");
  assert.equal(base.stereotype, "abstract");
  // Modifier tags must survive `explodeBraces` and remain attached to
  // the member line.
  assert.ok(base.members.some((m) => m.includes("{abstract} toSnapshot")));
  assert.ok(base.members.some((m) => m.includes("{static} fromSnapshot")));
});

test("class diagram: extends / implements headers create inheritance + realisation edges", () => {
  const src = `@startuml
interface Serializable<TSnapshot extends BaseSnapshot> {
    +toSnapshot(): TSnapshot
}

interface StyleSnapshot extends BaseSnapshot {
    +styleType: string
}

abstract class BaseStyle implements Serializable {
    +color: Colord
}

class ObjectBorder extends BaseStyle {
    +thickness: number
}
@enduml`;
  const d = parsePlantUml(src);
  // Generics survive on the title but the id is the bare name.
  const serializable = d.boxById("Serializable");
  assert.ok(serializable);
  assert.match(serializable.title, /Serializable<TSnapshot extends BaseSnapshot>/);
  // Undeclared parents (BaseSnapshot) auto-vivify as class stubs so
  // inheritance edges aren't silently dropped.
  assert.ok(d.boxById("BaseSnapshot"), "BaseSnapshot should auto-vivify");
  // extends → inheritance, implements → realization.
  const inh = d.connections.find(
    (c) => c.from.id === "StyleSnapshot" && c.to.id === "BaseSnapshot",
  );
  assert.ok(inh);
  assert.equal(inh.kind, "inheritance");
  assert.equal(inh.dashed, false);
  const impl = d.connections.find((c) => c.from.id === "BaseStyle" && c.to.id === "Serializable");
  assert.ok(impl);
  assert.equal(impl.kind, "realization");
  assert.equal(impl.dashed, true);
  const ext = d.connections.find((c) => c.from.id === "ObjectBorder" && c.to.id === "BaseStyle");
  assert.ok(ext);
  assert.equal(ext.kind, "inheritance");
});

test("class diagram: connection multiplicity labels are captured", () => {
  const src = `@startuml
class A
class B
class C
A "1" o-- "0..*" B : contains
A --> "1" C
@enduml`;
  const d = parsePlantUml(src);
  const ab = d.connections.find((c) => c.from.id === "A" && c.to.id === "B");
  assert.ok(ab);
  assert.equal(ab.fromMul, "1");
  assert.equal(ab.toMul, "0..*");
  assert.equal(ab.label, "contains");
  assert.equal(ab.kind, "aggregation");
  const ac = d.connections.find((c) => c.from.id === "A" && c.to.id === "C");
  assert.ok(ac);
  assert.equal(ac.fromMul, "");
  assert.equal(ac.toMul, "1");
});

test("class diagram: skinparam preamble is silently accepted", () => {
  const src = `@startuml
skinparam linetype ortho
skinparam classBackgroundColor #FEFEFE
skinparam classBorderColor #333333
skinparam stereotypeCBackgroundColor #E8E8E8
class A
class B
A --> B
@enduml`;
  // No errors / unknown lines under strict mode.
  const d = parsePlantUml(src, { unknownLines: "strict" });
  assert.equal(d.connections.length, 1);
});

test("class diagram: end-to-end render of tplant-style source produces SVG", async () => {
  const src = `@startuml
skinparam linetype ortho

interface Serializable<TSnapshot extends BaseSnapshot> {
    +toSnapshot(): TSnapshot
}

enum CanvasObjectState {
    PLACING
    SELECTABLE
}

abstract class BaseStyle implements Serializable {
    +color: Colord
    +{abstract} toSnapshot(): StyleSnapshot
}

class ObjectBorder extends BaseStyle {
    +thickness: number
    +{static} fromSnapshot(s: BorderSnapshot): ObjectBorder
}

ObjectBorder --> "1" BorderType
@enduml`;
  const doc = await renderPlantUml(src);
  const { excalidrawToSvg } = await import("../index.mjs");
  const svg = excalidrawToSvg(doc);
  // Stereotypes rendered with guillemets.
  assert.match(svg, /«interface»/);
  assert.match(svg, /«enumeration»/);
  assert.match(svg, /«abstract»/);
  // Members survive into the rendered output.
  assert.ok(svg.includes("PLACING"));
  assert.ok(svg.includes("thickness"));
});
