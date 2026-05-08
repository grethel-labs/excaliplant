import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  Connection,
  DiagramArrow,
  layoutDiagram,
  parsePlantUml,
  renderPlantUml,
  SequenceDiagram,
} from "../index.mjs";
import { SEQUENCE_COMPONENT_EXAMPLES } from "../docs/scripts/sequence-coverage-examples.mjs";
import { SEQUENCE_SPACING, arrowLabelBudget } from "../src/layout/sequence_spacing.mjs";
import { FONT } from "../src/style/text.mjs";
import { writeOutput } from "./helpers/output.mjs";

const exampleById = new Map(SEQUENCE_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

test("generated sequence support matrix is one contiguous markdown table", async () => {
  const raw = await readFile(new URL("../docs/sequence-components.md", import.meta.url), "utf8");
  const markdown = raw.replace(/\r\n/g, "\n");
  const matrix = markdown.match(/## Support Matrix\n\n(?<table>[\s\S]*?)\n\n## Rendered Examples/)
    ?.groups?.table;
  assert.ok(matrix, "support matrix section should exist");

  const lines = matrix.split("\n");
  assert.ok(lines.length > 3, "support matrix should include rows beyond the header");
  assert.equal(lines.filter((line) => line.trim() === "").length, 0);
  assert.ok(
    lines.every((line) => line.startsWith("|") && line.endsWith("|")),
    "every support matrix line should stay inside the markdown table",
  );
});

test("sequence component examples parse, render, and write review artifacts", async () => {
  for (const example of SEQUENCE_COMPONENT_EXAMPLES) {
    const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
    assert.ok(diagram instanceof SequenceDiagram, `${example.id} should parse as sequence`);
    assert.ok(diagram.participants.length >= 1, `${example.id} should have participants`);

    const result = renderPlantUml(example.source, { sourceLabel: `test.sequence.${example.id}` });
    const doc = await result;
    const svg = await result.toSvg({ canvas: false });
    assert.equal(doc.type, "excalidraw");
    assert.ok(doc.elements.length > 0, `${example.id} should render elements`);
    assert.match(svg, /<svg\b/);

    writeOutput(`sequence/${example.id}.puml`, example.source);
    writeOutput(`sequence/${example.id}.excalidraw.json`, JSON.stringify(doc, null, 2));
    writeOutput(`sequence/${example.id}.svg`, svg);
  }
});

test("sequence arrows use structured endpoints, line style, anchors and color", () => {
  const src = exampleById.get("arrow-variants")?.source;
  assert.ok(src);
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);

  const byLabel = new Map(diagram.messages.map((message) => [message.label, message]));
  assert.equal(byLabel.get("open head")?.arrow.end.head, "open");
  assert.equal(byLabel.get("dashed open")?.arrow.line.style, "dashed");
  assert.equal(byLabel.get("dashed open")?.kind, "async");
  assert.equal(byLabel.get("bidirectional")?.arrow.start.head, "filled");
  assert.equal(byLabel.get("bidirectional")?.arrow.end.head, "filled");
  assert.equal(byLabel.get("circle endpoints")?.arrow.start.head, "circle");
  assert.equal(byLabel.get("circle endpoints")?.arrow.end.head, "circle");
  assert.equal(byLabel.get("cross at start")?.arrow.start.head, "cross");
  assert.equal(byLabel.get("lost at end")?.arrow.end.head, "cross");
  assert.equal(byLabel.get("red arrow")?.arrow.line.color, "#red");
  assert.equal(byLabel.get("slanted arrow")?.arrow.line.slant, 12);
  const endpointLabelMessage = diagram.messages.find((message) =>
    message.label.startsWith("central label uses"),
  );
  assert.ok(endpointLabelMessage);
  assert.match(endpointLabelMessage.arrow.start.label, /source endpoint label/);
  assert.match(endpointLabelMessage.arrow.end.label, /target endpoint label/);
  assert.equal(byLabel.get("incoming from diagram edge")?.arrow.start.anchor, "diagramLeft");
  assert.equal(byLabel.get("outgoing to diagram edge")?.arrow.end.anchor, "diagramRight");
  assert.equal(byLabel.get("short incoming")?.arrow.start.anchor, "shortLeft");
  assert.equal(byLabel.get("short outgoing")?.arrow.end.anchor, "shortRight");
  assert.equal(
    byLabel.get("parallel teoz-style message is accepted with simplified geometry")?.parallel,
    true,
  );
});

test("sequence creole/html-like markup is preserved as safe plain text", async () => {
  const src = exampleById.get("basics")?.source;
  assert.ok(src);
  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.safe-plain-markup" });
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceMessageLabel" &&
        element.text.includes("**request** <b>as") &&
        element.text.includes("plain text</b>"),
    ),
  );
  const svg = await renderPlantUml(src, {
    sourceLabel: "test.sequence.safe-plain-markup-svg",
  }).toSvg({ canvas: false });
  assert.match(svg, /\*\*request\*\* &lt;b&gt;as/);
  assert.match(svg, /plain text&lt;\/b&gt;/);
});

test("generic arrow model is shared by sequence messages and component connections", () => {
  const sequence = parsePlantUml(exampleById.get("arrow-variants")?.source || "", {
    unknownLines: "strict",
  });
  assert.ok(sequence instanceof SequenceDiagram);
  assert.ok(sequence.messages[0].arrow instanceof DiagramArrow);

  const component = parsePlantUml(
    `@startuml
class A
class B
A "1" o-- "many" B : owns
@enduml`,
    { unknownLines: "strict" },
  );
  const connection = component.connections[0];
  assert.ok(connection instanceof Connection);
  assert.ok(connection.arrow instanceof DiagramArrow);
  assert.equal(connection.arrow.start.label, "1");
  assert.equal(connection.arrow.end.label, "many");
});

test("sequence labels wrap inside arrowhead-safe budgets and shift following items", () => {
  const src = exampleById.get("label-wrapping")?.source;
  assert.ok(src);
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const wrappedMessages = diagram.messages.filter((message) => message.label.includes("long"));
  assert.ok(wrappedMessages.length >= 2);
  for (const message of wrappedMessages) {
    const budget = arrowLabelBudget(
      Math.abs(message.endX - message.startX),
      message.arrow.start,
      message.arrow.end,
    );
    assert.ok(message.labelWidth <= budget + 0.5, `${message.id} label fits budget`);
    assert.ok(message.wrappedLabel.includes("\n"), `${message.id} wraps`);
    if (message.arrow.start.label || message.arrow.end.label) {
      assert.ok(message.labelBandHeight >= message.arrow.start.labelHeight);
      assert.ok(message.labelBandHeight >= message.arrow.end.labelHeight);
      assert.ok(
        message.arrow.start.labelWidth <= SEQUENCE_SPACING.message.endpointLabelMaxWidth + 0.5,
        `${message.id} start endpoint label stays in the narrow endpoint budget`,
      );
      assert.ok(
        message.arrow.end.labelWidth <= SEQUENCE_SPACING.message.endpointLabelMaxWidth + 0.5,
        `${message.id} end endpoint label stays in the narrow endpoint budget`,
      );
    }
  }
  const marker = diagram.markers.find((item) => item.label === "After wrapped labels");
  assert.ok(marker);
  assert.ok(marker.y > wrappedMessages.at(-1).y, "following marker is pushed below wrapped labels");
});

test("sequence label budget reserves a third arrowhead safety segment", () => {
  const budget = arrowLabelBudget(180, { head: "filled", size: 20 }, { head: "filled", size: 20 });
  assert.equal(budget, 120);
});

test("sequence participant blocks and message presentation skinparams render semantics", async () => {
  const src = `@startuml
skinparam sequence {
  MessageFontColor #red
  MessageAlign right
  ResponseMessageBelowArrow true
  ActorStyle box
}
actor User
participant Service [
=Service
API
]
User -> Service: request
Service --> User: response
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  assert.equal(diagram.participantById("Service")?.title, "Service\nAPI");
  assert.equal(diagram.style.messageAlign, "right");
  assert.equal(diagram.style.responseMessageBelowArrow, "true");
  assert.equal(diagram.style.actorStyle, "box");
  layoutDiagram(diagram);

  const response = diagram.messages.find((message) => message.label === "response");
  assert.ok(response);
  assert.ok(response.labelBelowHeight > 0, "response label should reserve space below arrow");
  assert.equal(response.labelBandHeight, 0, "response label should not reserve above-arrow space");

  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.message-presentation" });
  const responseLabel = doc.elements.find(
    (element) =>
      element.customData?.role === "sequenceMessageLabel" &&
      element.customData?.messageId === response.id,
  );
  assert.ok(responseLabel);
  assert.ok(responseLabel.y > response.y, "response label should render below the arrow");
  assert.equal(responseLabel.textAlign, "right");
  assert.equal(responseLabel.strokeColor, "#ff0000");
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceParticipantHead" &&
        element.customData?.participantId === "User",
    ),
    "ActorStyle box should render actors with participant-head semantics",
  );
});

test("sequence group secondary labels, colors, and skinparams render semantics", async () => {
  const src = `@startuml
skinparam sequence {
  NoteBackgroundColor #LightYellow
  NoteBorderColor #red
  NoteFontColor #blue
  GroupBackgroundColor #LightGreen
  GroupBorderColor #green
  GroupFontColor #purple
  DividerBorderColor #red
  ActivationBackgroundColor #LightBlue
}
participant A
participant B
== Styled Divider ==
A -> B ++: start
note right of B: styled note
group primary label [secondary label] #LightBlue
  B --> A --: done
end
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  const fragment = diagram.fragments[0];
  assert.ok(fragment);
  assert.equal(fragment.label, "primary label");
  assert.equal(fragment.secondaryLabel, "secondary label");
  assert.equal(fragment.color, "#LightBlue");

  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.fragment-skinparams" });
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceFragmentSecondaryText" &&
        element.text === "secondary label",
    ),
  );
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceFragmentFrame" &&
        element.backgroundColor === "#dbeafe",
    ),
  );
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceNote" &&
        element.strokeColor === "#ff0000" &&
        element.backgroundColor === "#fef9c3",
    ),
  );
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceNoteText" && element.strokeColor === "#0000ff",
    ),
  );
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceDivider" && element.strokeColor === "#ff0000",
    ),
  );
  assert.ok(
    doc.elements.some(
      (element) =>
        element.customData?.role === "sequenceActivation" && element.backgroundColor === "#dbeafe",
    ),
  );
});

test("sequence autonumber supports safe plain-text number formats", () => {
  const diagram = parsePlantUml(
    `@startuml
autonumber 3 2 "<b>[000]"
participant A
participant B
A -> B: first
B --> A: second
@enduml`,
    { unknownLines: "strict" },
  );
  assert.ok(diagram instanceof SequenceDiagram);
  assert.deepEqual(
    diagram.messages.map((message) => message.number),
    ["[003]", "[005]"],
  );
});

test("sequence teoz pragmas and partition wrappers are accepted with simplified rows", () => {
  const diagram = parsePlantUml(
    `@startuml
!pragma teoz true
participant A
participant B
partition "simplified partition" {
  A -> B: first
  & B --> A: parallel reply
}
@enduml`,
    { unknownLines: "strict" },
  );
  assert.ok(diagram instanceof SequenceDiagram);
  assert.equal(diagram.messages.length, 2);
  assert.equal(diagram.messages[1].parallel, true);
});

test("sequence notes support color, across, hnote and rnote variants", () => {
  const src = exampleById.get("notes")?.source;
  assert.ok(src);
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  assert.ok(diagram.notes.some((note) => note.color === "#aqua"));
  assert.ok(diagram.notes.some((note) => note.shape === "hnote" && note.target2));
  assert.ok(
    diagram.notes.some((note) => note.shape === "rnote" && note.text.includes("multiple lines")),
  );
});

test("sequence lifecycle supports return messages and hide footbox", () => {
  const lifecycle = parsePlantUml(exampleById.get("lifecycle")?.source || "", {
    unknownLines: "strict",
  });
  assert.ok(lifecycle instanceof SequenceDiagram);
  const returned = lifecycle.messages.find((message) => message.label === "nested done");
  assert.ok(returned);
  assert.equal(returned.kind, "reply");
  assert.equal(returned.dashed, true);

  const styled = parsePlantUml(
    exampleById.get("autonumber-title-footbox-skinparam")?.source || "",
    {
      unknownLines: "strict",
    },
  );
  assert.ok(styled instanceof SequenceDiagram);
  assert.equal(styled.showFootbox, false);
  assert.deepEqual(
    styled.messages.map((message) => message.number),
    ["[010]", "", "[015]"],
  );
});

test("sequence lifecycle messages anchor at activation bar edges", () => {
  const src = `@startuml
participant A
participant B
A -> B ++: begin
B --> A: while active
B -> A --: finish
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const begin = diagram.messages.find((message) => message.label === "begin");
  const activeReply = diagram.messages.find((message) => message.label === "while active");
  assert.ok(begin);
  assert.ok(activeReply);

  assert.notEqual(begin.endX, begin.to.x, "activation target should not end on participant center");
  assert.notEqual(
    activeReply.startX,
    activeReply.from.x,
    "activation source should not start on participant center",
  );
});

test("sequence self feedback loops anchor to activation edge", () => {
  const src = `@startuml
participant A
A -> A ++: outer call
A -> A ++: step in loop
return loop done
return outer done
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const outerCall = diagram.messages.find((message) => message.label === "outer call");
  const loopIn = diagram.messages.find((message) => message.label === "step in loop");
  const loopOut = diagram.messages.find((message) => message.label === "loop done");
  const outerDone = diagram.messages.find((message) => message.label === "outer done");

  assert.ok(outerCall);
  assert.ok(loopIn);
  assert.ok(loopOut);
  assert.ok(outerDone);

  const outerActivation = diagram.activations.find((activation) => activation.depth === 0);
  const innerActivation = diagram.activations.find((activation) => activation.depth === 1);

  assert.ok(outerActivation);
  assert.ok(innerActivation);
  assert.equal(
    innerActivation.y,
    loopIn.y + 24,
    "nested activation should start at the self-loop arrow tip",
  );
  assert.equal(
    innerActivation.y + innerActivation.height,
    loopOut.y,
    "nested activation should end where the return loop starts",
  );
  assert.ok(
    loopIn.startX > loopIn.from.x,
    "activate should leave from the right edge of the parent activation",
  );
  assert.ok(loopIn.endX > loopIn.startX, "activate should point further outward on the same side");
  assert.ok(
    loopOut.startX > loopOut.endX,
    "return should come back from the child outer edge to the parent edge",
  );
  assert.ok(
    loopOut.endX > loopOut.to.x,
    "return target should stay on the right edge of the parent activation",
  );
  assert.equal(
    outerActivation.y,
    outerCall.y + 24,
    "root self-activation should start at its arrow tip",
  );
  assert.equal(
    outerActivation.y + outerActivation.height,
    outerDone.y,
    "root self-activation should end where the closing return starts",
  );
});

test("sequence nested lifecycle inherits a right-side parent flow", () => {
  const src = `@startuml
participant User
participant Worker
participant Job
User -> Worker: start
activate Worker
Worker -> Worker ++: nested work
return nested done
Worker -> Job: create job
Job --> Worker: ready
Worker --> User: done
deactivate Worker
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const nestedIn = diagram.messages.find((message) => message.label === "nested work");
  const nestedOut = diagram.messages.find((message) => message.label === "nested done");
  const worker = diagram.participantById("Worker");
  const nestedActivation = diagram.activations.find((activation) => activation.depth === 1);

  assert.ok(nestedIn);
  assert.ok(nestedOut);
  assert.ok(worker);
  assert.ok(nestedActivation);
  assert.ok(
    nestedIn.startX > worker.x,
    "nested activation should leave the parent on the right when later work goes right",
  );
  assert.ok(
    nestedIn.endX > nestedIn.startX,
    "right-side nested activation should point further right",
  );
  assert.ok(
    nestedOut.endX > worker.x,
    "right-side return should land back on the parent right edge",
  );
  assert.equal(
    nestedActivation.y,
    nestedIn.y + 24,
    "right-side nested activation should start at the self-loop tip",
  );
  assert.equal(
    nestedActivation.y + nestedActivation.height,
    nestedOut.y,
    "right-side nested activation should end at the return origin",
  );
});

test("sequence nested lifecycle mirrors to the left when parent work goes left", () => {
  const src = `@startuml
participant Left
participant Worker
Left -> Worker: start
activate Worker
Worker -> Worker ++: nested left
return nested left done
Worker -> Left: sync left
Worker --> Left: done
deactivate Worker
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const nestedIn = diagram.messages.find((message) => message.label === "nested left");
  const nestedOut = diagram.messages.find((message) => message.label === "nested left done");
  const syncLeft = diagram.messages.find((message) => message.label === "sync left");
  const worker = diagram.participantById("Worker");
  const nestedActivation = diagram.activations.find((activation) => activation.depth === 1);

  assert.ok(nestedIn);
  assert.ok(nestedOut);
  assert.ok(syncLeft);
  assert.ok(worker);
  assert.ok(nestedActivation);
  assert.ok(
    nestedIn.startX < worker.x,
    "nested activation should leave the parent on the left when later work goes left",
  );
  assert.ok(
    nestedIn.endX < nestedIn.startX,
    "left-side nested activation should point further left",
  );
  assert.ok(
    nestedOut.startX < nestedOut.endX,
    "left-side return should curve back toward the parent edge",
  );
  assert.ok(
    syncLeft.startX < worker.x,
    "leftward sub-calls should originate from the left edge of the active lifeline",
  );
  assert.equal(
    nestedActivation.y,
    nestedIn.y + 24,
    "left-side nested activation should start at the self-loop tip",
  );
  assert.equal(
    nestedActivation.y + nestedActivation.height,
    nestedOut.y,
    "left-side nested activation should end at the return origin",
  );
});

test("sequence deeper nested lifecycle keeps stacking on the chosen side", () => {
  const src = `@startuml
participant Left
participant Worker
Left -> Worker: start
activate Worker
Worker -> Worker ++: first nested
Worker -> Worker ++: second nested
return second done
return first done
Worker -> Left: sync left
Worker --> Left: done
deactivate Worker
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const firstIn = diagram.messages.find((message) => message.label === "first nested");
  const secondIn = diagram.messages.find((message) => message.label === "second nested");
  const secondOut = diagram.messages.find((message) => message.label === "second done");
  const firstOut = diagram.messages.find((message) => message.label === "first done");
  const firstActivation = diagram.activations.find((activation) => activation.depth === 1);
  const secondActivation = diagram.activations.find((activation) => activation.depth === 2);

  assert.ok(firstIn);
  assert.ok(secondIn);
  assert.ok(secondOut);
  assert.ok(firstOut);
  assert.ok(firstActivation);
  assert.ok(secondActivation);
  assert.ok(firstIn.endX < firstIn.startX, "first nested activation should open to the left");
  assert.ok(
    secondIn.endX < secondIn.startX,
    "second nested activation should also open to the left",
  );
  assert.ok(
    secondIn.endX < firstIn.endX,
    "deeper nested activation should stack further outward on the same side",
  );
  assert.ok(
    secondOut.startX < secondOut.endX,
    "deeper nested return should come back toward its parent edge",
  );
  assert.ok(
    firstOut.startX < firstOut.endX,
    "outer nested return should also come back toward its parent edge",
  );
  assert.equal(
    firstActivation.y,
    firstIn.y + 24,
    "first nested activation should start at its loop tip",
  );
  assert.equal(
    secondActivation.y,
    secondIn.y + 24,
    "second nested activation should start at its loop tip",
  );
  assert.equal(
    secondActivation.y + secondActivation.height,
    secondOut.y,
    "second nested activation should end at its return origin",
  );
  assert.equal(
    firstActivation.y + firstActivation.height,
    firstOut.y,
    "first nested activation should end at its return origin",
  );
});

test("sequence global presentation features render visible semantics", async () => {
  const src = exampleById.get("global-presentation")?.source;
  assert.ok(src);
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  assert.equal(diagram.header, "Sequence coverage header");
  assert.equal(diagram.footer, "Sequence coverage footer");
  assert.equal(diagram.mainframe, "Sequence coverage frame");
  assert.equal(diagram.hideUnlinked, true);
  assert.equal(diagram.participantById("Unused"), null);
  assert.equal(diagram.style.lifelineStyle, "solid");
  assert.ok(diagram.markers.some((marker) => marker.kind === "pageBreak"));

  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.global-presentation" });
  assert.ok(doc.elements.some((element) => element.customData?.role === "sequenceHeader"));
  assert.ok(doc.elements.some((element) => element.customData?.role === "sequenceFooter"));
  assert.ok(doc.elements.some((element) => element.customData?.role === "sequenceMainframe"));
  assert.ok(doc.elements.some((element) => element.customData?.role === "sequencePageBreak"));
  const lifelines = doc.elements.filter(
    (element) => element.customData?.role === "sequenceLifeline",
  );
  assert.ok(lifelines.length > 0);
  assert.ok(lifelines.every((element) => element.strokeStyle === "solid"));
});

test("sequence participant groups keep clear of header text", () => {
  const src = `@startuml
header Coverage header
box "group"
participant A
participant B
end box
A -> B: hi
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const group = diagram.participantGroups[0];
  assert.ok(group);
  // Header starts at y=48 and occupies one description line.
  const headerBottom = 48 + FONT.sizeDescription * FONT.lineHeight;
  assert.ok(group.y >= headerBottom + 8, "group frame should not overlap header");
});

test("sequence multiline header shifts upward to preserve clearance", async () => {
  const src = `@startuml
title Header shift
header line 1\\nline 2\\nline 3
participant A
participant B
A -> B: hi
@enduml`;
  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.multiline-header-shift" });
  const header = doc.elements.find((element) => element.customData?.role === "sequenceHeader");
  assert.ok(header);
  assert.ok(header.y < 48, "multiline header should move upward from default baseline");
});

test("sequence terminal fragment keeps bottom breathing room", () => {
  const src = `@startuml
participant A
participant B
loop terminal
  A -> B: final call
end
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  layoutDiagram(diagram);

  const fragment = diagram.fragments[0];
  assert.ok(fragment);
  const bottomGap = diagram.height - (fragment.y + fragment.height);
  assert.ok(bottomGap >= 80, "terminal fragment should keep visible bottom spacing");
});

test("sequence SVG export contains concrete marker shapes and tip-anchored start heads", async () => {
  const svg = await renderPlantUml(exampleById.get("arrow-variants")?.source || "", {
    sourceLabel: "test.sequence.arrow-marker-shapes",
  }).toSvg({ canvas: false });
  assert.match(svg, /id="m_circle_outline_start_/);
  assert.match(svg, /id="m_bar_start_/);
  assert.match(svg, /id="m_partial_top_end_/);
  assert.match(svg, /id="m_partial_bottom_end_/);
  assert.match(svg, /marker-start="url\(#m_circle_outline_start_/);
  assert.match(svg, /id="m_triangle_start_[^"]+"[^>]+refX="9"/);
});

test("sequence participant order is applied before layout", async () => {
  const src = exampleById.get("participants")?.source;
  assert.ok(src);
  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.participant-order" });
  const heads = doc.elements.filter(
    (element) => element.customData?.role === "sequenceParticipantHead",
  );
  const first = heads.find((element) => element.customData?.participantId === "First");
  const middle = heads.find((element) => element.customData?.participantId === "Middle");
  const last = heads.find((element) => element.customData?.participantId === "Last");
  assert.ok(first && middle && last);
  assert.ok(first.x < middle.x);
  assert.ok(middle.x < last.x);
});

test("sequence feedback-loop assets render loop fragment and symbol heads", async () => {
  const src = exampleById.get("feedback-loops-assets")?.source;
  assert.ok(src);
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.ok(diagram instanceof SequenceDiagram);
  assert.ok(diagram.fragments.some((fragment) => fragment.kind === "loop"));

  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.feedback-loop-assets" });
  const symbols = doc.elements.filter(
    (element) => element.customData?.role === "sequenceParticipantSymbol",
  );
  const shapes = new Set(symbols.map((element) => element.customData?.shape));
  for (const expected of [
    "actor",
    "boundary",
    "control",
    "entity",
    "database",
    "collections",
    "queue",
  ]) {
    assert.ok(shapes.has(expected), `missing symbol for ${expected} in feedback loop assets`);
  }
});

test("sequence participant shapes emit symbol elements for Excalidraw/SVG parity", async () => {
  const src = exampleById.get("participants")?.source;
  assert.ok(src);
  const doc = await renderPlantUml(src, { sourceLabel: "test.sequence.participant-symbols" });
  const symbols = doc.elements.filter(
    (element) => element.customData?.role === "sequenceParticipantSymbol",
  );
  const shapes = new Set(symbols.map((element) => element.customData?.shape));
  for (const expected of [
    "actor",
    "boundary",
    "control",
    "entity",
    "database",
    "collections",
    "queue",
  ]) {
    assert.ok(shapes.has(expected), `missing symbol for ${expected}`);
  }
});
