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

test("component presentation metadata parses and hidden arrows stay non-rendered", async () => {
  const example = exampleById.get("presentation-hidden");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.title, "Component landscape");
  assert.equal(diagram.caption, "Runtime view");
  assert.equal(diagram.header, "Internal");
  assert.equal(diagram.footer, "Confidential");
  assert.equal(diagram.mainframe, "Component frame");
  assert.match(diagram.legend, /Hidden edge/);
  assert.equal(diagram.connections.length, 1);
  assert.equal(diagram.connections[0].label, "reads");

  const doc = await renderPlantUml(example.source, {
    sourceLabel: "component/presentation-hidden",
  });
  const arrows = doc.elements.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 1);
});

test("component official declarations and relation endpoints parse", () => {
  const example = exampleById.get("official-components-relations");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.kind, "component");
  assert.equal(diagram.boxById("Comp2").title, "Another component");
  assert.equal(diagram.boxById("Comp3").shape, "component");
  assert.equal(diagram.boxById("Comp4").title, "Last\ncomponent");
  assert.equal(diagram.boxById("DataAccess").shape, "component");
  assert.equal(diagram.boxById("HTTP").shape, "component");
  assert.ok(diagram.connections.some((connection) => connection.to.id === "first_component"));
  assert.ok(diagram.connections.some((connection) => connection.label === "use"));
});

test("component official JSON display and bare ports are modeled", async () => {
  const example = exampleById.get("official-json-ports");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const json = diagram.boxById("JSON");
  assert.ok(json);
  assert.equal(json.shape, "map");
  assert.ok(json.members.some((member) => member.includes('"fruit":"Apple"')));

  for (const id of ["p1", "p2", "p3"]) {
    assert.equal(diagram.boxById(id).shape, "interface");
  }
  assert.equal(diagram.boxById("p2").stereotype, "in");
  assert.equal(diagram.boxById("p3").stereotype, "out");
  assert.ok(diagram.connections.some((connection) => connection.from.id === "C"));
  assert.ok(diagram.connections.some((connection) => connection.from.id === "p1"));

  const doc = await renderPlantUml(example.source, {
    sourceLabel: "component/official-json-ports",
  });
  assert.ok(doc.elements.length > 0);
});
