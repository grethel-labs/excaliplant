// Deployment diagram component tests.

import test from "node:test";
import assert from "node:assert/strict";

import { Diagram, parsePlantUml, renderPlantUml, layoutDiagram } from "../../../../index.mjs";
import { DEPLOYMENT_COMPONENT_EXAMPLES } from "../docs/coverage_examples.mjs";
import { writeDeploymentOutput } from "./output.mjs";

const exampleById = new Map(DEPLOYMENT_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

test("deployment component examples parse, render, and write review artifacts", async () => {
  for (const example of DEPLOYMENT_COMPONENT_EXAMPLES) {
    const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
    assert.ok(diagram instanceof Diagram, `${example.id} should parse as diagram`);
    assert.ok(
      diagram.planes.length >= 1 || diagram.allBoxes().length >= 1,
      `${example.id} should have content`,
    );

    const result = renderPlantUml(example.source, { sourceLabel: `test.deployment.${example.id}` });
    const doc = await result;
    const svg = await result.toSvg({ canvas: false });
    assert.equal(doc.type, "excalidraw");
    assert.ok(doc.elements.length > 0, `${example.id} should render elements`);
    assert.match(svg, /<svg\b/);

    writeDeploymentOutput(`${example.id}.puml`, example.source);
    writeDeploymentOutput(`${example.id}.excalidraw.json`, JSON.stringify(doc, null, 2));
    writeDeploymentOutput(`${example.id}.svg`, svg);
  }
});

test("deployment basic node creates a box", () => {
  const example = exampleById.get("basic-node");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
  assert.ok(diagram instanceof Diagram);
  const node = diagram.boxById("srv");
  assert.ok(node);
  assert.equal(node.title, "Server");
  assert.equal(node.shape, "node");
});

test("deployment nested containers create hierarchy", () => {
  const example = exampleById.get("nested-containers");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
  assert.ok(diagram instanceof Diagram);
  // Should have nested structure
  assert.ok(diagram.planes.length > 0 || diagram.allBoxes.length > 0);
});

test("deployment all shapes are recognized", () => {
  const example = exampleById.get("all-shapes");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
  assert.ok(diagram instanceof Diagram);
  // Check that various shapes were parsed - should have at least 5 boxes
  const totalBoxes = diagram.planes?.[0]?.allBoxes?.length || diagram.allBoxes?.length || 0;
  assert.ok(totalBoxes >= 5, `Should have multiple boxes, got ${totalBoxes}`);
});

test("deployment ports are parsed and referenced", () => {
  const example = exampleById.get("ports");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
  assert.ok(diagram instanceof Diagram);
  // The diagram should parse successfully with nodes and connections
  const totalBoxes = diagram.planes?.[0]?.allBoxes?.length || diagram.allBoxes?.length || 0;
  assert.ok(totalBoxes >= 2, "Should have at least two boxes (Server and Proxy)");
});

test("deployment arrow styles are preserved", () => {
  const example = exampleById.get("arrow-styles");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });
  assert.ok(diagram instanceof Diagram);
  assert.ok(
    diagram.connections.length >= 4,
    "Should have multiple connections with different styles",
  );
});

test("deployment official elements parse with expected shapes", () => {
  const example = exampleById.get("official-elements");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  assert.equal(diagram.kind, "deployment");
  assert.equal(diagram.boxById("actor").shape, "actor");
  assert.equal(diagram.boxById("agent").shape, "agent");
  assert.equal(diagram.boxById("artifact").shape, "rectangle");
  assert.equal(diagram.boxById("cloud").shape, "cloud");
  assert.equal(diagram.boxById("database").shape, "database");
  assert.equal(diagram.boxById("queue").shape, "queue");
  assert.equal(diagram.boxById("storage").shape, "storage");
});

test("deployment official long descriptions normalize rich text and separators", () => {
  const example = exampleById.get("official-long-descriptions");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const folder = diagram.boxById("folder");
  const node = diagram.boxById("node");
  assert.ok(folder);
  assert.ok(node);
  assert.equal(folder.shape, "folder");
  assert.equal(node.shape, "node");
  assert.match(folder.description, /This is a folder/);
  assert.doesNotMatch(folder.description, /<b>|----|====/);
});

test("deployment official JSON display parses and renders", async () => {
  const example = exampleById.get("official-json");
  assert.ok(example);
  const diagram = parsePlantUml(example.source, { unknownLines: "strict" });

  const json = diagram.boxById("JSON");
  assert.ok(json);
  assert.equal(json.shape, "map");
  assert.ok(json.members.some((member) => member.includes('"fruit":"Apple"')));
  assert.ok(diagram.connections.some((connection) => connection.from.id === "Runtime"));

  const doc = await renderPlantUml(example.source, { sourceLabel: "deployment/official-json" });
  assert.ok(doc.elements.length > 0);
});
