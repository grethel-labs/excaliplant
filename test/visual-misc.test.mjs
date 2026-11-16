// Visual-quality contracts for salt, creole, chart and gantt that structural tests would miss.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/index.mjs";

/** @param {any} arrow */
const absPoints = (arrow) => arrow.points.map(([x, y]) => [arrow.x + x, arrow.y + y]);

test("salt group boxes are at least as wide as their title and only mildly rounded", async () => {
  const src = `@startsalt
{
  {^"A rather long group title"
    {T
      + a
      + b
    }
  }
}
@endsalt`;
  const { excalidraw } = await render(src);
  const els = excalidraw.elements;
  const title = els.find((e) => e.type === "text" && e.text.includes("A rather long group title"));
  assert.ok(title, "title text exists");
  // The innermost frame around the caption (the plate behind it has no stroke).
  const frame = els
    .filter(
      (e) =>
        e.type === "rectangle" &&
        e.strokeColor !== "transparent" &&
        e.x <= title.x &&
        e.y <= title.y + title.height &&
        e.y + e.height > title.y + title.height,
    )
    .sort((a, b) => a.width - b.width)[0];
  assert.ok(frame, "group frame exists");
  assert.ok(
    frame.x + frame.width >= title.x + title.width + 4,
    `title overflows the frame (frame right ${frame.x + frame.width}, title right ${title.x + title.width})`,
  );
  assert.equal(frame.roundness, null, "group frame must not use the pill-shaped corner radius");
});

test("creole tables are separated from the blocks above and below", async () => {
  const gap = async (/** @type {string} */ body) => {
    const { excalidraw } = await render(`@startcreole\n${body}\n@endcreole`);
    const y = (/** @type {string} */ t) =>
      excalidraw.elements.find((e) => e.type === "text" && e.text.includes(t)).y;
    return { above: y("Cell") - y("item"), below: y("after") - y("Cell") };
  };
  const tight = await gap("* item\n|= H |\n| Cell |\nafter");
  const spaced = await gap("* item\n\n|= H |\n| Cell |\n\nafter");
  assert.ok(Math.abs(tight.above - spaced.above) < 1, "gap above the table matches a blank line");
  assert.ok(Math.abs(tight.below - spaced.below) < 1, "gap below the table matches a blank line");
  const plain = await gap("* item\nplain\nCell\nafter");
  assert.ok(tight.above > plain.above + 10, "table is pushed away from the list");
});

test("chart legend shows line series as a stroke with a marker, not as a square", async () => {
  const src = `@startchart
h-axis [A, B]
v-axis 0 --> 10
bar "Bars" [3, 5]
line "Trend" [2, 6]
@endchart`;
  const { excalidraw } = await render(src);
  const els = excalidraw.elements;
  const label = (/** @type {string} */ t) => els.find((e) => e.type === "text" && e.text === t);
  const bars = label("Bars");
  const trend = label("Trend");
  assert.ok(bars && trend);
  const near = (/** @type {any} */ t, /** @type {any} */ e) =>
    e.x + e.width <= t.x + 1 &&
    e.x + e.width >= t.x - 40 &&
    e.y + e.height / 2 > t.y &&
    e.y + e.height / 2 < t.y + t.height + 4;
  const swatches = (/** @type {any} */ t) => els.filter((e) => e.type !== "text" && near(t, e));
  assert.ok(
    swatches(bars).some((e) => e.type === "rectangle"),
    "bar series keeps a square swatch",
  );
  const lineSwatch = swatches(trend);
  assert.ok(!lineSwatch.some((e) => e.type === "rectangle"), "line series has no square swatch");
  const stroke = lineSwatch.find((e) => e.type === "line");
  assert.ok(stroke && stroke.width >= 14 && stroke.height < 1, "short horizontal stroke");
  assert.ok(
    lineSwatch.some((e) => e.type === "ellipse"),
    "point marker on the stroke",
  );
});

test("Gantt dependency to a bar that starts where its neighbour starts stays local", async () => {
  const src = `@startgantt
Project starts 2026-03-02
[Req] lasts 4 days
[UI] lasts 5 days and starts at [Req]'s end
[BE] lasts 8 days and starts at [Req]'s end
[Req] -> [BE]
@endgantt`;
  const { excalidraw } = await render(src);
  const els = excalidraw.elements;
  const bars = els.filter((e) => e.type === "rectangle" && e.roundness);
  assert.equal(bars.length, 3);
  const [req, ui, be] = bars.sort((a, b) => a.y - b.y);
  const arrows = els.filter((e) => e.type === "arrow");
  const toBe = arrows.find((a) => {
    const p = absPoints(a);
    return Math.abs(p[p.length - 1][1] - (be.y + be.height / 2)) < 1;
  });
  assert.ok(toBe, "arrow into the third bar exists");
  const pts = absPoints(toBe);
  const maxX = Math.max(...pts.map((p) => p[0]));
  assert.ok(maxX <= req.x + req.width + 12, `arrow detours to x=${maxX} beyond ${ui.x + ui.width}`);
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if (a[0] !== b[0]) continue;
    assert.ok(
      !(
        a[0] > ui.x - 1 &&
        a[0] < ui.x + ui.width + 1 &&
        Math.min(a[1], b[1]) < ui.y + ui.height &&
        Math.max(a[1], b[1]) > ui.y
      ),
      "vertical leg crosses the UI bar",
    );
  }
});
