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
  exportDiagram,
  Diagram,
  SequenceDiagram,
  Box,
  Connection,
  setStyle,
  resetStyle,
} from "../index.mjs";
import { DEFAULT_COMPONENT_PLUGINS } from "../src/main/parser.mjs";
import { writeOutput } from "./helpers/output.mjs";

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

test("PlantUML block comments are stripped before strict parsing", () => {
  const d = parsePlantUml(
    `
@startuml
/' case 1 '/ [A] as a
/'
  [Ignored] as ignored
  ignored --> a
'/
[B] as b
a --> b
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.equal(d.boxById("a").title, "A");
  assert.equal(d.boxById("b").title, "B");
  assert.equal(d.boxById("ignored"), null);
  assert.equal(d.connections.length, 1);
});

test("PlantUML block comments are stripped before diagram detection", () => {
  const d = parsePlantUml(
    `
@startuml
/'
  [Not a component diagram] as ignored
'/
participant Alice
participant Bob
Alice -> Bob : hi
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.messages.length, 1);
  assert.equal(d.messages[0].label, "hi");
});

test("PlantUML block comment markers inside quoted text survive", () => {
  const d = parsePlantUml(
    `
@startuml
component "literal /' not a comment '/ label" as quoted
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.equal(d.boxById("quoted").title, "literal /' not a comment '/ label");
});

test("PlantUML typed start/end directives and layout controls are strict-tolerant", () => {
  const d = parsePlantUml(
    `
@startcomponent
scale 180*90
zoom 2
page 2x2
split
[A] as a
@endcomponent
  `,
    { unknownLines: "strict" },
  );

  assert.equal(d.boxById("a").title, "A");
});

test("PlantUML style blocks are strict-tolerant and apply safe graph colors", () => {
  const graph = parsePlantUml(
    `
@startuml
<style>
component {
  BackGroundColor: #ff0000;
  LineColor: #00aa00;
}
arrow {
  LineColor: #123456;
}
</style>
[A] as a
@enduml
  `,
    { unknownLines: "strict" },
  );
  assert.equal(graph.boxById("a").title, "A");
  assert.equal(graph.style.boxBackgroundColor, "#ff0000");
  assert.equal(graph.style.boxBorderColor, "#00aa00");
  assert.equal(graph.style.arrowColor, "#123456");

  const sequence = parsePlantUml(
    `
@startuml
<style>
sequenceDiagram {
  participant {
    FontColor: javascript:alert(1);
  }
}
</style>
Alice -> Bob : hi
@enduml
  `,
    { unknownLines: "strict" },
  );
  assert.ok(sequence instanceof SequenceDiagram);
  assert.equal(sequence.messages.length, 1);
});

test("graph PlantUML skinparams map safe color properties", () => {
  const d = parsePlantUml(
    `
@startuml
skinparam backgroundColor #ffffff
skinparam componentBackgroundColor #fef9c3
skinparam componentBorderColor #00aa00
skinparam componentFontColor blue
skinparam arrowColor #123456
skinparam noteBackgroundColor #dbeafe
skinparam noteBorderColor #1d4ed8
skinparam noteFontColor #333333
skinparam packageBackgroundColor #f8fafc
skinparam packageBorderColor #64748b
skinparam packageFontColor #0f172a
package "Services" as services {
  [API] as api
  [DB] as db
}
api --> db : SQL
note right of api : cached
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.equal(d.style.backgroundColor, "#ffffff");
  assert.equal(d.style.boxBackgroundColor, "#fef9c3");
  assert.equal(d.style.boxBorderColor, "#00aa00");
  assert.equal(d.style.boxFontColor, "blue");
  assert.equal(d.style.arrowColor, "#123456");
  assert.equal(d.style.noteBackgroundColor, "#dbeafe");
  assert.equal(d.style.noteBorderColor, "#1d4ed8");
  assert.equal(d.style.noteFontColor, "#333333");
  assert.equal(d.style.containerBackgroundColor, "#f8fafc");
  assert.equal(d.style.containerBorderColor, "#64748b");
  assert.equal(d.style.containerFontColor, "#0f172a");
});

test("sequence PlantUML style blocks map safe color properties", () => {
  const d = parsePlantUml(
    `
@startuml
<style>
sequenceDiagram {
  participant {
    BackgroundColor: #LightYellow;
    LineColor: #00aa00;
    FontColor: blue;
  }
  arrow {
    LineColor: #123456;
    FontColor: red;
  }
  note {
    BackgroundColor: lightblue;
    FontColor: #333333;
  }
  group {
    BorderColor: #LightGray;
  }
  lifeline {
    LineColor: #0000ff;
  }
}
</style>
participant Alice
participant Bob
Alice -> Bob : hello
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.style.participantBackgroundColor, "#LightYellow");
  assert.equal(d.style.participantBorderColor, "#00aa00");
  assert.equal(d.style.participantFontColor, "blue");
  assert.equal(d.style.arrowColor, "#123456");
  assert.equal(d.style.messageFontColor, "red");
  assert.equal(d.style.noteBackgroundColor, "lightblue");
  assert.equal(d.style.noteFontColor, "#333333");
  assert.equal(d.style.groupBorderColor, "#LightGray");
  assert.equal(d.style.lifelineColor, "#0000ff");
});

test("PlantUML Creole and legacy text markup degrades to readable graph text", () => {
  const d = parsePlantUml(
    `
@startuml
title **Runtime** <U+221E> <&code> <:1f600:>
component "Service **API**" as api : <b>Public</b> __HTTP__
class Property {
  <#transparent,#transparent>|<:link:>| id| iri| 1..1|
  +**save**(): void
}
note right of api
  = Heading
  * First
  ** Second
  |<#yellow>| key | value |
  <code>main()</code>
end note
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.equal(d.title, "Runtime ∞ code :1f600:");
  assert.equal(d.boxById("api").title, "Service API");
  assert.equal(d.boxById("api").description, "Public HTTP");
  assert.deepEqual(d.boxById("Property").members, [":link: | id | iri | 1..1", "+save(): void"]);
  const note = d.planes[0].allBoxes.find((box) => box.shape === "note");
  assert.match(note?.description || "", /Heading/);
  assert.match(note?.description || "", /- First/);
  assert.match(note?.description || "", /  - Second/);
  assert.match(note?.description || "", /key \| value/);
  assert.match(note?.description || "", /main\(\)/);
});

test("PlantUML Creole and legacy text markup degrades to readable sequence text", () => {
  const d = parsePlantUml(
    `
@startuml
participant "**Alice**" as A
participant Bob
box "<b>Group</b>"
A -> Bob : //hello// <U+221E> <&code>
alt **ok**
else <i>fail</i>
end
note over A
  = Heading
  # Item
end note
end box
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.equal(d.participantById("A").title, "Alice");
  assert.equal(d.participantGroups[0].label, "Group");
  assert.equal(d.messages[0].label, "hello ∞ code");
  assert.equal(d.fragments[0].label, "ok");
  assert.equal(d.fragments[0].operands[1].label, "fail");
  assert.match(d.notes[0].text, /Heading/);
  assert.match(d.notes[0].text, /- Item/);
});

test("sequence caption and legend are preserved as presentation metadata", () => {
  const d = parsePlantUml(
    `
@startuml
participant Alice
participant Bob
caption "Flow caption"
legend right
  first line
  second line
end legend
Alice -> Bob : hi
@enduml
  `,
    { unknownLines: "strict" },
  );

  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.caption, "Flow caption");
  assert.equal(d.legend, "first line\nsecond line");
  assert.equal(d.messages.length, 1);
});

test("shared parser helpers collect block lines and parse titles", async () => {
  const { collectBlockLines } = await import("../src/util/plantuml_utils.mjs");
  const { createTitlePlugin } = await import("../src/diagrams/shared/common_plugins/title.mjs");
  /** @type {string[][]} */
  const completed = [];
  const block = collectBlockLines(/^end$/i, (lines) => completed.push(lines));

  block.onLine("first");
  block.onLine("second");

  assert.equal(block.tryEnd("not yet", {}), false);
  assert.equal(block.tryEnd("end", {}), true);
  assert.deepEqual(completed, [["first", "second"]]);

  const titlePlugin = createTitlePlugin("test.title");
  let parsedTitle = "";
  const ctx = {
    setTitle(title) {
      parsedTitle = title;
    },
  };

  assert.equal(titlePlugin.tryLine?.('title "Shared Title"', ctx), true);
  assert.equal(parsedTitle, "Shared Title");
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
  const { Plane } = await import("../src/general/model/diagram.mjs");
  const { planeColor } = await import("../src/general/style/colors.mjs");
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

test("graph edge label chips use arrow colour and contain topology labels", async () => {
  const doc = await renderPlantUml(`@startuml
title Network Topology
left to right direction

card "reachability.management" as capability_reachability_management
rectangle "cp-0001" as cp_0001
rectangle "dpl-0001" as dpl_0001
rectangle "Deployment Host Management Endpoint" as endpoint_dpl_0001_management
rectangle "Management Network" as network_management
rectangle "SSH Access" as service_ssh
rectangle "Management VLAN" as vlan_management

endpoint_dpl_0001_management --> service_ssh : exposes-service
endpoint_dpl_0001_management --> capability_reachability_management : has-reachability
endpoint_dpl_0001_management --> network_management : uses-network
network_management --> cp_0001 : connects
network_management --> dpl_0001 : connects
network_management --> service_ssh : exposes-service
network_management --> vlan_management : uses-vlan
service_ssh --> network_management : uses-network
vlan_management --> network_management : backs-network
@enduml`);

  assertEdgeLabelChipsContainText(doc);
  assertEdgeLabelChipsUseArrowColour(doc);
});

test("graph edge label chips fit multiline and long unbreakable labels", async () => {
  resetStyle();
  setStyle({ edgeLabel: { maxWidth: 72, paddingX: 5, paddingY: 3 }, font: { sizeEdgeLabel: 12 } });
  try {
    const d = new Diagram();
    const { Plane } = await import("../src/general/model/diagram.mjs");
    const { planeColor } = await import("../src/general/style/colors.mjs");
    const plane = d.addPlane(
      new Plane({ id: "p", title: "P", color: planeColor("p"), kind: "package" }),
    );
    const a = plane.addBox(new Box({ id: "a", title: "Source" }));
    const b = plane.addBox(new Box({ id: "b", title: "Target" }));
    d.addConnection(
      new Connection({
        id: "a->b",
        from: a,
        to: b,
        label: "first line\nsecond-line-with-hyphens\nVeryLongUnbreakableEndpointName",
      }),
    );

    const { renderDiagram } = await import("../index.mjs");
    const doc = await renderDiagram(d);
    assertEdgeLabelChipsContainText(doc);
    assertEdgeLabelChipsUseArrowColour(doc);

    const label = doc.elements.find((element) => element.customData?.role === "edgeLabelText");
    assert.ok(label, "expected edge-label text");
    assert.ok(String(label.text).includes("\n"), "expected multiline rendered label");
    assert.ok(label.fontSize <= 12, "expected fitted font size to be no larger than requested");
  } finally {
    resetStyle();
  }
});

test("graph edge label chips keep a minimum gap when routed labels overlap", async () => {
  resetStyle();
  setStyle({ edgeLabel: { minGap: 10, maxWidth: 96 } });
  try {
    const d = new Diagram();
    const { Plane } = await import("../src/general/model/diagram.mjs");
    const { planeColor } = await import("../src/general/style/colors.mjs");
    const plane = d.addPlane(
      new Plane({ id: "p", title: "P", color: planeColor("p"), kind: "package" }),
    );
    const a = plane.addBox(new Box({ id: "a", title: "A" }));
    const b = plane.addBox(new Box({ id: "b", title: "B" }));
    a.x = 0;
    a.y = 0;
    a.width = 80;
    a.height = 40;
    b.x = 260;
    b.y = 0;
    b.width = 80;
    b.height = 40;

    const first = d.addConnection(new Connection({ id: "a->b:1", from: a, to: b, label: "alpha" }));
    const second = d.addConnection(new Connection({ id: "a->b:2", from: a, to: b, label: "beta" }));
    first.path = [
      { x: 80, y: 20 },
      { x: 260, y: 20 },
    ];
    second.path = [
      { x: 80, y: 20 },
      { x: 260, y: 20 },
    ];

    const doc = exportDiagram(d);
    assertEdgeLabelChipsContainText(doc);
    assertEdgeLabelChipsUseArrowColour(doc);
    assertEdgeLabelChipsKeepDistance(doc, 10);
    assert.ok(
      doc.elements.some(
        (element) =>
          element.customData?.role === "edgeLabelChip" && element.customData?.avoidedOverlap,
      ),
      "expected at least one chip to be moved away from an occupied label area",
    );
  } finally {
    resetStyle();
  }
});

/**
 * @param {{elements:Array<Record<string, any>>}} doc
 */
function assertEdgeLabelChipsContainText(doc) {
  const chips = doc.elements.filter((element) => element.customData?.role === "edgeLabelChip");
  const labels = doc.elements.filter((element) => element.customData?.role === "edgeLabelText");
  assert.ok(chips.length > 0, "expected edge-label chips");
  assert.equal(labels.length, chips.length, "expected one text element per edge-label chip");

  for (const label of labels) {
    const chip = chips.find(
      (candidate) => candidate.customData?.connectionId === label.customData?.connectionId,
    );
    assert.ok(chip, `missing chip for ${label.customData?.connectionId}`);
    assert.ok(label.x >= chip.x, "label starts before chip");
    assert.ok(label.y >= chip.y, "label starts above chip");
    assert.ok(label.x + label.width <= chip.x + chip.width + 0.5, "label overflows chip width");
    assert.ok(label.y + label.height <= chip.y + chip.height + 0.5, "label overflows chip height");
    assert.ok(
      (label.customData?.measuredWidth || 0) <= label.width + 0.5,
      "measured label text overflows text box width",
    );
    assert.ok(
      (label.customData?.measuredHeight || 0) <= label.height + 0.5,
      "measured label text overflows text box height",
    );
  }
}

/**
 * @param {{elements:Array<Record<string, any>>}} doc
 * @param {number} minGap
 */
function assertEdgeLabelChipsKeepDistance(doc, minGap) {
  const chips = doc.elements.filter((element) => element.customData?.role === "edgeLabelChip");
  for (let i = 0; i < chips.length; i++) {
    for (let j = i + 1; j < chips.length; j++) {
      assert.equal(
        expandedBoundsOverlap(chips[i], chips[j], minGap),
        false,
        `edge-label chips ${i} and ${j} overlap or violate ${minGap}px gap`,
      );
    }
  }
}

/**
 * @param {Record<string, any>} a
 * @param {Record<string, any>} b
 * @param {number} gap
 * @returns {boolean}
 */
function expandedBoundsOverlap(a, b, gap) {
  return (
    a.x - gap < b.x + b.width &&
    a.x + a.width + gap > b.x &&
    a.y - gap < b.y + b.height &&
    a.y + a.height + gap > b.y
  );
}

/**
 * @param {{elements:Array<Record<string, any>>}} doc
 */
function assertEdgeLabelChipsUseArrowColour(doc) {
  const arrows = doc.elements.filter((element) => element.customData?.role === "connectionArrow");
  const chips = doc.elements.filter((element) => element.customData?.role === "edgeLabelChip");
  assert.ok(arrows.length > 0, "expected connection arrows");
  for (const chip of chips) {
    const arrow = arrows.find(
      (candidate) => candidate.customData?.connectionId === chip.customData?.connectionId,
    );
    assert.ok(arrow, `missing arrow for ${chip.customData?.connectionId}`);
    assert.equal(chip.backgroundColor, arrow.strokeColor);
    assert.equal(chip.customData?.lineColor, arrow.strokeColor);
  }
}

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

// ---------------------------------------------------------------------------
// Visual regression: large class diagram with enums, interfaces, abstract
// classes and concrete subclasses.
//
// Known issues captured here as failing assertions so that fixes can be
// verified against this baseline:
//
//  1. Text overflow – member text exceeds the box width causing visual
//     clipping / overflow in the rendered SVG.
//  2. Spurious root plane – all boxes land inside a single synthetic
//     wrapper plane even though none of the top-level declarations sit
//     inside an explicit `package` / `namespace` container.  The diagram
//     should have `planes.length === 0` (all boxes floating) once fixed.
//  3. Excessive vertical stacking – the layout becomes a tall single
//     column instead of a more balanced 2-D graph.  This is a symptom of
//     issue 2: ELK treats the wrapper plane as a single cluster and
//     stacks its children vertically.
// ---------------------------------------------------------------------------

const FLUFFLE_SRC = `@startuml
!define RECTANGLE class

skinparam backgroundColor white
skinparam classBackgroundColor #FEFEFE
skinparam classBorderColor #333333
skinparam arrowColor #333333
skinparam stereotypeCBackgroundColor #E8E8E8

skinparam linetype ortho
skinparam ranksep 60
skinparam nodesep 40
skinparam padding 4
skinparam roundcorner 8

enum QuantumFluffleType {
    WAFFLE
    PANCAKE
    DONUT
    NOODLE
    SPAGHETTI
    CLOUD
    SCREAM
    SIGNBOARD
    VOID
}

enum CrustAlignment {
    soggy
    chewy
    burnt
}

enum UnicornStretchMode {
    SQUISH
    SMOTHER
    WRAP
    PETRIFIED
}

interface SparkleSnapshot extends BaseCrystal {
    +sparkleFlavor: string
    +sparkleDescription: string
    +isShiny: boolean
    +ghostliness: number
    +rainbowHex: string
}

interface CrustSnapshot extends SparkleSnapshot {
    +kind: "crust"
    +crunchiness: number
    +type: CrustAlignment
    +zigzagPattern: number[]
}

interface FillingSnapshot extends SparkleSnapshot {
    +kind: "filling"
}

interface BlingSnapshot extends SparkleSnapshot {
    +kind: "disco-bling"
}

interface PhysicsDenialSnapshot extends BaseCrystal {
    +kind: "physics-denial"
    +canWobble: boolean
    +canSpin: boolean
    +canGrow: boolean
    +joinGroupHugs: boolean
    +enableRealityHacking: boolean
    +mustStaySquare: boolean
    +minFluffiness: number
    +minSquishiness: number
    +spinSpeedLimit: number
    +syncNameToOven?: boolean
    +syncDescriptionToOven?: boolean
    +showGeneralNonsense: boolean
    +showIdentityCrisis: boolean
    +showSecretProperties: boolean
    +showTransmogrification: boolean
    +editPositionX: boolean
    +editPositionY: boolean
    +editSizeW: boolean
    +editSizeH: boolean
    +showCreamFilling: boolean
    +showSandwichCrust: boolean
    +showDiscoBling: boolean
    +showMoodRing: boolean
    +showMetaNarrative: boolean
}

interface ExtraMagicSnapshot extends BaseCrystal {
    +kind: string
}

interface WandWavingGuide {
    +id: string
    +title: string
    +description?: string
    +defaultOpen?: boolean
    +placement?: "magical" | "mundane"
    +fields: WandWavingFieldDescriptor[]
    +visibleWhenKey?: string
}

interface FluffleSnapshot extends BaseCrystal {
    +id: number
    +x: number
    +y: number
    +rotation: number
    +visible: boolean
    +name: string
    +description: string
    +manifestationVariant: number
    +crust: CrustSnapshot
    +filling: FillingSnapshot
    +discoBling: BlingSnapshot[]
    +physicsDenial: PhysicsDenialSnapshot
    +extraMagic: ExtraMagicSnapshot
}

abstract class BaseSparkle implements Magical {
    +sparkleFlavor: string
    +sparkleDescription: string
    +isShiny: boolean
    +ghostliness: number
    +rainbowHex: Rainbowd
    +getRainbowHex(): string
    +{abstract} captureInCrystalBall(ctx?: CrystalBallContext): SparkleSnapshot
    +getHoverSparkle(): string
    +getClickSparkle(): string
    +getDisplaySparkle(isDark: boolean): string
    +getDisplayHoverSparkle(isDark: boolean): string
    +getDisplayClickSparkle(isDark: boolean): string
    +setSparkleFromDisplay(displayHex: AnyColor, isDark: boolean): void
    +getDisplayRainbowd(isDark: boolean): Rainbowd
}

abstract class AbstractFluffle implements Magical {
    +type: QuantumFluffleType
    +id: number
    +x: number
    +y: number
    +rotation: number
    +visible: boolean
    +name: string
    +description: string
    +manifestationVariant: number
    -_mood: QuantumFluffleMood
    +crust: SandwichCrust
    +filling: CreamFilling
    +discoBling: DiscoBling[]
    +selectedCrust: SandwichCrust
    +selectedFilling: CreamFilling
    +physicsDenial: PhysicsDenial
    +extraMagic: ExtraMagic
    +isDark: boolean
    +getDiscoBling(name: string): DiscoBling
    +mood: QuantumFluffleMood
    +setMood(newMood: QuantumFluffleMood): boolean
    +updateProperties(props: Partial<Omit<this, "type" | "id">>): void
    +{abstract} captureInCrystalBall(ctx?: CrystalBallContext): FluffleSnapshot
    #{abstract} createCollisionObject(): Flatten.AnyShape
    +isHamsterInside(x: number, y: number): boolean
    +cuddlesWith(other: AbstractFluffle): boolean
    +containedWithin(container: AbstractFluffle): boolean
    +{abstract} cloneWithNewSoul(newId: number): AbstractFluffle
    +getWandWavingGuides(): WandWavingGuide[]
}

class SandwichCrust extends BaseSparkle {
    +crunchiness: number
    +texture: CrustAlignment
    +zigzagPattern: number[]
    +captureInCrystalBall(): CrustSnapshot
    +clone(): SandwichCrust
    +{static} fromCrystalBall(snapshot: CrustSnapshot): SandwichCrust
}

class CreamFilling extends BaseSparkle {
    +captureInCrystalBall(): FillingSnapshot
    +clone(): CreamFilling
    +getHoverSparkle(): string
    +getClickSparkle(): string
    +getDisplayHoverSparkle(isDark: boolean): string
    +getDisplayClickSparkle(isDark: boolean): string
    +{static} fromCrystalBall(snapshot: FillingSnapshot): CreamFilling
}

class DiscoBling extends BaseSparkle {
    +captureInCrystalBall(): BlingSnapshot
    +clone(): DiscoBling
    +{static} fromCrystalBall(snapshot: BlingSnapshot): DiscoBling
}

class PhysicsDenial implements Magical {
    +canWobble: boolean
    +canSpin: boolean
    +canGrow: boolean
    +joinGroupHugs: boolean
    +enableRealityHacking: boolean
    +mustStaySquare: boolean
    +minFluffiness: number
    +minSquishiness: number
    +spinSpeedLimit: number
    +syncNameToOven: boolean
    +syncDescriptionToOven: boolean
    +showGeneralNonsense: boolean
    +showIdentityCrisis: boolean
    +showSecretProperties: boolean
    +showTransmogrification: boolean
    +editPositionX: boolean
    +editPositionY: boolean
    +editSizeW: boolean
    +editSizeH: boolean
    +showCreamFilling: boolean
    +showSandwichCrust: boolean
    +showDiscoBling: boolean
    +showMoodRing: boolean
    +showMetaNarrative: boolean
    +captureInCrystalBall(): PhysicsDenialSnapshot
    +{static} fromCrystalBall(snapshot: PhysicsDenialSnapshot): PhysicsDenial
}

class ExtraMagic implements Magical {
    +captureInCrystalBall(): ExtraMagicSnapshot
}

class PancakeMagic extends ExtraMagic {
    +captureInCrystalBall(): PancakeMagicSnapshot
    +{static} fromCrystalBall(_snapshot: PancakeMagicSnapshot): PancakeMagic
}

class FluffyPancake extends AbstractFluffle {
    +width: number
    +height: number
    +manifestationVariant: 0 | 1 | 2
    +extraMagic: PancakeMagic
    +updateProperties(props: Partial<FluffyPancake>): void
    +cloneWithNewSoul(newId: number): AbstractFluffle
    +getAdjustedPancakeProps(): { width: number; height: number; }
    +getEffectiveSyrupThickness(): number
    +captureInCrystalBall(ctx?: CrystalBallContext): PancakeSnapshot
    +{static} fromCrystalBall(snapshot: PancakeSnapshot, ctx?: CrystalBallDecodingContext): FluffyPancake
}

class SpaghettiMagic extends ExtraMagic {
    +enableNoodleTwirling: boolean
    +mustBeSlurped: boolean
    +captureInCrystalBall(): SpaghettiMagicSnapshot
    +{static} fromCrystalBall(snapshot: SpaghettiMagicSnapshot): SpaghettiMagic
}

class SpaghettiMonster extends AbstractFluffle {
    +noodleJoints: NoodleJoint[]
    +slurped: boolean
    +manifestationVariant: 0 | 1 | 2
    +extraMagic: SpaghettiMagic
    +symmetricNoodleCount: number
    +symmetricMaxNoodles: number
    +symmetricSauceRadius: number
    +getNoodleJoints(): NoodleJoint[]
    +getFlatNoodles(): number[]
    +getMeatballCenter(): { x: number; y: number; }
    +getBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; }
    +updateProperties(props: Partial<SpaghettiMonster>): void
    +cloneWithNewSoul(newId: number): AbstractFluffle
    +captureInCrystalBall(ctx?: CrystalBallContext): SpaghettiMonsterSnapshot
    +{static} fromCrystalBall(snapshot: SpaghettiMonsterSnapshot, ctx?: CrystalBallDecodingContext): SpaghettiMonster
}

class CloudMagic extends ExtraMagic {
    +enableCloudSwapping: boolean
    +allowedStretchModes: string[]
    +captureInCrystalBall(): CloudMagicSnapshot
    +{static} fromCrystalBall(snapshot: CloudMagicSnapshot): CloudMagic
}

class FluffyCloud extends AbstractFluffle {
    +width: number
    +height: number
    +manifestationVariant: 0 | 1 | 3 | 2
    +extraMagic: CloudMagic
    +cloudSrc: string
    +cloudNaturalWidth: number
    +cloudNaturalHeight: number
    +stretchMode: UnicornStretchMode
    +prebuiltCloud: boolean
    +cloudFileUuid: string
    +cloudFloating: boolean
    +updateProperties(props: Partial<FluffyCloud>): void
    +cloneWithNewSoul(newId: number): AbstractFluffle
    +getAdjustedCloudProps(): { width: number; height: number; }
    +getEffectiveEdgeFluffiness(): number
    +captureInCrystalBall(ctx?: CrystalBallContext): CloudSnapshot
    +{static} fromCrystalBall(snapshot: CloudSnapshot, ctx?: CrystalBallDecodingContext): FluffyCloud
}

class ScreamMagic extends ExtraMagic {
    +enableScreamFormatting: boolean
    +enableScreamPath: boolean
    +syncOvenTitleToScream: boolean
    +syncOvenDescriptionToScream: boolean
    +captureInCrystalBall(): ScreamMagicSnapshot
    +{static} fromCrystalBall(snapshot: ScreamMagicSnapshot): ScreamMagic
}

class ShoutStyle extends BaseSparkle {
    +loud: boolean
    +wobbly: boolean
    +underlined: boolean
    +volume: number
    +fontFamily: string
    +captureInCrystalBall(): ShoutStyleSnapshot
    +{static} fromCrystalBall(snapshot: ShoutStyleSnapshot): ShoutStyle
}

class LoudScream extends AbstractFluffle {
    +width: number
    +height: number
    +content: string
    +style: ShoutStyle
    +hasYellCurve: boolean
    +manifestationVariant: 0 | 1 | 3 | 2
    +extraMagic: ScreamMagic
    +getEffectiveVolume(): number
    +measureScreamWidth(text: string, volume: number): number
    +getScreamColor(): string
    +fitBoundsToScream(): void
    +updateProperties(props: Partial<LoudScream>): void
    +cloneWithNewSoul(newId: number): AbstractFluffle
    +captureInCrystalBall(ctx?: CrystalBallContext): ScreamSnapshot
    +{static} fromCrystalBall(snapshot: ScreamSnapshot, ctx?: CrystalBallDecodingContext): LoudScream
}

class SignMagic extends ExtraMagic {
    +enableSignEditing: boolean
    +enablePaddingControl: boolean
    +syncOvenTitleToSign: boolean
    +syncOvenDescriptionToSign: boolean
    +captureInCrystalBall(): SignMagicSnapshot
    +{static} fromCrystalBall(snapshot: SignMagicSnapshot): SignMagic
}

class SandwichSign extends AbstractFluffle {
    +width: number
    +height: number
    +htmlGraffiti: string
    +padding: number
    +fontSizeMultiplier: number
    +graffitiAlign: "center" | "left" | "right"
    +manifestationVariant: 0 | 1 | 3 | 2
    +extraMagic: SignMagic
    +updateProperties(props: Partial<SandwichSign>): void
    +cloneWithNewSoul(newId: number): AbstractFluffle
    +getAdjustedSignProps(): { width: number; height: number; }
    +getEffectiveEdgeCrunchiness(): number
    +getGraffitiColor(): string
    +getPlainGraffiti(): string
    +captureInCrystalBall(ctx?: CrystalBallContext): SignSnapshot
    +{static} fromCrystalBall(snapshot: SignSnapshot, ctx?: CrystalBallDecodingContext): SandwichSign
}

CrustSnapshot --> "1" CrustAlignment
BaseSparkle --> "1" SparkleSnapshot
SandwichCrust --> "1" CrustSnapshot
CreamFilling --> "1" FillingSnapshot
DiscoBling --> "1" BlingSnapshot
PhysicsDenial --> "1" PhysicsDenialSnapshot
ExtraMagic --> "1" ExtraMagicSnapshot
AbstractFluffle --> "1" QuantumFluffleType
AbstractFluffle --> "1" SandwichCrust
AbstractFluffle --> "1" CreamFilling
AbstractFluffle --> "*" DiscoBling
AbstractFluffle --> "1" PhysicsDenial
AbstractFluffle --> "1" ExtraMagic
AbstractFluffle --> "1" FluffleSnapshot
AbstractFluffle --> "*" WandWavingGuide
FluffleSnapshot --> "1" CrustSnapshot
FluffleSnapshot --> "1" FillingSnapshot
FluffleSnapshot --> "*" BlingSnapshot
FluffleSnapshot --> "1" PhysicsDenialSnapshot
FluffleSnapshot --> "1" ExtraMagicSnapshot
PancakeMagic --> "1" PancakeMagicSnapshot
FluffyPancake --> "1" PancakeMagic
FluffyPancake --> "1" PancakeSnapshot
SpaghettiMagic --> "1" SpaghettiMagicSnapshot
SpaghettiMonster --> "*" NoodleJoint
SpaghettiMonster --> "1" SpaghettiMagic
SpaghettiMonster --> "1" SpaghettiMonsterSnapshot
CloudMagic --> "1" CloudMagicSnapshot
FluffyCloud --> "1" CloudMagic
FluffyCloud --> "1" UnicornStretchMode
FluffyCloud --> "1" CloudSnapshot
ScreamMagic --> "1" ScreamMagicSnapshot
ShoutStyle --> "1" ShoutStyleSnapshot
LoudScream --> "1" ShoutStyle
LoudScream --> "1" ScreamMagic
LoudScream --> "1" ScreamSnapshot
SignMagic --> "1" SignMagicSnapshot
SandwichSign --> "1" SignMagic
SandwichSign --> "1" SignSnapshot
@enduml`;

test("class diagram: large fluffle diagram – parser smoke (no crash, all top-level boxes reachable)", () => {
  // Regression: large real-world-style class diagram with enums, interfaces,
  // abstract classes, concrete subclasses, inheritance chains, and many
  // connections. Must not crash the parser and must produce a Diagram.
  const d = parsePlantUml(FLUFFLE_SRC);
  assert.ok(d instanceof Diagram);

  // All top-level type declarations must be addressable by their slug id.
  const expectedIds = [
    "QuantumFluffleType",
    "CrustAlignment",
    "UnicornStretchMode",
    "SparkleSnapshot",
    "CrustSnapshot",
    "FillingSnapshot",
    "BlingSnapshot",
    "PhysicsDenialSnapshot",
    "ExtraMagicSnapshot",
    "WandWavingGuide",
    "FluffleSnapshot",
    "BaseSparkle",
    "AbstractFluffle",
    "SandwichCrust",
    "CreamFilling",
    "DiscoBling",
    "PhysicsDenial",
    "ExtraMagic",
    "PancakeMagic",
    "FluffyPancake",
    "SpaghettiMagic",
    "SpaghettiMonster",
    "CloudMagic",
    "FluffyCloud",
    "ScreamMagic",
    "ShoutStyle",
    "LoudScream",
    "SignMagic",
    "SandwichSign",
  ];
  for (const id of expectedIds) {
    assert.ok(d.boxById(id), `box "${id}" must be reachable via boxById()`);
  }

  // Inheritance edges: extends → inheritance, implements → realization.
  const sandwichCrustToBaseSparkle = d.connections.find(
    (c) => c.from.id === "SandwichCrust" && c.to.id === "BaseSparkle",
  );
  assert.ok(sandwichCrustToBaseSparkle, "SandwichCrust extends BaseSparkle");
  assert.equal(sandwichCrustToBaseSparkle.kind, "inheritance");

  const abstractFluffleToMagical = d.connections.find(
    (c) => c.from.id === "AbstractFluffle" && c.to.id === "Magical",
  );
  assert.ok(abstractFluffleToMagical, "AbstractFluffle implements Magical");
  assert.equal(abstractFluffleToMagical.kind, "realization");
});

test("class diagram: large fluffle diagram – __floating__ plane is rendered transparently", async () => {
  // Top-level declarations (not inside any explicit package/namespace) land
  // in the synthetic __floating__ collector plane in the model. The
  // renderer must NOT draw a bounding rectangle or title tab for that
  // plane, so it stays invisible on the Excalidraw canvas.
  const d = parsePlantUml(FLUFFLE_SRC);
  assert.equal(d.planes.length, 1, "all boxes should sit in a single floating plane");
  assert.equal(d.planes[0].id, "__floating__");

  const doc = await renderPlantUml(FLUFFLE_SRC, { sourceLabel: "fluffle-floating" });
  // Every Excalidraw rectangle must correspond to either a box body or
  // an edge-label chip — never to the floating plane's frame.
  const planeRect = doc.elements.find((el) => {
    if (el.type !== "rectangle") return false;
    if (el.customData?.role === "edgeLabelChip") return false;
    return (
      Math.abs(el.x - d.planes[0].x) < 1 &&
      Math.abs(el.y - d.planes[0].y) < 1 &&
      Math.abs(el.width - d.planes[0].width) < 1 &&
      Math.abs(el.height - d.planes[0].height) < 1
    );
  });
  assert.equal(planeRect, undefined, "no rectangle may match the __floating__ plane bounds");
});

test("class diagram: large fluffle diagram – top-level boxes use distinct per-id colours", async () => {
  // Floating-plane direct children get their own deterministic colour
  // triple derived from the box id, so individual top-level types stay
  // visually distinguishable.
  const doc = await renderPlantUml(FLUFFLE_SRC, { sourceLabel: "fluffle-colors" });
  const arrows = doc.elements.filter((e) => e.type === "arrow");
  // Use arrow stroke colour as a proxy for "source box plane colour".
  // With the per-box colouring fix, several distinct stroke colours
  // must show up; otherwise everything would share one floating-plane
  // colour.
  const strokes = new Set(arrows.map((a) => a.strokeColor));
  assert.ok(
    strokes.size >= 5,
    `expected at least 5 distinct arrow stroke colours, got ${strokes.size}`,
  );
});

test("class diagram: large fluffle diagram – long member signatures wrap inside boxes", async () => {
  // The sizing pass must wrap long method signatures (e.g. those with
  // generics and many parameters) at semantically meaningful break
  // points so members do not bleed past the right edge.
  const { sizeDiagram } = await import("../src/general/layout/sizing.mjs");
  const d = parsePlantUml(FLUFFLE_SRC);
  sizeDiagram(d);
  const fluffle = d.boxById("AbstractFluffle");
  assert.ok(fluffle, "AbstractFluffle box must exist");
  const wrapped = fluffle._wrappedMembers;
  assert.ok(Array.isArray(wrapped), "AbstractFluffle should have _wrappedMembers after sizing");
  assert.equal(wrapped.length, fluffle.members.length, "one wrapped entry per logical member");
  // At least one of the long signatures must wrap to multiple lines.
  const hasMultiLine = wrapped.some((entry) => entry.length > 1);
  assert.ok(hasMultiLine, "at least one long member signature must wrap onto multiple lines");
});

test("class diagram: large fluffle diagram – composition/aggregation arrows keep null endArrowhead", async () => {
  // Regression: the renderer used `conn.endArrowhead ?? "arrow"` which
  // clobbered the intentional `null` set by classifyArrow() for
  // composition (`*--`) and aggregation (`o--`). Those operators must
  // emit a diamond at the source side and NO arrow head at the target.
  const src = `@startuml
class A
class B
class C
A *-- B
A o-- C
@enduml`;
  const doc = await renderPlantUml(src);
  const arrows = doc.elements.filter((e) => e.type === "arrow");
  assert.equal(arrows.length, 2);
  const composition = arrows.find((a) => a.startArrowhead === "diamond");
  const aggregation = arrows.find((a) => a.startArrowhead === "diamond_outline");
  assert.ok(composition, "composition arrow must have startArrowhead=diamond");
  assert.equal(composition.endArrowhead, null, "composition must have endArrowhead=null");
  assert.ok(aggregation, "aggregation arrow must have startArrowhead=diamond_outline");
  assert.equal(aggregation.endArrowhead, null, "aggregation must have endArrowhead=null");
});

test("class diagram: large fluffle diagram – arrows match source-box stroke colour", async () => {
  // Each arrow must carry the same stroke colour as the outline of
  // its source box. For top-level boxes inside the synthetic
  // __floating__ plane this is the per-box `planeColor(box.id)`
  // colour; the renderer used to fall back to the (invisible)
  // floating-plane colour, painting all arrows in a single drab tone.
  const { planeColor } = await import("../src/general/style/colors.mjs");
  const doc = await renderPlantUml(FLUFFLE_SRC, { sourceLabel: "fluffle-arrows" });

  // Pick a known top-level connection: AbstractFluffle implements Magical.
  const arrows = doc.elements.filter((e) => e.type === "arrow");
  const sourceStroke = planeColor("AbstractFluffle").stroke;
  const matching = arrows.filter((a) => a.strokeColor === sourceStroke);
  assert.ok(
    matching.length >= 1,
    `expected at least one arrow with AbstractFluffle's stroke colour ${sourceStroke}`,
  );
});

test("class diagram: SVG markers carry the source-box stroke colour", async () => {
  // The SVG renderer must emit per-colour <marker> definitions and
  // reference them by colour-suffixed ids so each arrowhead
  // (composition diamond, inheritance triangle, …) inherits the
  // colour of its arrow shaft.
  const { excalidrawToSvg } = await import("../src/general/render/svg.mjs");
  const src = `@startuml
class A
class B
A --|> B
@enduml`;
  const doc = await renderPlantUml(src);
  const svg = excalidrawToSvg(doc);
  // Marker reference ids include a hex-only colour suffix.
  const refMatch = svg.match(/marker-end="url\(#m_triangle_outline_end_([0-9a-f]+)\)"/);
  assert.ok(refMatch, "expected an inheritance marker reference with colour suffix");
  const suffix = refMatch[1];
  // The marker definition for the same id must exist in the defs and
  // its stroke / fill must encode the same colour the arrow uses.
  const markerDef = new RegExp(
    `<marker id="m_triangle_outline_end_${suffix}"[^>]*><path[^/]*stroke="([^"]+)"`,
  );
  const defMatch = svg.match(markerDef);
  assert.ok(defMatch, "matching marker definition with stroke colour must exist");
  // The marker stroke must be a real colour, not the legacy black.
  assert.notEqual(defMatch[1], "#000", "marker stroke must inherit the source-box colour");
});

test("class diagram: large fluffle diagram – render does not crash", async () => {
  // Regression: rendering a large class diagram must not throw.
  const { excalidrawToSvg } = await import("../src/general/render/svg.mjs");
  const { svgToPng } = await import("../src/general/render/png.mjs");
  resetStyle();
  const doc = await renderPlantUml(FLUFFLE_SRC, { sourceLabel: "fluffle-regression" });
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0, "must produce at least one element");

  // There must be at least one rectangle per declared class/interface/enum.
  const rects = doc.elements.filter((e) => e.type === "rectangle");
  assert.ok(rects.length >= 10, `expected >=10 rectangles, got ${rects.length}`);

  // No element may have NaN geometry – that would indicate a layout failure.
  for (const el of doc.elements) {
    if ("x" in el) assert.ok(!Number.isNaN(el.x), `element ${el.id} has NaN x`);
    if ("y" in el) assert.ok(!Number.isNaN(el.y), `element ${el.id} has NaN y`);
    if ("width" in el) assert.ok(!Number.isNaN(el.width), `element ${el.id} has NaN width`);
    if ("height" in el) assert.ok(!Number.isNaN(el.height), `element ${el.id} has NaN height`);
  }

  // Write artefacts for manual inspection.
  const svg = excalidrawToSvg(doc);
  writeOutput("fluffle.excalidraw.json", JSON.stringify(doc, null, 2));
  writeOutput("fluffle.svg", svg);
  writeOutput("fluffle.png", svgToPng(svg, { width: 2400 }));

  try {
    setStyle({ classDiagram: { colorByType: true } });
    const typedDoc = await renderPlantUml(FLUFFLE_SRC, { sourceLabel: "fluffle-type-colors" });
    const typedRects = typedDoc.elements.filter((e) => e.type === "rectangle");
    assert.ok(
      typedRects.some((e) => e.backgroundColor === "#f0fdfa"),
      "expected interface boxes to use type-based fill",
    );
    assert.ok(
      typedRects.some((e) => e.backgroundColor === "#fffbeb"),
      "expected enum boxes to use type-based fill",
    );
    assert.ok(
      typedRects.some((e) => e.backgroundColor === "#f5f3ff"),
      "expected abstract class boxes to use type-based fill",
    );

    const typedSvg = excalidrawToSvg(typedDoc);
    writeOutput("fluffle-type-colors.excalidraw.json", JSON.stringify(typedDoc, null, 2));
    writeOutput("fluffle-type-colors.svg", typedSvg);
    writeOutput("fluffle-type-colors.png", svgToPng(typedSvg, { width: 2400 }));
  } finally {
    resetStyle();
  }
});
