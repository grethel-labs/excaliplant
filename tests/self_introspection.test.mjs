// Self-introspection: emit PlantUML for excaliplant's own structure,
// then run that PlantUML through excaliplant itself.
//
// This is both a regression test (the lib must handle its own self-graph
// without errors) and a doc artefact: the same generators are used by
// `scripts/build-docs.mjs` to write the README diagrams at build time.

import test from "node:test";
import assert from "node:assert/strict";
import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../index.mjs";
import {
  buildModuleDiagramSource,
  buildSequenceDiagramSource,
  buildPluginDetailDiagramSource,
} from "../docs/scripts/self-diagrams.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import { svgToPng } from "../src/render/png.mjs";
import { writeOutput } from "./helpers/output.mjs";

test("module-graph PlantUML for the project parses + renders", async () => {
  const puml = await buildModuleDiagramSource();
  assert.match(puml, /@startuml/);
  assert.match(puml, /@enduml/);
  // Should mention some core modules.
  assert.match(puml, /parser/);
  assert.match(puml, /layout/);
  assert.match(puml, /render/);

  const diagram = parsePlantUml(puml);
  assert.ok(diagram.planes.length >= 1);
  assert.ok(diagram.allBoxes().length >= 5);
  // Smoke: end-to-end render works.
  const doc = await renderPlantUml(puml, { sourceLabel: "self.modules" });
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);

  const svg = excalidrawToSvg(doc);
  writeOutput("self-modules.excalidraw.json", JSON.stringify(doc, null, 2));
  writeOutput("self-modules.svg", svg);
  writeOutput("self-modules.png", svgToPng(svg, { width: 1600 }));
});

test("renderPlantUml call-flow sequence diagram parses + renders", async () => {
  const puml = buildSequenceDiagramSource();
  const seq = parsePlantUml(puml);
  assert.ok(seq instanceof SequenceDiagram);
  // The flow has at least: caller → parser → layout → renderer.
  assert.ok(seq.participants.length >= 4);
  assert.ok(seq.messages.length >= 4);
  const doc = await renderPlantUml(puml, { sourceLabel: "self.sequence" });
  assert.equal(doc.type, "excalidraw");

  const svg = excalidrawToSvg(doc);
  writeOutput("self-sequence.excalidraw.json", JSON.stringify(doc, null, 2));
  writeOutput("self-sequence.svg", svg);
  writeOutput("self-sequence.png", svgToPng(svg, { width: 1200 }));
});

test("plugin-detail PlantUML enumerates every default plugin as a box", async () => {
  const { puml, expectedPlugins } = await buildPluginDetailDiagramSource();
  const diagram = parsePlantUml(puml);
  // Each plugin should map to a box.
  for (const name of expectedPlugins) {
    const slug = name.replace(/[.\\W]/g, "_");
    assert.ok(diagram.boxById(slug), `missing box for plugin ${name}`);
  }
  const doc = await renderPlantUml(puml, { sourceLabel: "self.plugins" });
  assert.ok(doc.elements.length > 0);

  const svg = excalidrawToSvg(doc);
  writeOutput("self-plugins.excalidraw.json", JSON.stringify(doc, null, 2));
  writeOutput("self-plugins.svg", svg);
  writeOutput("self-plugins.png", svgToPng(svg, { width: 1600 }));
});
