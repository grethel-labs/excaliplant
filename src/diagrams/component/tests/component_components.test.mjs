import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../../../../index.mjs";
import { excalidrawToSvg } from "../../../general/render/svg.mjs";
import { COMPONENT_COMPONENT_EXAMPLES } from "../docs/coverage_examples.mjs";
import { writeComponentOutput } from "./output.mjs";

const exampleById = new Map(COMPONENT_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

test("component examples parse, render, and write review artifacts", async () => {
  for (const example of COMPONENT_COMPONENT_EXAMPLES) {
    const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
    assert.ok(!(diagram instanceof SequenceDiagram), `${example.id} should parse as graph diagram`);
    assert.ok(diagram.allBoxes().length >= 1, `${example.id} should have boxes`);

    const doc = await renderPlantUml(example.source, { sourceLabel: `component/${example.id}` });
    assert.equal(doc.type, "excalidraw");
    assert.ok(doc.elements.length > 0, `${example.id} should render elements`);

    const svg = excalidrawToSvg(doc);
    assert.match(svg, /<svg\b/);
    writeComponentOutput(`${example.id}.puml`, example.source);
    writeComponentOutput(`${example.id}.excalidraw.json`, JSON.stringify(doc, null, 2));
    writeComponentOutput(`${example.id}.svg`, svg);
  }
});

test("component containers preserve graph direction and styled arrows", () => {
  const example = exampleById.get("containers");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.layoutDirection, "RIGHT");
  assert.ok(diagram.planes.some((plane) => plane.kind === "package"));
  assert.ok(diagram.planes.some((plane) => plane.kind === "node"));
  assert.ok(diagram.planes.some((plane) => plane.kind === "frame"));

  const styled = diagram.connections.find((connection) => connection.label === "reads");
  assert.ok(styled);
  assert.equal(styled.dashed, true);
  assert.equal(styled.kind, "dependency");
  assert.equal(
    diagram.connections.find((connection) => connection.label === "fetches").directionHint,
    "right",
  );
});

test("component ports attach to boxes and route through port anchors", async () => {
  const example = exampleById.get("ports");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const api = diagram.boxById("api");
  assert.ok(api);
  assert.ok(api.ports.left.some((port) => port.id === "http" && port.direction === "in"));
  assert.ok(api.ports.right.some((port) => port.id === "events" && port.direction === "out"));

  const inbound = diagram.connections.find((connection) => connection.label === "calls");
  assert.ok(inbound);
  assert.equal(inbound.arrow.end.anchor, "port");
  assert.equal(inbound.arrow.end.label, "http");

  const outbound = diagram.connections.find((connection) => connection.label === "publishes");
  assert.ok(outbound);
  assert.equal(outbound.arrow.start.anchor, "port");
  assert.equal(outbound.arrow.start.label, "events");
  assert.equal(outbound.dashed, true);

  const doc = await renderPlantUml(example.source, { sourceLabel: "component/ports" });
  const markers = doc.elements.filter((element) => element.customData?.role === "boxPort");
  assert.ok(markers.some((marker) => marker.customData.boxId === "api"));
  assert.ok(markers.some((marker) => marker.customData.portId === "http"));
  assert.ok(markers.some((marker) => marker.customData.portId === "events"));
});

test("component notes support note-on-link blocks", () => {
  const example = exampleById.get("notes-on-link");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const notes = diagram.allBoxes().filter((box) => box.shape === "note");
  assert.equal(notes.length, 2);
  assert.ok(notes.some((note) => note.description.includes("retry policy")));
  assert.ok(notes.some((note) => note.description.includes("public entry point")));
  assert.ok(diagram.connections.some((connection) => connection.kind === "note"));
});
