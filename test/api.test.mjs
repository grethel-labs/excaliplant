import { test } from "node:test";
import assert from "node:assert/strict";
import {
  render,
  renderAll,
  renderPlantUml,
  parse,
  listDiagramTypes,
  DiagramRegistry,
  defineDiagram,
  BUILTIN_DIAGRAMS,
  THEME_NAMES,
} from "../src/index.mjs";
import { createMeta } from "../src/syntax/commons.mjs";

const SEQ = "@startuml\ntitle Hi\nA -> B : x\n@enduml";

test("render returns a RenderResult with all outputs", async () => {
  const r = await render(SEQ);
  assert.equal(r.kind, "sequence");
  assert.equal(r.toJSON(), r.excalidraw);
  assert.match(await r.toSvg(), /<svg/);
  assert.ok((await r.toPng({ width: 200 })).length > 100);
});

test("renderPlantUml keeps the 0.x thenable API", async () => {
  const doc = await renderPlantUml(SEQ);
  assert.equal(doc.type, "excalidraw");
  assert.match(await renderPlantUml(SEQ).toSvg(), /<svg/);
});

test("renderAll renders every block and render selects by name or index", async () => {
  const src = "@startuml one\nA -> B\n@enduml\n@startmindmap two\n* root\n@endmindmap";
  const all = await renderAll(src);
  assert.deepEqual(
    all.map((r) => [r.kind, r.name]),
    [
      ["sequence", "one"],
      ["mindmap", "two"],
    ],
  );
  assert.equal((await render(src, { block: "two" })).kind, "mindmap");
  assert.equal((await render(src, { block: 1 })).kind, "mindmap");
  await assert.rejects(render(src, { block: "nope" }), /No diagram named/);
});

const CLASS_SHELF = `@startuml
class A
class B
class C
class D
class E
class F
@enduml`;

async function svgRatio(result) {
  const svg = await result.toSvg({ embedFont: false });
  const bounds = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  assert.ok(bounds, "SVG should have a viewBox");
  const [, width, height] = bounds;
  return Number(width) / Number(height);
}

const ratioError = (actual, target) => Math.abs(Math.log(actual) - Math.log(target));

test("an aspect ratio reflows disconnected graph components in SVG and PNG", async () => {
  const normal = await render(CLASS_SHELF);
  const normalRatio = await svgRatio(normal);
  const wide = await render(CLASS_SHELF, { aspectRatio: 16 / 9 });
  const tall = await render(CLASS_SHELF, { aspectRatio: 9 / 16 });
  assert.ok(ratioError(await svgRatio(wide), 16 / 9) < ratioError(normalRatio, 16 / 9));
  assert.ok(ratioError(await svgRatio(tall), 9 / 16) < ratioError(normalRatio, 9 / 16));
  const boxSizes = ({ excalidraw }) =>
    excalidraw.elements.filter((e) => e.type === "rectangle").map((e) => [e.width, e.height]);
  assert.deepEqual(boxSizes(wide), boxSizes(normal));
  assert.deepEqual(boxSizes(tall), boxSizes(normal));

  const png = await wide.toPng({ width: 320 });
  assert.equal(png.readUInt32BE(16), 320);
  assert.ok(png.readUInt32BE(20) < 320);

  const [first, second] = await renderAll(`${CLASS_SHELF}\n${CLASS_SHELF}`, {
    aspectRatio: 9 / 16,
  });
  assert.deepEqual(first.excalidraw, tall.excalidraw);
  assert.equal(await svgRatio(second), await svgRatio(tall));
  assert.deepEqual(await renderPlantUml(CLASS_SHELF, { aspectRatio: 16 / 9 }), wide.excalidraw);
  assert.deepEqual((await render(CLASS_SHELF)).excalidraw, normal.excalidraw);
});

test("a connected class graph can wrap while keeping its arrow bindings and labels", async () => {
  const names = Array.from({ length: 8 }, (_, index) => `C${index}`);
  const labels = names.slice(1).map((_, index) => `link ${index}`);
  const declarations = names.map((name) => `class ${name}`);
  const links = labels.map((label, index) => `${names[index]} --> ${names[index + 1]} : ${label}`);
  const source = [
    "@startuml",
    "top to bottom direction",
    ...declarations,
    ...links,
    "@enduml",
  ].join("\n");
  const aspectRatio = 16 / 9;
  const normal = await render(source);
  const wide = await render(source, { aspectRatio });
  assert.ok(
    ratioError(await svgRatio(wide), aspectRatio) < ratioError(await svgRatio(normal), aspectRatio),
  );
  assert.equal(wide.model.direction, "TB");
  const arrows = wide.excalidraw.elements.filter((e) => e.type === "arrow");
  assert.equal(arrows.length, links.length);
  for (const arrow of arrows) {
    assert.ok(arrow.startBinding?.elementId && arrow.endBinding?.elementId);
  }
  const texts = wide.excalidraw.elements.filter((e) => e.type === "text").map((e) => e.text);
  for (const label of labels) assert.ok(texts.includes(label), label);
  assert.deepEqual(
    (await render(source, { aspectRatio, layoutCache: false })).excalidraw,
    wide.excalidraw,
  );
  assert.deepEqual((await render(source)).excalidraw, normal.excalidraw);
});

test("aspectRatio requires a positive finite number and leaves rigid layouts usable", async () => {
  for (const aspectRatio of [0, -1, NaN, Infinity, "16:9", null]) {
    await assert.rejects(render(SEQ, { aspectRatio }), RangeError);
  }
  const normal = await render(SEQ);
  assert.deepEqual((await render(SEQ, { aspectRatio: 1 })).excalidraw, normal.excalidraw);
  for (const aspectRatio of [Number.MIN_VALUE, Number.MAX_VALUE]) {
    const actual = await svgRatio(await render(CLASS_SHELF, { aspectRatio }));
    assert.ok(Number.isFinite(actual) && actual > 0);
  }
});

test("newpage documents expose pages", async () => {
  const src = "@startuml\nA -> B\nnewpage\nB -> C\n@enduml";
  const first = await render(src);
  const second = await render(src, { page: 1 });
  assert.equal(first.pages, 2);
  const texts = (/** @type {any} */ r) =>
    r.excalidraw.elements.filter((e) => e.type === "text").map((e) => e.text);
  assert.ok(texts(second).includes("C"));
  assert.ok(!texts(first).includes("C"));
});

test("strict mode rejects unknown lines; default mode warns", async () => {
  const src = "@startuml\nclass A\nthis is not plantuml at all\n@enduml";
  const r = await render(src);
  assert.equal(r.diagnostics.length, 1);
  assert.equal(r.diagnostics[0].line, 3);
  await assert.rejects(render(src, { strict: true }), /Unrecognised syntax/);
});

test("themes and clean mode change the output", async () => {
  for (const theme of THEME_NAMES) {
    const r = await render(SEQ, { theme });
    assert.ok(r.excalidraw.elements.length > 0, theme);
  }
  const dark = await render(SEQ, { theme: "dark" });
  assert.equal(dark.excalidraw.appState.viewBackgroundColor, "#121212");
  const clean = await render(SEQ, { sketch: false });
  assert.ok(clean.excalidraw.elements.every((e) => e.roughness === 0));
  const viaPlantUml = await render("@startuml\n!theme cyborg\nA -> B\n@enduml");
  assert.equal(viaPlantUml.excalidraw.appState.viewBackgroundColor, "#121212");
});

test("skinparam and <style> override theme colours", async () => {
  const r = await render(
    "@startuml\nskinparam classBackgroundColor #ff0000\n<style>\nnote { BackgroundColor #00ff00 }\n</style>\nclass A\nnote right of A : n\n@enduml",
  );
  const fills = r.excalidraw.elements.map((e) => e.backgroundColor);
  assert.ok(fills.includes("#ff0000"));
  assert.ok(fills.includes("#00ff00"));
});

test("title, header, footer, caption, legend and mainframe render", async () => {
  const r = await render(
    "@startuml\ntitle T1\nheader H1\nfooter F1\ncaption C1\nlegend\nL1\nendlegend\nmainframe M1\nA -> B\n@enduml",
  );
  const texts = r.excalidraw.elements.filter((e) => e.type === "text").map((e) => e.text);
  for (const t of ["T1", "H1", "F1", "C1", "L1", "M1"]) assert.ok(texts.includes(t), t);
});

test("parse returns the model without layout", () => {
  const { kind, model } = parse("@startuml\nclass A\nA --> B\n@enduml");
  assert.equal(kind, "class");
  assert.equal(model.edges.length, 1);
});

test("simple state text is measured during layout only", async () => {
  const source = "@startuml\nstate Ready : can run\n[*] --> Ready\n@enduml";
  const parsed = parse(source).model.nodes.get("Ready");
  assert.equal(parsed.description, "can run");
  assert.equal(parsed.data.stateText, undefined);
  const { model } = await render(source);
  const { stateText } = model.nodes.get("Ready").data;
  assert.ok(stateText.name.width > 0);
  assert.ok(stateText.desc.width > 0);
});

test("custom diagram modules can be registered", async () => {
  const hello = defineDiagram({
    kind: "hello",
    title: "Hello",
    starts: ["hello"],
    parse: (lines) => ({ meta: createMeta(), text: lines.map((l) => l.text).join(" ") }),
    layout: (m) => m,
    draw(m, canvas) {
      const target = canvas.text(m.text, 0, 0);
      const hook = {
        name: "greeting",
        id: "greeting",
        selector: "element",
        target,
        line: 1,
        classes: [],
        hover: {},
        click: {},
      };
      assert.equal(canvas.applyHook(hook), null);
      assert.match(canvas.applyHook(hook), /overlaps another hook/);
    },
  });
  const registry = new DiagramRegistry([...BUILTIN_DIAGRAMS, hello]);
  const r = await render("@starthello\nhi there\n@endhello", { registry });
  assert.equal(r.kind, "hello");
  assert.equal(r.excalidraw.elements[0].customData.excaliplantHook.id, "greeting");
  assert.ok(listDiagramTypes(registry).some((t) => t.kind === "hello"));
  assert.throws(() => defineDiagram(/** @type {any} */ ({ kind: "Bad Kind" })), TypeError);
});
