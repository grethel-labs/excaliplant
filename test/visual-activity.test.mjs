// Visual-quality contracts for activity diagrams that structural tests would miss.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, parse } from "../src/index.mjs";
import { layoutActivity } from "../src/diagrams/activity/layout.mjs";
import { segmentInBox, overlapArea } from "../src/layout/labels.mjs";
import { createTheme } from "../src/draw/theme.mjs";

const EXAMPLES = ["order-processing", "repeat-switch", "swimlanes"];

/** @param {string} src */
async function laidOut(src) {
  const { model } = parse(src);
  return layoutActivity(/** @type {any} */ (model), { theme: createTheme("sketch") });
}

/** @param {string} name */
const example = (name) =>
  readFileSync(new URL(`../examples/activity/${name}.puml`, import.meta.url), "utf8");

/** Headed edges: everything but joins into junctions and kills. @param {any} e */
const headed = (e) => e.to.kind !== "junction" && e.to.kind !== "kill" && !e.style?.hidden;

const JOGGING = `@startuml
|A|
start
:One;
|B|
:Two;
if (Check?) then (yes)
  |C|
  :Three;
else (no)
  |B|
  :Four;
endif
|A|
:Five;
stop
@enduml`;

const SOURCES = [...EXAMPLES.map((n) => [n, example(n)]), ["jogging lanes", JOGGING]];

for (const [name, src] of SOURCES) {
  test(`activity ${name}: every arrowhead keeps a final segment of at least 30px`, async () => {
    const laid = await laidOut(src);
    for (const e of laid.edges.filter(headed)) {
      const p = e.points;
      const last = Math.hypot(p.at(-1)[0] - p.at(-2)[0], p.at(-1)[1] - p.at(-2)[1]);
      assert.ok(
        last >= 29.5,
        `edge ${e.from.id}->${e.to.id} ends in a ${last.toFixed(1)}px segment (head would shrink)`,
      );
    }
  });

  test(`activity ${name}: edge labels touch no line, node or arrowhead`, async () => {
    const laid = await laidOut(src);
    const heads = laid.edges.filter(headed).map((e) => {
      const [a, b] = [e.points.at(-2), e.points.at(-1)];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      // Box around the 16px long, 16px wide head.
      const c = [b[0] - ux * 8, b[1] - uy * 8];
      return { x: c[0] - 8, y: c[1] - 8, w: 16, h: 16 };
    });
    for (const e of laid.edges.filter((x) => x.label)) {
      const box = /** @type {any} */ (e.labelBox);
      assert.ok(box, "label has a position");
      const inner = { x: box.x + 1, y: box.y + 1, w: box.w - 2, h: box.h - 2 };
      for (const other of laid.edges)
        for (let i = 1; i < other.points.length; i++)
          assert.equal(
            segmentInBox(other.points[i - 1], other.points[i], inner),
            0,
            `label "${e.label.text}" is crossed by an edge`,
          );
      for (const n of laid.nodes)
        assert.ok(
          overlapArea(inner, { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h }) < 1,
          `label "${e.label.text}" overlaps a node`,
        );
      for (const h of heads)
        assert.equal(overlapArea(inner, h), 0, `label "${e.label.text}" sits on an arrowhead`);
    }
  });
}

test("repeat-switch: the middle switch branch is a straight line in and out", async () => {
  const laid = await laidOut(example("repeat-switch"));
  const refund = laid.nodes.find((n) => n.text?.text === "Issue refund");
  assert.ok(refund);
  const into = laid.edges.find((e) => e.to === refund);
  const out = laid.edges.find((e) => e.from === refund);
  for (const e of [into, out]) {
    assert.ok(e);
    assert.equal(e.points.length, 2, "no jog");
    assert.ok(Math.abs(e.points[0][0] - e.points[1][0]) < 0.5, "vertical");
  }
});

test("swimlanes: the 'no' label sits beside its edge, not on it", async () => {
  const laid = await laidOut(example("swimlanes"));
  const e = laid.edges.find((x) => x.label?.text === "no");
  assert.ok(e && e.labelBox);
  const box = e.labelBox;
  for (let i = 1; i < e.points.length; i++)
    assert.equal(
      segmentInBox(e.points[i - 1], e.points[i], box),
      0,
      "own edge runs through the label",
    );
});

test("swimlanes: lane fills are drawn before the header rule and lane borders", async () => {
  const r = await render(example("swimlanes"));
  const els = r.excalidraw.elements;
  const fills = els
    .map((e, i) =>
      e.type === "rectangle" && e.backgroundColor !== "transparent" && e.height > 400 ? i : -1,
    )
    .filter((i) => i >= 0);
  assert.ok(fills.length >= 1, "a filled lane exists");
  const rules = els
    .map((e, i) => (e.type === "line" && (e.width > 400 || e.height > 400) ? i : -1))
    .filter((i) => i >= 0);
  assert.ok(rules.length >= 5, "lane borders and header rule exist");
  for (const f of fills)
    for (const rule of rules) assert.ok(rule > f, "a rule is covered by a lane fill");
});
