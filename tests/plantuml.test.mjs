// PlantUML → Excalidraw end-to-end smoke test.
import test from "node:test";
import assert from "node:assert/strict";
import { renderPlantUml, parsePlantUml, SequenceDiagram } from "../index.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import { svgToPng } from "../src/render/png.mjs";
import { writeOutput } from "./helpers/output.mjs";

const SAMPLE = `
@startuml
title "Tiny system"

package "Apps" as apps {
  package "K0s Cluster" as apps_k0s {
    [API Server] as api : Public HTTP API
    [Auth] as auth
  }
}

package "Storage" as storage {
  [Postgres] as db
}

api --> db : sql
auth --> db : users
api ..> auth : oidc

@enduml
`;

test("parsePlantUml extracts planes / subplanes / boxes / connections", () => {
  const d = parsePlantUml(SAMPLE);
  assert.equal(d.title, "Tiny system");
  assert.equal(d.planes.length, 2);
  const apps = d.planes.find((p) => p.id === "apps");
  assert.equal(apps.subplanes.length, 1);
  assert.equal(apps.subplanes[0].boxes.length, 2);
  const api = d.boxById("api");
  assert.equal(api.description, "Public HTTP API");
  assert.equal(d.connections.length, 3);
  const dashed = d.connections.filter((c) => c.dashed);
  assert.equal(dashed.length, 1);
});

test("renderPlantUml produces a well-formed Excalidraw doc", async () => {
  const doc = await renderPlantUml(SAMPLE, { sourceLabel: "smoke" });
  assert.equal(doc.type, "excalidraw");
  const arrows = doc.elements.filter((e) => e.type === "arrow");
  assert.equal(arrows.length, 3);
  for (const arrow of arrows) {
    assert.equal(arrow.roughness, 0);
    assert.equal(arrow.roundness, null);
  }
  const rects = doc.elements.filter((e) => e.type === "rectangle");
  assert.ok(rects.length >= 4);
  // Edge-label chips render with roughness 0 by design (and carry a
  // `customData.role` marker so renderers / tests can identify them).
  // All other rectangles keep Excalidraw's default sketchy look.
  for (const r of rects) {
    if (r.customData?.role === "edgeLabelChip") {
      assert.equal(r.roughness, 0);
      assert.equal(r.roundness, null);
    } else {
      assert.equal(r.roughness, 1);
      assert.deepEqual(r.roundness, { type: 3 });
    }
  }
  // Edge labels: chip background equals the connection's stroke colour
  // (or the configured fallback) and the text is white.
  const labelTexts = doc.elements.filter(
    (e) => e.type === "text" && e.customData?.role === "edgeLabelText",
  );
  assert.equal(labelTexts.length, 3);
  for (const t of labelTexts) assert.equal(t.strokeColor, "#ffffff");

  const svg = excalidrawToSvg(doc);
  writeOutput("smoke.svg", svg);
  writeOutput("smoke.png", svgToPng(svg, { width: 900 }));
});

test("class boxes separate attributes from operations", async () => {
  const doc = await renderPlantUml(
    `@startuml
class Account {
  +id: string
  +name: string
  +save(): void
  +load(id: string): Account
}
@enduml`,
    { sourceLabel: "class-compartments" },
  );

  const separators = doc.elements.filter((e) => e.type === "line");
  assert.equal(separators.length, 2);
  const ys = separators.map((line) => line.y + line.points[0][1]).sort((a, b) => a - b);
  assert.ok(ys[1] > ys[0], "operation separator should be below the title separator");
});

test("SVG renderer strokes rounded rectangle outlines", () => {
  const svg = excalidrawToSvg({
    type: "excalidraw",
    appState: { viewBackgroundColor: "#ffffff" },
    elements: [
      {
        id: "rounded",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 120,
        height: 60,
        strokeColor: "#123456",
        backgroundColor: "#ffffff",
        strokeWidth: 2,
        roughness: 0,
        roundness: { type: 3 },
        seed: 1,
        isDeleted: false,
      },
    ],
  });

  const strokePath = svg.match(/<path[^>]+stroke="#123456"[^>]*>/)?.[0] || "";
  assert.match(strokePath, /\sC[\d.,\s-]+/);
});

// ---------------------------------------------------------------------------
// Extended component-diagram features
// ---------------------------------------------------------------------------

const RICH = `
@startuml
title "Rich features"

actor "End User" as user
package "System" as sys {
  component "Gateway" <<edge>> as gw
  database "DB" as db
  cloud "CDN" as cdn
  interface "REST" as rest
  entity "Order" as order
  rectangle "Misc" as misc
  usecase "Login" as login
  (Search) as search

  class "Repo" as repo {
    findAll(): List
    save(x): void
  }
}

user --> gw : http
gw <|-- order : extends
gw o-- db : aggregates
gw *-- repo : owns
gw ..> rest : uses
gw -up-> cdn : fetches\\nassets

note right of gw : Single\nentry point
@enduml
`;

test("rich component diagram parses all shapes / arrows / notes", () => {
  const d = parsePlantUml(RICH);
  assert.ok(!(d instanceof SequenceDiagram));

  // Shapes
  assert.equal(d.boxById("user").shape, "actor");
  assert.equal(d.boxById("gw").shape, "component");
  assert.equal(d.boxById("gw").stereotype, "edge");
  assert.equal(d.boxById("db").shape, "database");
  assert.equal(d.boxById("cdn").shape, "cloud");
  assert.equal(d.boxById("rest").shape, "interface");
  assert.equal(d.boxById("order").shape, "entity");
  assert.equal(d.boxById("misc").shape, "rectangle");
  assert.equal(d.boxById("login").shape, "usecase");
  assert.equal(d.boxById("search").shape, "usecase");

  // Class with members
  const repo = d.boxById("repo");
  assert.equal(repo.shape, "class");
  assert.equal(repo.members.length, 2);
  assert.match(repo.members[0], /findAll/);

  // Arrow kinds
  const byKind = (k) => d.connections.filter((c) => c.kind === k);
  assert.equal(byKind("inheritance").length, 1);
  assert.equal(byKind("aggregation").length, 1);
  assert.equal(byKind("composition").length, 1);
  assert.equal(byKind("dependency").length, 1);

  // Multi-line label
  const upArrow = d.connections.find((c) => c.label.includes("fetches"));
  assert.ok(upArrow.label.includes("\n"));
  assert.equal(upArrow.directionHint, "up");

  // Note: note + dashed connection from note → gw
  const noteBox = d.boxById("note_0");
  assert.ok(noteBox);
  assert.equal(noteBox.shape, "note");
  const noteConn = d.connections.find((c) => c.kind === "note");
  assert.ok(noteConn);
});

test("rich diagram renders to Excalidraw with mixed primitives", async () => {
  const doc = await renderPlantUml(RICH, { sourceLabel: "rich" });
  assert.equal(doc.type, "excalidraw");
  const types = new Set(doc.elements.map((e) => e.type));
  assert.ok(types.has("rectangle"));
  assert.ok(types.has("ellipse")); // usecase / database / cloud / interface / actor head
  assert.ok(types.has("line")); // actor body, class separator, note fold
  assert.ok(types.has("arrow"));
  assert.ok(types.has("text"));
  // Different end-arrowheads should appear (triangle for inheritance,
  // diamond for composition).
  const arrowHeads = new Set(
    doc.elements
      .filter((e) => e.type === "arrow")
      .flatMap((e) => [e.startArrowhead, e.endArrowhead])
      .filter(Boolean),
  );
  assert.ok(arrowHeads.has("triangle_outline"));
  assert.ok(arrowHeads.has("diamond"));
  assert.ok(arrowHeads.has("diamond_outline"));

  const svg = excalidrawToSvg(doc);
  writeOutput("rich.svg", svg);
  writeOutput("rich.png", svgToPng(svg, { width: 1200 }));
});

// ---------------------------------------------------------------------------
// Extra container keywords
// ---------------------------------------------------------------------------

test("frame / folder / node containers are recognised", () => {
  const src = `
@startuml
frame  "F" as f { [a] }
folder "Fo" as fo { [b] }
node   "N" as n { [c] }
together { [d] [e] }
@enduml`;
  const d = parsePlantUml(src);
  assert.equal(d.planes.length, 4);
  const kinds = d.planes.map((p) => p.kind).sort();
  assert.deepEqual(kinds, ["folder", "frame", "node", "together"]);
});

// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------

const SEQ = `
@startuml
title "Login flow"
actor User
participant "Web UI" as ui
participant Auth as auth
database DB

User -> ui : open page
ui -> auth : login(name, pwd)
auth -> DB : SELECT user
DB --> auth : row
auth --> ui : ok\\n(token)
ui --> User : show home
auth -> auth : audit

note right of auth : token has\\n5 min ttl
note over ui, auth : TLS only
@enduml
`;

test("sequence diagram parses participants, messages, notes", () => {
  const d = parsePlantUml(SEQ);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.title, "Login flow");
  assert.equal(d.participants.length, 4);
  // Auto-created from message refs vs explicit declarations: User & DB
  // are explicit (actor / database). ui & auth via `participant`.
  const user = d.participantById("User");
  assert.equal(user.shape, "actor");
  const db = d.participantById("DB");
  assert.equal(db.shape, "database");
  // 7 messages including a self-message.
  assert.equal(d.messages.length, 7);
  assert.ok(d.messages.some((m) => m.isSelf));
  // Replies (--) are dashed.
  assert.ok(d.messages.some((m) => m.dashed));
  // Notes
  assert.equal(d.notes.length, 2);
  assert.equal(d.notes[0].side, "right");
  assert.equal(d.notes[1].side, "over");
  assert.ok(d.notes[1].target2);
});

test("sequence diagram renders to Excalidraw without ELK", async () => {
  const doc = await renderPlantUml(SEQ, { sourceLabel: "seq" });
  assert.equal(doc.type, "excalidraw");
  // Lifelines = lines, message arrows = arrows.
  const lines = doc.elements.filter((e) => e.type === "line");
  const arrows = doc.elements.filter((e) => e.type === "arrow");
  // 4 participants → at least 4 dashed lifelines.
  const dashedLines = lines.filter((l) => l.strokeStyle === "dashed");
  assert.ok(dashedLines.length >= 4);
  // 7 messages → 7 arrows.
  assert.equal(arrows.length, 7);

  const svg = excalidrawToSvg(doc);
  writeOutput("seq.svg", svg);
  writeOutput("seq.png", svgToPng(svg, { width: 1000 }));
});
