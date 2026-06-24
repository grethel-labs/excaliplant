/**
 * Timing diagram component tests.
 * @module diagrams/timing/tests/timing_components
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, TimingDiagram } from "../../../../index.mjs";
import { excalidrawToSvg } from "../../../general/render/svg.mjs";
import { TIMING_COMPONENT_EXAMPLES } from "../docs/coverage_examples.mjs";

const exampleById = new Map(TIMING_COMPONENT_EXAMPLES.map((example) => [example.id, example]));

test("timing official robust and concise example parses strictly", async () => {
  const source = exampleById.get("official-web-browser").source;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.ok(diagram instanceof TimingDiagram);
  assert.equal(diagram.kind, "timing");
  assert.equal(diagram.participants.length, 2);
  assert.equal(diagram.participantById("WB").title, "Web Browser");
  assert.equal(diagram.participantById("WU").kind, "concise");
  assert.deepEqual(
    diagram.participantById("WB").events.map((event) => [event.time, event.value]),
    [
      [0, "Idle"],
      [100, "Processing"],
      [300, "Waiting"],
    ],
  );

  const doc = await renderPlantUml(source, { sourceLabel: "timing/official-web" });
  assert.ok(doc.elements.some((element) => element.type === "rectangle"));
  assert.match(excalidrawToSvg(doc), /Processing/);
});

test("timing official clock and binary example renders waveform primitives", async () => {
  const source = exampleById.get("official-clock-binary").source;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.equal(diagram.participantById("clk").kind, "clock");
  assert.equal(diagram.participantById("clk").period, 1);
  assert.equal(diagram.participantById("EN").kind, "binary");
  assert.deepEqual(
    diagram.participantById("EN").events.map((event) => [event.time, event.value]),
    [
      [0, "low"],
      [5, "high"],
      [10, "low"],
    ],
  );

  const doc = await renderPlantUml(source, { sourceLabel: "timing/clock-binary" });
  assert.ok(doc.elements.filter((element) => element.type === "line").length >= 3);
  assert.match(excalidrawToSvg(doc), /Enable/);
});

test("timing messages constraints notes and highlights parse and render", async () => {
  const source = `${exampleById.get("messages-constraints-notes").source}
`;
  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.equal(diagram.messages.length, 1);
  assert.equal(diagram.messages[0].label, "request");
  assert.equal(diagram.constraints[0].label, "SLA");
  assert.equal(diagram.notes[0].text, "retries are safe");

  const doc = await renderPlantUml(source, { sourceLabel: "timing/messages" });
  const svg = excalidrawToSvg(doc);
  assert.match(svg, /request/);
  assert.match(svg, /SLA/);
  assert.match(svg, /retries are safe/);
});

test("timing anchored relative times participant mode and hidden axis parse strictly", async () => {
  const source = `@starttiming
hide time-axis
robust "Flow" as F
F has "Not started" as NS, Running, Done
@0 as :start
F is NS
@:start+5
F is Running
@F
+10 is Done
@enduml`;

  const diagram = parsePlantUml(source, { unknownLines: "strict" });

  assert.equal(diagram.axis.hidden, true);
  assert.equal(diagram.anchors.get("start"), 0);
  assert.deepEqual(
    diagram.participantById("F").events.map((event) => [event.time, event.value]),
    [
      [0, "NS"],
      [5, "Running"],
      [15, "Done"],
    ],
  );

  const doc = await renderPlantUml(source, { sourceLabel: "timing/relative-anchor" });
  assert.ok(doc.elements.every((element) => element.text !== "0" && element.text !== "15"));
});

test("timing analog values and highlights use deterministic geometry", async () => {
  const source = exampleById.get("analog-highlight").source;
  const first = await renderPlantUml(source, { sourceLabel: "timing/analog" });
  const second = await renderPlantUml(source, { sourceLabel: "timing/analog" });

  assert.deepEqual(first, second);
  assert.ok(first.elements.some((element) => element.backgroundColor === "#Gold"));
  assert.match(excalidrawToSvg(first), /spike/);
});

test("timing SVG output escapes note and state text", async () => {
  const source = `@startuml
robust "Unsafe <b>Browser</b>" as WB
@0
WB is "<script>alert(1)</script>"
note top of WB : <img src=x onerror=alert(1)>
@enduml`;

  const doc = await renderPlantUml(source, { sourceLabel: "timing/security" });
  const svg = excalidrawToSvg(doc);
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /Unsafe Browser/);
});
