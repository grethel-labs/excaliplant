// Additional functional regression tests.
//
// These cover the breadth of supported PlantUML constructs and
// renderer behaviour beyond the curated edge_cases.test.mjs suite.
// Anything that crashes here is a regression.

import test from "node:test";
import assert from "node:assert/strict";
import { Resvg } from "@resvg/resvg-js";
import { parsePlantUml, renderPlantUml, Diagram, SequenceDiagram } from "../index.mjs";
import { excalidrawJsonToCanvasSvg } from "../src/render/canvas_svg.mjs";
import { svgToPng } from "../src/render/png.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import {
  EXCALIFONT_FAMILY,
  EXCALIFONT_FONT_PATH,
  EXCALIFONT_RASTER_FONT_PATH,
} from "../src/style/font.mjs";

// ---------------------------------------------------------------------------
// Component / container variants
// ---------------------------------------------------------------------------

test("functional: chained connections a --> b --> c land as two edges", () => {
  const d = parsePlantUml(`@startuml
[a]
[b]
[c]
a --> b
b --> c
@enduml`);
  assert.ok(d instanceof Diagram);
  assert.equal(d.connections.length, 2);
});

test("functional: multiple arrows between same pair are kept distinct", () => {
  const d = parsePlantUml(`@startuml
[a]
[b]
a --> b : first
a --> b : second
a --> b : third
@enduml`);
  assert.equal(d.connections.length, 3);
});

test("functional: self-loop on a component does not crash the parser", () => {
  const d = parsePlantUml(`@startuml
[a]
a --> a
@enduml`);
  // Self-loops may or may not be supported as edges, but must never crash.
  assert.ok(d instanceof Diagram);
});

test("functional: connection labels with special chars survive", () => {
  const d = parsePlantUml(`@startuml
[a]
[b]
a --> b : "label with: punctuation, & symbols!"
@enduml`);
  assert.equal(d.connections.length, 1);
  assert.ok((d.connections[0].label ?? "").length > 5);
});

test("functional: empty container { } parses without errors", () => {
  const d = parsePlantUml(`@startuml
package P {
}
@enduml`);
  assert.ok(d instanceof Diagram);
});

test("functional: nested package > frame > box all become subplanes/boxes", () => {
  const d = parsePlantUml(`@startuml
package P {
  frame F {
    [a]
  }
}
@enduml`);
  assert.ok(d.planes.length >= 1, "expected at least one plane");
});

test("functional: alias `[Long Name] as a` parses and renders", async () => {
  const src = `@startuml
[Authentication Service] as auth
[User Profile DB] as udb
auth --> udb
@enduml`;
  const doc = await renderPlantUml(src);
  assert.ok(doc.elements.length > 0);
});

test("functional: stereotypes <<role>> on boxes parse cleanly", () => {
  const d = parsePlantUml(`@startuml
[Worker] <<role>>
[Queue] <<infrastructure>>
[Worker] --> [Queue]
@enduml`);
  assert.ok(d.planes.length >= 1);
});

// ---------------------------------------------------------------------------
// Sequence variants
// ---------------------------------------------------------------------------

test("functional: sequence with sync/async/reply arrow types", () => {
  const src = `@startuml
participant Alice
participant Bob
Alice -> Bob: sync
Alice ->> Bob: async
Bob --> Alice: sync reply
Bob -->> Alice: async reply
@enduml`;
  const d = parsePlantUml(src);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.messages.length, 4);
});

test("functional: sequence with notes left, right, over single, over multiple", () => {
  const src = `@startuml
participant A
participant B
note left of A: lhs
note right of B: rhs
note over A: over single
note over A, B: over both
A -> B: msg
@enduml`;
  const d = parsePlantUml(src);
  assert.ok(d instanceof SequenceDiagram);
  assert.ok(d.notes.length >= 3, `expected >=3 notes, got ${d.notes.length}`);
});

test("functional: sequence renders without ELK and produces elements", async () => {
  const src = `@startuml
participant Alice
participant Bob
Alice -> Bob: hi
Bob --> Alice: ok
@enduml`;
  const doc = await renderPlantUml(src);
  assert.ok(doc.elements.length > 0);
});

test("functional: sequence diagram with 20 lifelines lays out", async () => {
  const lifelines = Array.from({ length: 20 }, (_, i) => `participant L${i}`).join("\n");
  const messages = Array.from({ length: 19 }, (_, i) => `L${i} -> L${i + 1}: m${i}`).join("\n");
  const src = `@startuml\n${lifelines}\n${messages}\n@enduml`;
  const doc = await renderPlantUml(src);
  assert.ok(doc.elements.length > 20);
});

// ---------------------------------------------------------------------------
// Use-case / actor / interface
// ---------------------------------------------------------------------------

test("functional: use-case (foo) syntax", async () => {
  const src = `@startuml
(login)
(logout)
(login) --> (logout)
@enduml`;
  const doc = await renderPlantUml(src);
  assert.ok(doc.elements.length > 0);
});

test("functional: actor + use-case mixed diagram renders", async () => {
  const src = `@startuml
actor User
(login)
(logout)
User --> (login)
User --> (logout)
@enduml`;
  const doc = await renderPlantUml(src);
  assert.ok(doc.elements.length > 0);
});

// ---------------------------------------------------------------------------
// Comments / preamble
// ---------------------------------------------------------------------------

test("functional: comments and skinparams don't interfere with edges", () => {
  const d = parsePlantUml(`@startuml
' single line comment
skinparam monochrome true
[a]
[b]
a --> b
@enduml`);
  assert.equal(d.connections.length, 1);
});

test("functional: !theme, !define, !pragma, hide are silently ignored", () => {
  const d = parsePlantUml(`@startuml
!theme cerulean
!define MY_COLOR #ff0000
!pragma layout smetana
hide stereotype
[a]
[b]
a --> b
@enduml`);
  assert.equal(d.connections.length, 1);
});

// ---------------------------------------------------------------------------
// Direction hints
// ---------------------------------------------------------------------------

for (const dir of ["up", "down", "left", "right"]) {
  test(`functional: -${dir}- direction hint produces an edge`, () => {
    const d = parsePlantUml(`@startuml
[a]
[b]
a -${dir}-> b
@enduml`);
    assert.equal(d.connections.length, 1, `no edge for direction ${dir}`);
  });
}

// ---------------------------------------------------------------------------
// SVG renderer coverage
// ---------------------------------------------------------------------------

test("functional: SVG output has a valid root element with viewBox", async () => {
  const src = `@startuml\n[a]\n[b]\na --> b\n@enduml`;
  const doc = await renderPlantUml(src);
  const svg = excalidrawToSvg(doc);
  assert.match(svg, /^<svg[^>]*viewBox="[^"]+"/);
  assert.ok(svg.endsWith("</svg>"));
});

test("functional: SVG includes text nodes for labels", async () => {
  const doc = await renderPlantUml(`@startuml
[Foo]
[Bar]
Foo --> Bar
@enduml`);
  const svg = excalidrawToSvg(doc);
  assert.match(svg, /<text\b/);
});

test("functional: canvas SVG keeps shared defs at the root", async () => {
  const doc = await renderPlantUml(`@startuml
component A
component B
A --> B
@enduml`);
  const svg = excalidrawJsonToCanvasSvg(doc, { width: 800 });
  const defsIndex = svg.indexOf("<defs>");
  const groupIndex = svg.indexOf("<g transform=");
  assert.ok(defsIndex > -1, "expected a root defs block");
  assert.ok(groupIndex > -1, "expected a canvas transform group");
  assert.ok(defsIndex < groupIndex, "defs must be emitted before the canvas transform group");
  assert.equal((svg.match(/<defs>/g) || []).length, 1);
  assert.match(svg, /marker-end="url\(#m_arrow_end\)"/);
  assert.match(svg, /@font-face\{font-family:"Excalifont"/);
});

test("functional: svgToPng loads bundled Excalifont for raster output", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="96" viewBox="0 0 360 96" font-family="${EXCALIFONT_FAMILY}"><rect width="100%" height="100%" fill="white"/><text x="20" y="66" font-size="42" fill="black">Excalifont 123</text></svg>`;
  const rendered = svgToPng(svg, { width: 360 });
  const expected = new Resvg(svg, {
    fitTo: { mode: "width", value: 360 },
    background: "#ffffff",
    font: {
      loadSystemFonts: true,
      fontFiles: [EXCALIFONT_RASTER_FONT_PATH],
      defaultFontFamily: EXCALIFONT_FAMILY,
    },
  })
    .render()
    .asPng();
  const oldWoff2Only = new Resvg(svg, {
    fitTo: { mode: "width", value: 360 },
    background: "#ffffff",
    font: {
      loadSystemFonts: true,
      fontFiles: [EXCALIFONT_FONT_PATH],
      defaultFontFamily: EXCALIFONT_FAMILY,
    },
  })
    .render()
    .asPng();
  assert.deepEqual(rendered, expected);
  assert.notDeepEqual(rendered, oldWoff2Only);
});

test("functional: empty Excalidraw doc produces a minimal but valid SVG", () => {
  const doc = { type: "excalidraw", elements: [], appState: {} };
  const svg = excalidrawToSvg(doc);
  assert.match(svg, /^<svg/);
  assert.ok(svg.endsWith("</svg>"));
});

// ---------------------------------------------------------------------------
// Idempotence / determinism
// ---------------------------------------------------------------------------

test("functional: parsing the same input twice yields the same structural shape", () => {
  const src = `@startuml
package P {
  [a]
  [b]
}
a --> b
@enduml`;
  const a = parsePlantUml(src);
  const b = parsePlantUml(src);
  assert.equal(a.planes.length, b.planes.length);
  assert.equal(a.connections.length, b.connections.length);
});

test("functional: rendering the same input twice yields the same element count", async () => {
  const src = `@startuml\n[a]\n[b]\n[c]\na --> b\nb --> c\n@enduml`;
  const a = await renderPlantUml(src);
  const b = await renderPlantUml(src);
  assert.equal(a.elements.length, b.elements.length);
});

// ---------------------------------------------------------------------------
// Whitespace / line endings
// ---------------------------------------------------------------------------

test("functional: CRLF line endings parse the same as LF", () => {
  const src = "@startuml\n[a]\n[b]\na --> b\n@enduml";
  const lf = parsePlantUml(src);
  const crlf = parsePlantUml(src.replace(/\n/g, "\r\n"));
  assert.equal(lf.connections.length, crlf.connections.length);
});

test("functional: tabs vs spaces don't change parse result", () => {
  const sp = parsePlantUml("@startuml\n[a]\n[b]\na  -->  b\n@enduml");
  const tb = parsePlantUml("@startuml\n[a]\n[b]\na\t-->\tb\n@enduml");
  assert.equal(sp.connections.length, tb.connections.length);
});

// ---------------------------------------------------------------------------
// Robustness: malformed inputs degrade gracefully
// ---------------------------------------------------------------------------

test("functional: missing @enduml does not crash", () => {
  const d = parsePlantUml("@startuml\n[a]\n[b]\na --> b\n");
  assert.ok(d);
});

test("functional: unclosed { does not crash", () => {
  const d = parsePlantUml(`@startuml\npackage P {\n[a]\n@enduml`);
  assert.ok(d);
});

test("functional: stray } at top level does not crash", () => {
  const d = parsePlantUml("@startuml\n}\n[a]\n[b]\na --> b\n@enduml");
  assert.ok(d);
});

// ---------------------------------------------------------------------------
// Big mixed example
// ---------------------------------------------------------------------------

test("functional: large mixed component diagram parses and renders", async () => {
  const src = `@startuml
title Big system

package "Frontend" {
  [Web App] as web
  [Mobile App] as mob
}

package "Backend" {
  [API Gateway] as gw
  [Auth Service] as auth
  [Order Service] as orders
  [Payment Service] as pay
}

web --> gw
mob --> gw
gw --> auth
gw --> orders
orders --> pay
@enduml`;
  const d = parsePlantUml(src);
  assert.ok(d.connections.length >= 5, `expected >=5 edges, got ${d.connections.length}`);
  const doc = await renderPlantUml(src);
  assert.ok(doc.elements.length > 10);
  const svg = excalidrawToSvg(doc);
  assert.ok(svg.length > 1000);
});
