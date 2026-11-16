// Visual-quality contracts that structural tests would miss.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render, parse } from "../src/index.mjs";
import { layoutGraph } from "../src/diagrams/graph/layout.mjs";
import { createTheme } from "../src/draw/theme.mjs";

test("branches leave a choice diamond sideways or downwards, never from the top", async () => {
  const src = `@startuml
[*] --> A
A --> B
state c <<choice>>
B --> c
c --> D : [ok]
c --> A : [retry]
@enduml`;
  const { model } = parse(src);
  await layoutGraph(model, createTheme("sketch"));
  const choice = [...model.nodes.values()].find((n) => n.data.pseudo === "choice");
  for (const e of model.edges.filter((x) => x.from === choice.id)) {
    const [x, y] = e.points[0];
    assert.ok(
      y > choice.y + 1,
      `edge ${e.label} starts at the top (y=${y}, top=${choice.y}, x=${x})`,
    );
  }
});

test("Gantt dependency arrows never cross other task bars", async () => {
  const src = `@startgantt
[A] lasts 4 days
[B] lasts 10 days
[C] lasts 3 days
[B] starts at [A]'s start
[A] -> [C]
@endgantt`;
  const r = await render(src);
  const els = r.excalidraw.elements;
  const bars = els.filter((e) => e.type === "rectangle" && e.roundness);
  const arrow = els.find((e) => e.type === "arrow");
  const pts = arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y]);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (a[0] !== b[0]) continue;
    for (const bar of bars) {
      const crosses =
        a[0] > bar.x + 1 &&
        a[0] < bar.x + bar.width - 1 &&
        Math.min(a[1], b[1]) < bar.y &&
        Math.max(a[1], b[1]) > bar.y + bar.height;
      assert.ok(!crosses, "vertical leg crosses a bar");
    }
  }
});

test("title plates of unfilled containers take the fill of the container around them", async () => {
  const src = `@startuml
node "Cluster" #e7fdf6 {
  node ingress
  frame "shop namespace" {
    component web
  }
}
ingress --> web
@enduml`;
  const r = await render(src);
  const els = r.excalidraw.elements;
  const title = els.find((e) => e.type === "text" && e.text.includes("shop namespace"));
  const plate = els.find(
    (e) =>
      e.type === "rectangle" &&
      e.strokeColor === "transparent" &&
      e.x <= title.x &&
      e.x + e.width >= title.x + title.width &&
      e.y <= title.y &&
      e.y + e.height >= title.y + title.height,
  );
  // The connector runs behind the title, so there is a plate — never a white patch.
  assert.ok(plate, "no plate behind the crossed title");
  assert.equal(plate.backgroundColor, "#e7fdf6");
});
