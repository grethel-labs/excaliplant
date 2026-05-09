// PlantUML → Excalidraw end-to-end smoke test.
import test from "node:test";
import assert from "node:assert/strict";
import { renderPlantUml, parsePlantUml, SequenceDiagram } from "../index.mjs";
import { excalidrawToSvg } from "../src/general/render/svg.mjs";
import { svgToPng } from "../src/general/render/png.mjs";
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

test("class diagram parses PlantUML record and annotation declarations", () => {
  const diagram = parsePlantUml(`@startuml
record "Audit Event" as AuditEvent extends DomainEvent implements Serializable {
  +timestamp: Instant
}
annotation Auditable {
  +value(): string
}
@enduml`);

  const recordBox = diagram.boxById("AuditEvent");
  assert.equal(recordBox.shape, "class");
  assert.equal(recordBox.stereotype, "record");
  assert.equal(recordBox.title, "Audit Event");
  assert.equal(recordBox.members.length, 1);

  const annotationBox = diagram.boxById("Auditable");
  assert.equal(annotationBox.shape, "class");
  assert.equal(annotationBox.stereotype, "annotation");
  assert.equal(annotationBox.members[0], "+value(): string");

  assert.ok(diagram.boxById("DomainEvent"));
  assert.ok(diagram.boxById("Serializable"));
  assert.equal(
    diagram.connections.filter((connection) => connection.kind === "inheritance").length,
    1,
  );
  assert.equal(
    diagram.connections.filter((connection) => connection.kind === "realization").length,
    1,
  );
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

test("component diagram parses lollipop shorthand, queue and artifact declarations", () => {
  const diagram = parsePlantUml(`@startuml
component "API" as api
() "HTTP" as HTTP
queue "Jobs" as jobs
artifact "Client SDK" as sdk
api ..> HTTP : exposes
api --> jobs : publishes
sdk --> api : calls
@enduml`);

  assert.equal(diagram.boxById("api").shape, "component");
  assert.equal(diagram.boxById("HTTP").shape, "interface");
  assert.equal(diagram.boxById("jobs").shape, "queue");
  assert.equal(diagram.boxById("sdk").shape, "rectangle");
  assert.equal(diagram.connections.length, 3);
  assert.ok(diagram.connections.some((connection) => connection.label === "exposes"));
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

const SEQ_FRAGMENTS = `
@startuml
participant A
participant B

loop retry up to 3 times
  A -> B : request
  alt success
    B --> A : result
  else failure
    B --> A : error
  end
  opt cache response
    A -> A : remember
  end
end
@enduml
`;

test("sequence diagram parses and renders combined fragments", async () => {
  const d = parsePlantUml(SEQ_FRAGMENTS);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.fragments.length, 3);
  const loop = d.fragments.find((f) => f.kind === "loop");
  const alt = d.fragments.find((f) => f.kind === "alt");
  const opt = d.fragments.find((f) => f.kind === "opt");
  assert.ok(loop);
  assert.ok(alt);
  assert.ok(opt);
  assert.equal(alt.operands.length, 2);
  assert.equal(alt.operands[1].label, "failure");

  const doc = await renderPlantUml(SEQ_FRAGMENTS, { sourceLabel: "seq-fragments" });
  const frames = doc.elements.filter(
    (e) => e.type === "rectangle" && e.customData?.role === "sequenceFragmentFrame",
  );
  assert.equal(frames.length, 3);
  assert.ok(frames.some((f) => f.customData.kind === "loop"));
  assert.ok(frames.some((f) => f.customData.kind === "alt"));
  assert.ok(frames.some((f) => f.customData.kind === "opt"));
});

const ALL_SEQUENCE_FRAGMENTS = `
@startuml
participant A
participant B

opt optional cache
  A -> B : maybe cache
end
loop retry
  A -> B : retry request
end
alt success
  B --> A : ok
else failure
  B --> A : error
end
par primary path
  A -> B : primary
else secondary path
  B -> A : secondary
end
break invalid input
  A -> B : abort
end
critical commit section
  A -> B : commit
end
group validation phase
  A -> B : validate
end
@enduml
`;

const sequenceFragmentFrames = (doc) =>
  doc.elements.filter(
    (e) => e.type === "rectangle" && e.customData?.role === "sequenceFragmentFrame",
  );
const sequenceFragmentHeaders = (doc) =>
  doc.elements.filter(
    (e) => e.type === "rectangle" && e.customData?.role === "sequenceFragmentHeader",
  );
const right = (el) => el.x + el.width;
const bottom = (el) => el.y + el.height;
const verticalOverlap = (a, b) => Math.max(a.y, b.y) < Math.min(bottom(a), bottom(b));
const horizontalOverlap = (a, b) => Math.max(a.x, b.x) < Math.min(right(a), right(b));

test("sequence diagram renders every combined fragment kind with typed colours", async () => {
  const d = parsePlantUml(ALL_SEQUENCE_FRAGMENTS);
  assert.ok(d instanceof SequenceDiagram);
  const kinds = d.fragments.map((fragment) => fragment.kind);
  assert.deepEqual(kinds, ["opt", "loop", "alt", "par", "break", "critical", "group"]);
  assert.equal(d.fragments.find((fragment) => fragment.kind === "alt")?.operands.length, 2);
  assert.equal(d.fragments.find((fragment) => fragment.kind === "par")?.operands.length, 2);

  const doc = await renderPlantUml(ALL_SEQUENCE_FRAGMENTS, {
    sourceLabel: "seq-all-fragments",
  });
  const frames = sequenceFragmentFrames(doc);
  const headers = sequenceFragmentHeaders(doc);
  assert.equal(frames.length, 7);
  assert.equal(headers.length, 7);
  for (const frame of frames) {
    assert.notEqual(frame.backgroundColor, "transparent");
    assert.notEqual(frame.backgroundColor, "#ffffff");
    assert.ok(frame.customData.kind);
  }
  assert.ok(new Set(frames.map((frame) => frame.backgroundColor)).size >= 5);
  for (const header of headers) {
    assert.equal(header.backgroundColor, header.strokeColor);
  }
  const headerTexts = doc.elements.filter(
    (e) => e.type === "text" && e.customData?.role === "sequenceFragmentHeaderText",
  );
  assert.equal(headerTexts.length, 7);
  assert.ok(headerTexts.every((textEl) => textEl.strokeColor === "#ffffff"));
  const operandText = doc.elements.find(
    (e) => e.type === "text" && e.customData?.role === "sequenceFragmentOperandText",
  );
  assert.ok(operandText);
  assert.notEqual(operandText.strokeColor, "#ffffff");
});

test("sequence fragment frames reserve vertical margins and adjacent blocks do not overlap", async () => {
  const src = `
@startuml
participant A
participant B

opt first block
  A -> B : one
end
opt second block
  A -> B : two
end
loop third block
  A -> B : three
end
@enduml
`;
  const doc = await renderPlantUml(src, { sourceLabel: "seq-adjacent-fragments" });
  const frames = sequenceFragmentFrames(doc).sort((a, b) => a.y - b.y);
  assert.equal(frames.length, 3);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(
      bottom(frames[i - 1]) <= frames[i].y,
      `expected frame ${i - 1} to end before frame ${i} starts`,
    );
  }
  const arrows = doc.elements.filter((e) => e.type === "arrow").sort((a, b) => a.y - b.y);
  assert.equal(arrows.length, 3);
  for (const [index, frame] of frames.entries()) {
    assert.ok(frame.y < arrows[index].y, "frame should start above its message");
    assert.ok(bottom(frame) > arrows[index].y, "frame should end below its message");
  }
});

test("nested sequence fragments expand parent frames recursively", async () => {
  const src = `
@startuml
participant A
participant B

loop outer retry
  alt branch
    opt inner optional
      A -> B : nested request
    end
  else fallback
    B --> A : fallback
  end
end
@enduml
`;
  const doc = await renderPlantUml(src, { sourceLabel: "seq-nested-fragments" });
  const byKind = Object.fromEntries(
    sequenceFragmentFrames(doc).map((frame) => [frame.customData.kind, frame]),
  );
  const loop = byKind.loop;
  const alt = byKind.alt;
  const opt = byKind.opt;
  assert.ok(loop);
  assert.ok(alt);
  assert.ok(opt);

  assert.ok(loop.x < alt.x);
  assert.ok(right(loop) > right(alt));
  assert.ok(loop.y < alt.y);
  assert.ok(bottom(loop) > bottom(alt));
  assert.ok(alt.x < opt.x);
  assert.ok(right(alt) > right(opt));
  assert.ok(alt.y < opt.y);
  assert.ok(bottom(alt) > bottom(opt));
});

test("sequence participants get deterministic pastel heads and lifelines enter heads", async () => {
  const src = `
@startuml
participant Alice
participant Bob
Alice -> Bob : hi
@enduml
`;
  const doc1 = await renderPlantUml(src, { sourceLabel: "seq-head-colors" });
  const doc2 = await renderPlantUml(src, { sourceLabel: "seq-head-colors" });
  const heads1 = doc1.elements.filter(
    (e) => e.type === "rectangle" && e.customData?.role === "sequenceParticipantHead",
  );
  const heads2 = doc2.elements.filter(
    (e) => e.type === "rectangle" && e.customData?.role === "sequenceParticipantHead",
  );
  assert.equal(heads1.length, 2);
  assert.deepEqual(
    heads1.map((head) => head.backgroundColor),
    heads2.map((head) => head.backgroundColor),
  );
  assert.ok(heads1.every((head) => head.backgroundColor !== "#f5f7fa"));
  assert.ok(new Set(heads1.map((head) => head.backgroundColor)).size >= 2);

  const lifelines = doc1.elements.filter(
    (e) => e.type === "line" && e.customData?.role === "sequenceLifeline",
  );
  assert.equal(lifelines.length, 2);
  for (const lifeline of lifelines) {
    const head = heads1.find(
      (candidate) => candidate.customData.participantId === lifeline.customData.participantId,
    );
    assert.ok(head);
    assert.ok(lifeline.y > head.y);
    assert.ok(lifeline.y < bottom(head));
  }
});

test("sequence message labels wrap to arrow length and reserve vertical space", async () => {
  const src = `
@startuml
participant A
participant B
A -> B : this request payload description is intentionally much longer than the available arrow span
B --> A : next
@enduml
`;
  const baselineSrc = `
@startuml
participant A
participant B
A -> B : short
B --> A : next
@enduml
`;
  const doc = await renderPlantUml(src, { sourceLabel: "seq-wrapped-message-label" });
  const baselineDoc = await renderPlantUml(baselineSrc, {
    sourceLabel: "seq-short-message-label",
  });
  const arrows = doc.elements.filter((e) => e.type === "arrow").sort((a, b) => a.y - b.y);
  const baselineArrows = baselineDoc.elements
    .filter((e) => e.type === "arrow")
    .sort((a, b) => a.y - b.y);
  const labels = doc.elements
    .filter((e) => e.type === "text" && e.customData?.role === "sequenceMessageLabel")
    .sort((a, b) => a.y - b.y);

  assert.equal(arrows.length, 2);
  assert.equal(baselineArrows.length, 2);
  assert.equal(labels.length, 2);
  const longLabel = labels[0];
  assert.ok(longLabel.text.includes("\n"));
  assert.ok(longLabel.width <= arrows[0].width + 0.5);
  assert.ok(longLabel.y < arrows[0].y);
  assert.ok(bottom(longLabel) <= arrows[0].y);
  assert.ok(arrows[0].y > baselineArrows[0].y);
  assert.ok(arrows[1].y > baselineArrows[1].y);
});

test("sequence diagram renders lifecycle, creation, destruction and autonumber", async () => {
  const src = `
@startuml
autonumber 10 5
participant Alice
create participant Worker
Alice -> Worker ** : spawn worker
activate Worker #LightBlue
Worker -> Worker ++ : process job
Worker --> Alice -- : done
destroy Worker
@enduml
`;
  const d = parsePlantUml(src);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.messages.length, 3);
  assert.deepEqual(
    d.messages.map((message) => message.number),
    ["10", "15", "20"],
  );
  const worker = d.participantById("Worker");
  assert.ok(worker);
  assert.notEqual(worker.createdSeq, null);
  assert.notEqual(worker.destroyedSeq, null);
  assert.ok(d.activations.length >= 2);
  assert.ok(d.messages[0].creates);

  const doc = await renderPlantUml(src, { sourceLabel: "seq-lifecycle" });
  const labels = doc.elements.filter(
    (e) => e.type === "text" && e.customData?.role === "sequenceMessageLabel",
  );
  assert.ok(labels.some((label) => String(label.text).startsWith("10 spawn worker")));
  assert.ok(
    doc.elements.some((e) => e.type === "rectangle" && e.customData?.role === "sequenceActivation"),
  );
  assert.ok(doc.elements.some((e) => e.customData?.role === "sequenceDestroyMarker"));
  assert.ok(
    doc.elements.some((e) => e.customData?.role === "sequenceMessage" && e.customData.creates),
  );
});

test("sequence diagram renders participant boxes, references, dividers, delays and advanced operands", async () => {
  const src = `
@startuml
skinparam sequence {
  ArrowColor #ff0000
  ParticipantBackgroundColor #LightYellow
  ParticipantBorderColor #00aa00
  LifeLineBorderColor #0000ff
}
box "API Layer" #LightBlue
participant A #LightGreen
participant B
end box

== Bootstrap ==
A -> B : start
... waiting for callback ...
ref over A, B : external contract with a fairly long description
|||
par primary path
  A -> B : primary
and secondary path
  B -> A : secondary
end
critical commit section
  A -> B : commit
option rollback branch
  B -> A : rollback
end
group audit phase
  A -> B : audit
option skip audit
  B -> A : skip
end
@enduml
`;
  const d = parsePlantUml(src);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.participantGroups.length, 1);
  assert.equal(d.references.length, 1);
  assert.ok(d.markers.some((marker) => marker.kind === "divider"));
  assert.ok(d.markers.some((marker) => marker.kind === "delay"));
  assert.ok(d.markers.some((marker) => marker.kind === "space"));
  assert.equal(d.fragments.find((fragment) => fragment.kind === "par")?.operands.length, 2);
  assert.equal(d.fragments.find((fragment) => fragment.kind === "critical")?.operands.length, 2);
  assert.equal(d.fragments.find((fragment) => fragment.kind === "group")?.operands.length, 2);
  assert.equal(d.participantById("A")?.color, "#LightGreen");
  assert.equal(d.style.arrowColor, "#ff0000");
  assert.equal(d.style.participantBackgroundColor, "#LightYellow");
  assert.equal(d.style.participantBorderColor, "#00aa00");
  assert.equal(d.style.lifelineColor, "#0000ff");

  const doc = await renderPlantUml(src, { sourceLabel: "seq-advanced-constructs" });
  assert.ok(
    doc.elements.some(
      (e) => e.type === "rectangle" && e.customData?.role === "sequenceParticipantGroup",
    ),
  );
  assert.ok(doc.elements.some((e) => e.customData?.role === "sequenceDivider"));
  assert.ok(doc.elements.some((e) => e.customData?.role === "sequenceDelay"));
  assert.ok(doc.elements.some((e) => e.customData?.role === "sequenceReference"));
  assert.ok(
    doc.elements.some(
      (e) => e.customData?.role === "sequenceMessage" && e.strokeColor === "#ff0000",
    ),
  );
  assert.ok(
    doc.elements.some(
      (e) => e.customData?.role === "sequenceLifeline" && e.strokeColor === "#0000ff",
    ),
  );
  assert.ok(
    doc.elements.some(
      (e) =>
        e.customData?.role === "sequenceParticipantHead" &&
        e.customData.participantId === "B" &&
        e.backgroundColor === "#fef9c3" &&
        e.strokeColor === "#00aa00",
    ),
  );
  const frames = sequenceFragmentFrames(doc);
  assert.ok(frames.some((frame) => frame.customData.kind === "critical"));
  assert.ok(frames.some((frame) => frame.customData.kind === "group"));
});

test("sequence diagram applies compact skinparams, bare boxes and dashed async messages", async () => {
  const src = `
@startuml
skinparam sequence ArrowColor #123456
box
participant A
participant B
end box
A -->> B : async over dashed line
@enduml
`;
  const d = parsePlantUml(src);
  assert.ok(d instanceof SequenceDiagram);
  assert.equal(d.style.arrowColor, "#123456");
  assert.equal(d.participantGroups.length, 1);
  assert.equal(d.participantGroups[0].label, "");
  assert.equal(d.messages[0].kind, "async");

  const doc = await renderPlantUml(src, { sourceLabel: "seq-compact-skinparam" });
  assert.ok(
    doc.elements.some(
      (e) => e.customData?.role === "sequenceMessage" && e.strokeColor === "#123456",
    ),
  );
  assert.ok(
    doc.elements.some(
      (e) => e.type === "rectangle" && e.customData?.role === "sequenceParticipantGroup",
    ),
  );
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
