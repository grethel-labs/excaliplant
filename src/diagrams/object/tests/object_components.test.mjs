import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../../../../index.mjs";
import { excalidrawToSvg } from "../../../general/render/svg.mjs";
import { OBJECT_COMPONENT_EXAMPLES } from "../docs/coverage_examples.mjs";
import { writeObjectOutput } from "./output.mjs";

const exampleById = new Map(OBJECT_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

test("object component examples parse, render, and write review artifacts", async () => {
  for (const example of OBJECT_COMPONENT_EXAMPLES) {
    const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
    assert.ok(!(diagram instanceof SequenceDiagram), `${example.id} should parse as graph diagram`);
    assert.ok(diagram.allBoxes().length >= 1, `${example.id} should have boxes`);

    const doc = await renderPlantUml(example.source, { sourceLabel: `object/${example.id}` });
    assert.equal(doc.type, "excalidraw");
    assert.ok(doc.elements.length > 0, `${example.id} should render elements`);

    const svg = excalidrawToSvg(doc);
    assert.match(svg, /<svg\b/);
    await writeObjectOutput(`${example.id}.puml`, example.source);
    await writeObjectOutput(`${example.id}.excalidraw.json`, JSON.stringify(doc, null, 2));
    await writeObjectOutput(`${example.id}.svg`, svg);
  }
});

test("object declarations keep aliases and field rows", () => {
  const example = exampleById.get("objects-fields");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const user = diagram.boxById("user");
  assert.ok(user);
  assert.equal(user.shape, "object");
  assert.deepEqual(user.members, ['name = "Dummy"', "id = 123"]);

  const session = diagram.boxById("session");
  assert.ok(session);
  assert.equal(session.title, "Session Token");
  assert.deepEqual(session.members, ['value = "abc"']);
  assert.ok(diagram.connections.some((connection) => connection.label === "owns"));
});

test("object maps expose row ports for Map::key references", () => {
  const example = exampleById.get("maps-anchors");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const map = diagram.boxById("CapitalCity");
  assert.ok(map);
  assert.equal(map.shape, "map");
  assert.deepEqual(map.members, ["UK => London", "USA => Washington"]);
  assert.ok(map.ports.right.some((port) => port.id === "UK"));

  const visits = diagram.connections.find((connection) => connection.label === "visits");
  assert.ok(visits);
  assert.equal(visits.arrow.end.anchor, "port");
  assert.equal(visits.arrow.end.label, "UK");
});

test("object diamonds and class-like relationships are modeled", () => {
  const example = exampleById.get("diamond-relationships");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.boxById("Aggregation")?.shape, "diamond");
  assert.ok(diagram.connections.some((connection) => connection.kind === "composition"));
  assert.ok(diagram.connections.some((connection) => connection.to.id === "Aggregation"));
});
