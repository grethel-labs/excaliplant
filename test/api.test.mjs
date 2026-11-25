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
    draw: (m, canvas) => void canvas.text(m.text, 0, 0),
  });
  const registry = new DiagramRegistry([...BUILTIN_DIAGRAMS, hello]);
  const r = await render("@starthello\nhi there\n@endhello", { registry });
  assert.equal(r.kind, "hello");
  assert.ok(listDiagramTypes(registry).some((t) => t.kind === "hello"));
  assert.throws(() => defineDiagram(/** @type {any} */ ({ kind: "Bad Kind" })), TypeError);
});
