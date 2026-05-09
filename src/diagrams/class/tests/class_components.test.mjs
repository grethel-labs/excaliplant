import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../../../../index.mjs";
import { excalidrawToSvg } from "../../../general/render/svg.mjs";
import { CLASS_COMPONENT_EXAMPLES } from "../docs/coverage_examples.mjs";
import { writeClassOutput } from "./output.mjs";

const exampleById = new Map(CLASS_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

test("class component examples parse, render, and write review artifacts", async () => {
  for (const example of CLASS_COMPONENT_EXAMPLES) {
    const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
    assert.ok(!(diagram instanceof SequenceDiagram), `${example.id} should parse as graph diagram`);
    assert.ok(diagram.allBoxes().length >= 1, `${example.id} should have boxes`);

    const doc = await renderPlantUml(example.source, { sourceLabel: `class/${example.id}` });
    assert.equal(doc.type, "excalidraw");
    assert.ok(doc.elements.length > 0, `${example.id} should render elements`);

    const svg = excalidrawToSvg(doc);
    assert.match(svg, /<svg\b/);
    writeClassOutput(`${example.id}.puml`, example.source);
    writeClassOutput(`${example.id}.excalidraw.json`, JSON.stringify(doc, null, 2));
    writeClassOutput(`${example.id}.svg`, svg);
  }
});

test("class namespace examples keep namespace containers and extended class keywords", () => {
  const example = exampleById.get("namespace-generics");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.planes.length, 1);
  assert.equal(diagram.planes[0].kind, "namespace");
  assert.equal(diagram.planes[0].title, "Billing");

  const repository = diagram.boxById("Repository");
  assert.equal(repository.shape, "class");
  assert.equal(repository.stereotype, "abstract");
  assert.equal(repository.title, "Repository<T>");

  assert.equal(diagram.boxById("Money").stereotype, "record");
  assert.equal(diagram.boxById("Auditable").stereotype, "annotation");
  assert.equal(diagram.boxById("Invoice").stereotype, "dataclass");
  assert.ok(diagram.connections.some((connection) => connection.kind === "inheritance"));
  assert.ok(diagram.connections.some((connection) => connection.kind === "realization"));
});

test("class relationships preserve styled arrows, multiplicities and direction hints", () => {
  const example = exampleById.get("relationships");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const contains = diagram.connections.find((connection) => connection.label === "contains");
  assert.ok(contains);
  assert.equal(contains.kind, "composition");
  assert.equal(contains.fromMul, "1");
  assert.equal(contains.toMul, "many");

  const styled = diagram.connections.find((connection) => connection.label === "serializes");
  assert.ok(styled);
  assert.equal(styled.dashed, true);
  assert.equal(styled.kind, "dependency");

  const upward = diagram.connections.find((connection) => connection.label === "belongs to");
  assert.ok(upward);
  assert.equal(upward.directionHint, "up");
});

test("class notes support note-on-link and member-qualified note targets", () => {
  const example = exampleById.get("notes-on-link");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const notes = diagram.allBoxes().filter((box) => box.shape === "note");
  assert.equal(notes.length, 2);
  assert.ok(notes.some((note) => note.description.includes("contains order lines")));
  assert.ok(notes.some((note) => note.description.includes("parses safely")));
  assert.ok(diagram.connections.some((connection) => connection.kind === "note"));
});

test("class association classes and remove filters are modeled", () => {
  const example = exampleById.get("association-filters");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.boxById("Obsolete"), null);
  const association = diagram.boxById("Enrollment");
  assert.ok(association);
  assert.equal(association.stereotype, "association");
  assert.equal(diagram.hideEmptyMembers, false);

  const associationEdges = diagram.connections.filter(
    (connection) => connection.kind === "association-class",
  );
  assert.equal(associationEdges.length, 2);
  assert.ok(associationEdges.every((connection) => connection.from.id === "Enrollment"));
  assert.deepEqual(associationEdges.map((connection) => connection.to.id).sort(), [
    "Course",
    "Student",
  ]);
});
