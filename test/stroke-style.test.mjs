import { test } from "node:test";
import assert from "node:assert/strict";
import { DiagramRegistry, defineDiagram, render } from "../src/index.mjs";
import { createMeta } from "../src/syntax/commons.mjs";

const GANTT = `@startgantt
Project starts 2026-01-05
[A] lasts 2 days
[B] lasts 3 days
[A] -> [B]
@endgantt`;
const SEQUENCE = "@startuml\nA -> B : message\n@enduml";

/** @param {string} svg @param {number} strokeWidth */
function svgPaths(svg, strokeWidth) {
  return [...svg.matchAll(/<path d="([^"]+)"([^>]*)>/g)]
    .filter(([, , attributes]) => attributes.includes(` stroke-width="${strokeWidth}"`))
    .map(([, path]) => path);
}

/** @param {string} path Path with absolute move, line and cubic Bézier commands. */
function vertices(path) {
  return [...path.matchAll(/[MLC]\s*([^MLC]+)/g)].map(([, values]) =>
    values
      .trim()
      .split(/[\s,]+/)
      .slice(-2)
      .map(Number),
  );
}

test("Gantt dependency strokes change without moving the route or arrowhead", async () => {
  const clean = await render(GANTT, { sketch: false });
  const sketch = await render(GANTT, { sketch: true });
  const cartoon = await render(GANTT, { roughness: 2, edgeRoughness: 2 });
  const arrow = (result) => result.excalidraw.elements.find((el) => el.type === "arrow");
  const a = arrow(cartoon);
  assert.equal(a.roughness, 2);
  assert.equal(a.endArrowhead, "triangle");
  assert.ok(a.points.length > 2);
  assert.deepEqual(arrow(clean), { ...a, roughness: 0 });
  assert.deepEqual(arrow(sketch), { ...a, roughness: 0.3 });
  assert.ok(cartoon.excalidraw.elements.some((el) => el.type === "line" && el.roughness === 0));

  const points = a.points.map(([x, y]) => [a.x + x, a.y + y]);
  const [straight] = svgPaths(await clean.toSvg({ embedFont: false }), a.strokeWidth);
  assert.match(straight, /L/);
  assert.deepEqual(vertices(straight), points);
  for (const renderResult of [sketch, cartoon]) {
    const [shaft, head] = svgPaths(await renderResult.toSvg({ embedFont: false }), a.strokeWidth);
    assert.match(shaft, /C/);
    assert.deepEqual(new Set(vertices(shaft).map(String)), new Set(points.map(String)));
    assert.deepEqual(vertices(head)[0], points.at(-1));
  }
});

test("curved SVG arrows keep the same waypoints in sketch mode", async () => {
  const route = [
    [0, 0],
    [30, 25],
    [85, 15],
  ];
  const curved = defineDiagram({
    kind: "curved",
    title: "Curved",
    starts: ["curved"],
    parse: () => ({ meta: createMeta() }),
    layout: (model) => model,
    draw: (_model, canvas) => {
      canvas.arrow(route, { curved: true });
    },
  });
  const registry = new DiagramRegistry([curved]);
  const src = "@startcurved\n@endcurved";
  const clean = await render(src, { registry, edgeRoughness: 0 });
  const rough = await render(src, { registry, edgeRoughness: 2 });
  const cleanArrow = clean.excalidraw.elements.find((el) => el.type === "arrow");
  const [cleanPath] = svgPaths(await clean.toSvg({ embedFont: false }), cleanArrow.strokeWidth);
  const [roughPath] = svgPaths(await rough.toSvg({ embedFont: false }), cleanArrow.strokeWidth);
  assert.notEqual(cleanPath, roughPath);
  assert.deepEqual(vertices(cleanPath), route);
  assert.deepEqual(new Set(vertices(roughPath).map(String)), new Set(route.map(String)));
});

test("stroke overrides independently resolve against theme and legacy sketch options", async () => {
  const cases = [
    [{ theme: "plain" }, 0, 0],
    [{ theme: "plain", sketch: true }, 1, 0.3],
    [{ sketch: false, edgeRoughness: 1.25 }, 0, 1.25],
    [{ sketch: true, roughness: 0.25, edgeRoughness: 0 }, 0.25, 0],
    [{ roughness: 3, edgeRoughness: NaN }, 1, 0.3],
    [{ roughness: Infinity, edgeRoughness: "1" }, 1, 0.3],
  ];
  for (const [options, shape, edge] of cases) {
    const { excalidraw } = await render(GANTT, options);
    const box = excalidraw.elements.find((el) => el.type === "rectangle" && el.roundness);
    const arrow = excalidraw.elements.find((el) => el.type === "arrow");
    assert.equal(box.roughness, shape);
    assert.equal(arrow.roughness, edge);
  }
});

test("other diagram connectors follow edge roughness", async () => {
  const cases = [
    [
      `@startchronology
[A] happens on 2026-01-05
[B] happens on 2026-01-08
[A] -> [B]
@endchronology`,
      (el) => el.type === "arrow" && el.strokeStyle === "dashed",
    ],
    [
      `@startuml
robust "Browser" as WB
@0
WB is Idle
@300
WB is Waiting
WB@0 <-> @300 : {300 ms}
@enduml`,
      (el) => el.type === "arrow" && el.startArrowhead === "arrow" && el.endArrowhead === "arrow",
    ],
    [SEQUENCE, (el) => el.type === "line" && el.strokeStyle === "dashed"],
    [
      "@startfiles\n/src/index.mjs : API\n@endfiles",
      (el) => el.type === "line" && (el.points.length === 2 || el.strokeStyle === "dotted"),
    ],
    ["@startregex\nab\n@endregex", (el) => el.type === "line" && el.height === 0],
    ["@startditaa\n+>\n@endditaa", (el) => el.type === "line" && el.points.length === 4],
  ];
  for (const [source, isConnector] of cases) {
    const clean = await render(source, { roughness: 2, edgeRoughness: 0 });
    const sketch = await render(source, { roughness: 0, edgeRoughness: 0.75 });
    const connectors = sketch.excalidraw.elements.filter(isConnector);
    assert.ok(connectors.length > 0, sketch.kind);
    assert.ok(
      connectors.every((el) => el.roughness === 0.75),
      sketch.kind,
    );
    assert.deepEqual(
      clean.excalidraw.elements.filter(isConnector),
      connectors.map((el) => ({ ...el, roughness: 0 })),
      sketch.kind,
    );
  }
});

test("small file icons and math marks also respect clean shapes", async () => {
  const sources = [
    "@startfiles\n/src/index.mjs\n@endfiles",
    String.raw`@startmath
\frac{1}{2} + \sqrt{x}
@endmath`,
  ];
  for (const source of sources) {
    const sketch = await render(source, { edgeRoughness: 0 });
    const clean = await render(source, { roughness: 0, edgeRoughness: 0 });
    assert.ok(
      sketch.excalidraw.elements.some((el) => el.roughness > 0),
      sketch.kind,
    );
    assert.ok(
      clean.excalidraw.elements.every((el) => el.roughness === 0),
      clean.kind,
    );
  }
});
