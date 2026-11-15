import { test } from "node:test";
import assert from "node:assert/strict";
import { Obstacles, alongPolyline, nearEnd, segmentInBox } from "../src/layout/labels.mjs";
import { render, parse } from "../src/index.mjs";

test("segmentInBox measures the clipped length", () => {
  assert.equal(segmentInBox([0, 5], [20, 5], { x: 5, y: 0, w: 10, h: 10 }), 10);
  assert.equal(segmentInBox([0, 50], [20, 50], { x: 5, y: 0, w: 10, h: 10 }), 0);
});

test("labels avoid lines and arrowheads", () => {
  const obstacles = new Obstacles();
  obstacles.addPolyline(
    [
      [100, 0],
      [100, 200],
    ],
    { owner: "other" },
  );
  const crossing = { x: 80, y: 90, w: 40, h: 20, penalty: 0 };
  const free = { x: 140, y: 90, w: 40, h: 20, penalty: 5 };
  assert.deepEqual(obstacles.place([crossing, free]), { ...free });
  const ends = nearEnd([0, 100], [0, 0], 10, 12);
  assert.ok(
    ends.every((b) => b.y + b.h <= 100 - 26 + 12),
    "end labels stay behind the head",
  );
  assert.ok(
    alongPolyline(
      [
        [0, 0],
        [0, 200],
      ],
      30,
      14,
    ).length > 4,
  );
});

test("multiplicities are not hidden under arrowheads", async () => {
  const r = await render('@startuml\nclass A\nclass B\nA "1" *-- "many" B\n@enduml');
  const els = r.excalidraw.elements;
  const arrow = els.find((e) => e.type === "arrow");
  const one = els.find((e) => e.type === "text" && e.text === "1");
  const start = [arrow.x + arrow.points[0][0], arrow.y + arrow.points[0][1]];
  // The diamond occupies ~20px along the line; the label must sit beside or beyond it.
  const overlapsHead =
    one.x < start[0] + 8 &&
    one.x + one.width > start[0] - 8 &&
    one.y < start[1] + 22 &&
    one.y + one.height > start[1];
  assert.ok(!overlapsHead, "label overlaps the diamond");
});

test("sequence autoactivate activates calls and closes them on replies", () => {
  const { model } = parse("@startuml\nautoactivate on\nA -> B : call\nB --> A : reply\n@enduml");
  const [call, reply] = model.events;
  assert.equal(call.lifecycle.target, "++");
  assert.equal(reply.lifecycle.source, "--");
});

test("ditaa arrowheads become real arrows touching the border", async () => {
  const r = await render("@startditaa\n+--+    +--+\n|  |--->|  |\n+--+    +--+\n@endditaa");
  const arrow = r.excalidraw.elements.find((e) => e.type === "arrow");
  assert.ok(arrow, "an arrow element is drawn");
  assert.equal(arrow.endArrowhead, "triangle");
  const rects = r.excalidraw.elements
    .filter((e) => e.type === "rectangle")
    .sort((a, b) => a.x - b.x);
  const tipX = arrow.x + arrow.points[arrow.points.length - 1][0];
  assert.ok(Math.abs(tipX - rects[1].x) < 1, `tip ${tipX} touches the box at ${rects[1].x}`);
});
