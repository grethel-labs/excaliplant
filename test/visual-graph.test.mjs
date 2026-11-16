// Visual-quality contracts for graph diagrams: arrowheads, titles, labels.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, parse } from "../src/index.mjs";
import { layoutGraph } from "../src/diagrams/graph/layout.mjs";
import { normalizeRoute, tabWidth } from "../src/diagrams/graph/route.mjs";
import { segmentInBox } from "../src/layout/labels.mjs";
import { createTheme } from "../src/draw/theme.mjs";

const example = (name) =>
  readFileSync(new URL(`../examples/${name}.puml`, import.meta.url), "utf8");

async function laidOut(src) {
  const { model } = parse(src);
  await layoutGraph(model, createTheme("sketch"));
  return model;
}

const pointsOf = (arrow) => arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y]);

test("arrowheads keep room: the last segment of a headed edge is at least 24 px", async () => {
  for (const name of [
    "class/relations",
    "class/shop-domain",
    "dot/pipeline",
    "deployment/kubernetes",
    "component/web-platform",
    "state/order-lifecycle",
  ]) {
    const r = await render(example(name));
    for (const a of r.excalidraw.elements.filter((e) => e.type === "arrow")) {
      const pts = pointsOf(a);
      for (const [head, p, q] of [
        [a.endArrowhead, pts[pts.length - 2], pts[pts.length - 1]],
        [a.startArrowhead, pts[1], pts[0]],
      ]) {
        if (!head) continue;
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        assert.ok(len >= 24, `${name}: head on a ${len.toFixed(0)} px segment`);
      }
    }
  }
});

test("edges inside containers get the same layer spacing as top-level edges", async () => {
  const model = await laidOut(`@startuml
package P {
  class A
  class B
}
A --> B
@enduml`);
  const a = model.nodes.get("A");
  const b = model.nodes.get("B");
  assert.ok(b.y - (a.y + a.height) >= 60, "layers inside a package are packed too tightly");
});

test("no edge runs through a package tab", async () => {
  const model = await laidOut(example("class/relations"));
  const pkg = model.nodes.get("shapes");
  const box = { x: pkg.x, y: pkg.y, w: tabWidth(pkg), h: pkg.headerHeight };
  for (const e of model.edges) {
    for (let i = 1; i < e.points.length; i++) {
      assert.equal(
        segmentInBox(e.points[i - 1], e.points[i], box),
        0,
        `${e.from} -> ${e.to} crosses the tab`,
      );
    }
  }
});

test("a container title is placed beside, not on, the edge entering the container", async () => {
  const model = await laidOut(example("component/c4-container"));
  const sys = model.nodes.get("bank");
  const t = sys.data.titleBox;
  const box = { x: sys.x + t.dx, y: sys.y + t.dy, w: t.w, h: t.h };
  for (const e of model.edges) {
    if (e.to === sys.id || e.from === sys.id) continue;
    for (let i = 1; i < e.points.length; i++)
      assert.equal(segmentInBox(e.points[i - 1], e.points[i], box), 0, `${e.from} -> ${e.to}`);
  }
});

test("package and folder tabs are exactly as wide as their title needs", async () => {
  const model = await laidOut(`@startuml
package "A fairly long package title" {
}
folder f {
}
@enduml`);
  for (const n of model.nodes.values()) {
    if (!n.container) continue;
    const textW = Math.max(...n.data.geo.blocks.map((b) => b.width));
    const tab = tabWidth(n);
    assert.ok(tab >= textW + 16, `${n.id}: tab ${tab} narrower than its title ${textW}`);
    assert.ok(tab <= textW + 40, `${n.id}: tab ${tab} much wider than its title ${textW}`);
  }
});

test("a multiplicity at a plain line end sits next to that end, not on a frame line", async () => {
  const r = await render(example("class/shop-domain"));
  const els = r.excalidraw.elements;
  const star = els.find((e) => e.type === "text" && e.text === "*");
  const frame = els.find(
    (e) =>
      e.type === "rectangle" && e.width > 300 && e.height > 300 && e.strokeColor !== "transparent",
  );
  assert.ok(star && frame);
  const onTop = star.y < frame.y + 3 && star.y + star.height > frame.y - 3;
  assert.ok(!onTop, "the * label sits on the package outline");
  const edge = els.find((e) => {
    if (e.type !== "arrow") return false;
    const p = pointsOf(e);
    return (
      Math.hypot(p[p.length - 1][0] - (star.x + star.width / 2), p[p.length - 1][1] - star.y) < 40
    );
  });
  assert.ok(edge, "the * label is far from every line end");
});

test("two edges ending at the same icon do not stack their arrowheads", async () => {
  const model = await laidOut(example("component/web-platform"));
  const ends = model.edges.filter((e) => e.to === "rest").map((e) => e.points[e.points.length - 1]);
  assert.equal(ends.length, 2);
  assert.ok(Math.abs(ends[0][0] - ends[1][0]) >= 18, "arrowheads end within 18 px of each other");
});

test("route normalisation merges collinear points and snaps tiny jogs", () => {
  assert.deepEqual(
    normalizeRoute([
      [58, 513],
      [58, 545],
      [57, 545],
      [57, 577],
      [57, 875],
    ]),
    [
      [58, 513],
      [58, 875],
    ],
  );
});

test("connectors of JSON/YAML tables are straight when the target is level with its row", async () => {
  const r = await render(`@startjson
{ "a": { "b": 1 } }
@endjson`);
  const arrow = r.excalidraw.elements.find((e) => e.type === "arrow");
  const ys = pointsOf(arrow).map((p) => Math.round(p[1]));
  assert.equal(new Set(ys).size, 1, `connector jogs: ${ys.join(",")}`);
});
