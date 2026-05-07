import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../index.mjs";
import { SEQUENCE_COMPONENT_EXAMPLES } from "../docs/scripts/sequence-coverage-examples.mjs";
import { writeOutput } from "./helpers/output.mjs";

const exampleById = new Map(SEQUENCE_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

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
  assert.equal(byLabel.get("incoming from diagram edge")?.arrow.start.anchor, "diagramLeft");
  assert.equal(byLabel.get("outgoing to diagram edge")?.arrow.end.anchor, "diagramRight");
  assert.equal(byLabel.get("short incoming")?.arrow.start.anchor, "shortLeft");
  assert.equal(byLabel.get("short outgoing")?.arrow.end.anchor, "shortRight");
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
    ["10", "", "15"],
  );
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
