// Visual-quality contracts for sequence diagrams that structural tests would miss.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/index.mjs";

/** Transparent-stroke rectangles are the label plates. */
const plates = (/** @type {any[]} */ els) =>
  els.filter((e) => e.type === "rectangle" && e.strokeColor === "transparent");

const covers = (/** @type {any} */ plate, /** @type {any} */ t) =>
  plate.x <= t.x &&
  plate.x + plate.width >= t.x + t.width &&
  plate.y <= t.y &&
  plate.y + plate.height >= t.y + t.height;

test("a message to the outside that crosses a lifeline gets a plate behind its label", async () => {
  const r = await render(readFileSync("examples/sequence/lifecycle.puml", "utf8"));
  const els = r.excalidraw.elements;
  const label = els.find((e) => e.type === "text" && e.text === "done");
  assert.ok(label);
  // Precondition: the Server lifeline really runs through the label.
  const lifelines = els.filter((e) => e.type === "line" && e.width === 0 && e.height > 50);
  assert.ok(lifelines.some((l) => l.x > label.x && l.x < label.x + label.width));
  const plate = plates(els).find((p) => covers(p, label));
  assert.ok(plate, "no plate behind the crossed label");
  assert.equal(plate.opacity, 100, "a translucent plate lets the lifeline shine through");
  assert.ok(
    els.indexOf(plate) > els.indexOf(lifelines[0]) && els.indexOf(plate) < els.indexOf(label),
    "plate must sit above the lifeline and below the label",
  );
});

test("a label that an activation bar runs through gets a plate, a clear one does not", async () => {
  const r = await render(`@startuml
participant A
participant B
participant C
A -> B ++ : call
C -> A : a rather long message label across B
A -> B : free
@enduml`);
  const els = r.excalidraw.elements;
  const crossed = els.find((e) => e.type === "text" && e.text.includes("across B"));
  const clear = els.find((e) => e.type === "text" && e.text === "call");
  assert.ok(
    plates(els).some((p) => covers(p, crossed)),
    "crossed label has no plate",
  );
  assert.ok(!plates(els).some((p) => covers(p, clear)), "uncrossed label got a plate");
});

test("a message into a destroyed participant stops at the rim of the cross", async () => {
  const r = await render(`@startuml
participant A
participant B
A -> B !! : dispose
@enduml`);
  const els = r.excalidraw.elements;
  const cross = els.filter((e) => e.type === "line" && e.strokeColor === "#c92a2a");
  assert.equal(cross.length, 2);
  const left = Math.min(...cross.map((l) => l.x));
  const arrow = els.find((e) => e.type === "arrow");
  const [ex] = arrow.points[arrow.points.length - 1];
  const tipX = arrow.x + ex;
  assert.ok(tipX <= left + 0.01, `arrow tip ${tipX} overlaps the cross starting at ${left}`);
  assert.ok(left - tipX < 4, "arrow stops too far from the cross");
});
