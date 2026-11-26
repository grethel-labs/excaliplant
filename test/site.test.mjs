// The playground's page logic: share-link state, options → render() mapping,
// routing, example index, syntax tokens, the worker protocol and the worker
// client. Everything here runs in plain Node (no DOM).

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { listDiagramTypes, render, THEME_NAMES } from "../src/index.mjs";
import { loadExamples } from "../scripts/showcase.mjs";
import {
  DEFAULT_OPTIONS,
  KIND_CHOICES,
  MAX_PNG_PIXELS,
  MAX_SOURCE_BYTES,
  THEME_CHOICES,
  diffOptions,
  normalizeOptions,
  parseDefines,
  pngSize,
  toRenderOptions,
} from "../site/playground/options.mjs";
import {
  MAX_DECODE_CHARS,
  MAX_HASH_CHARS,
  STORAGE_KEY,
  decodePlainSource,
  decodeState,
  encodeState,
  fromBase64Url,
  loadSaved,
  save,
  toBase64Url,
} from "../site/playground/state.mjs";
import { buildExampleIndex, filterExamples, findExample } from "../site/playground/examples.mjs";
import { parseRoute } from "../site/router.mjs";
import { tokenize } from "../site/playground/highlight.mjs";
import { createEngine, cleanRenderOptions } from "../site/playground/protocol.mjs";
import { createEngineClient } from "../site/playground/engine.mjs";

const SOURCE = "@startuml\nAlice -> Bob : héllo ✓\n@enduml";

// --- options ---------------------------------------------------------------

test("option choices match the library", () => {
  assert.deepEqual([...THEME_CHOICES], [...THEME_NAMES]);
  assert.deepEqual(
    [...KIND_CHOICES].sort(),
    listDiagramTypes()
      .map((t) => t.kind)
      .sort(),
  );
});

test("normalizeOptions repairs anything", () => {
  assert.deepEqual(normalizeOptions(undefined), DEFAULT_OPTIONS);
  assert.deepEqual(normalizeOptions("nope"), DEFAULT_OPTIONS);
  const o = normalizeOptions({
    theme: "evil",
    kind: "nope",
    page: -5,
    block: 1e9,
    backgroundColor: "red",
    background: "weird",
    date: "2020-13-45",
    pngWidth: 5,
    pngScale: 99,
    seed: 42,
    clean: "yes",
    strokePreset: "constructor",
    roughness: "0.5",
    edgeRoughness: 2.1,
    bogus: 1,
  });
  assert.equal(o.theme, "auto");
  assert.equal(o.kind, "");
  assert.equal(o.page, 0);
  assert.equal(o.block, 99);
  assert.equal(o.backgroundColor, "#ffffff");
  assert.equal(o.background, "default");
  assert.equal(o.date, "");
  assert.equal(o.pngWidth, 16);
  assert.equal(o.pngScale, 8);
  assert.equal(o.seed, "");
  assert.equal(o.strokePreset, "theme");
  assert.equal(o.roughness, null);
  assert.equal(o.edgeRoughness, null);
  assert.ok(!("bogus" in o));
});

test("diffOptions keeps only non-defaults", () => {
  assert.deepEqual(diffOptions(normalizeOptions({})), {});
  assert.deepEqual(diffOptions(normalizeOptions({ theme: "mono", strict: true })), {
    theme: "mono",
    strict: true,
  });
});

test("parseDefines mirrors the CLI and rejects bad names", () => {
  const { defines, errors } = parseDefines(
    "ENV=prod\n  A = b = c \n\n' comment\nFLAG\n9bad=1\n__proto__=x\nconstructor=y",
  );
  assert.equal(defines.ENV, "prod");
  assert.equal(defines.A, "b = c");
  assert.equal(defines.FLAG, "");
  assert.deepEqual(
    errors.map((e) => e.line),
    [6, 7, 8],
  );
  assert.equal(Object.getPrototypeOf(defines), null);
});

test("toRenderOptions maps the UI state onto render()", async () => {
  const none = toRenderOptions(normalizeOptions({}));
  assert.deepEqual(none, { render: {}, svg: {} });
  // `auto` follows the page: library default on light, dark on dark.
  assert.equal(toRenderOptions(normalizeOptions({}), { pageDark: true }).render.theme, "dark");
  assert.equal(
    toRenderOptions(normalizeOptions({ theme: "mono" }), { pageDark: true }).render.theme,
    "mono",
  );

  const o = normalizeOptions({
    theme: "blueprint",
    strokePreset: "artist",
    seed: "s1",
    strict: true,
    page: 1,
    block: 1,
    kind: "sequence",
    defines: "X=hello",
    filename: "a.puml",
    date: "2024-02-29",
    background: "custom",
    backgroundColor: "#112233",
  });
  const { render: ro, svg } = toRenderOptions(o);
  assert.equal(ro.theme, "blueprint");
  assert.equal(ro.roughness, 1);
  assert.equal(ro.edgeRoughness, 1);
  assert.equal(ro.seed, "s1");
  assert.equal(ro.strict, true);
  assert.equal(ro.page, 1);
  assert.equal(ro.block, 1);
  assert.equal(ro.kind, "sequence");
  assert.equal(ro.defines.X, "hello");
  assert.equal(ro.filename, "a.puml");
  assert.equal(ro.date.toISOString(), "2024-02-29T00:00:00.000Z");
  assert.deepEqual(svg, { background: "#112233" });
  assert.deepEqual(toRenderOptions(normalizeOptions({ background: "transparent" })).svg, {
    background: "transparent",
  });

  // The mapped options are accepted by the real render().
  const doc = "@startuml\nA -> B : $X\nnewpage\nB -> A : two\n@enduml\n@startuml\nC -> D\n@enduml";
  const first = await render(doc, {
    ...cleanRenderOptions({ ...ro, block: 0, page: 1, strict: false }),
  });
  assert.ok(first.excalidraw.elements.length > 0);
  assert.equal(first.pages, 2);
  const second = await render(doc, cleanRenderOptions({ block: 1 }));
  assert.equal(second.kind, "sequence");
});

test("stroke presets set both values and advanced options can override either one", () => {
  for (const [strokePreset, level] of [
    ["architect", 0],
    ["artist", 1],
    ["cartoonist", 2],
  ]) {
    assert.deepEqual(toRenderOptions(normalizeOptions({ strokePreset })).render, {
      roughness: level,
      edgeRoughness: level,
    });
  }
  assert.deepEqual(
    toRenderOptions(normalizeOptions({ strokePreset: "cartoonist", roughness: 0 })).render,
    { roughness: 0, edgeRoughness: 2 },
  );
  assert.deepEqual(toRenderOptions(normalizeOptions({ edgeRoughness: 0.35 })).render, {
    edgeRoughness: 0.35,
  });
});

test("PNG size: width wins over scale and stays within canvas limits", () => {
  assert.deepEqual(pngSize({ width: 400, height: 200 }, { pngWidth: null, pngScale: 2 }), {
    width: 800,
    height: 400,
    reduced: false,
  });
  assert.equal(pngSize({ width: 400, height: 200 }, { pngWidth: 1000, pngScale: 2 }).height, 500);
  const huge = pngSize({ width: 1000, height: 20000 }, { pngWidth: 16000, pngScale: 2 });
  assert.ok(huge.reduced);
  assert.ok(huge.width * huge.height <= MAX_PNG_PIXELS);
  assert.equal(pngSize({ width: 100, height: 100 }, { pngWidth: 1, pngScale: 2 }).width, 16);
});

// --- share links ---------------------------------------------------------------

test("base64url round trips arbitrary bytes", () => {
  const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 256);
  assert.deepEqual(fromBase64Url(toBase64Url(bytes)), bytes);
  assert.ok(!/[+/=]/.test(toBase64Url(bytes)));
  assert.throws(() => fromBase64Url("a+b"));
});

test("hash state round trips text and options, compressed and plain", async () => {
  const options = normalizeOptions({
    theme: "dark",
    strokePreset: "cartoonist",
    roughness: 1.25,
    edgeRoughness: 0,
    seed: "x",
    defines: "A=1",
    strict: true,
  });
  for (const compress of [true, false]) {
    const enc = await encodeState({ source: SOURCE, options }, { compress });
    assert.ok(enc.ok);
    assert.equal(enc.payload[0], compress ? "z" : "r");
    assert.ok(/^[zr][A-Za-z0-9_-]+$/.test(enc.payload));
    const dec = await decodeState(enc.payload);
    assert.deepEqual(dec, { source: SOURCE, options });
  }
  // Edge cases: empty text and non-BMP characters.
  for (const source of ["", "😀 \u0000 \r\n tab\t"]) {
    const enc = await encodeState({ source, options: normalizeOptions({}) });
    assert.ok(enc.ok);
    assert.equal((await decodeState(enc.payload))?.source, source);
  }
});

test("legacy share links and saved options migrate clean strokes to Architect", async () => {
  const json = JSON.stringify({ v: 1, s: SOURCE, o: { clean: true } });
  const expected = { source: SOURCE, options: { ...DEFAULT_OPTIONS, strokePreset: "architect" } };
  assert.deepEqual(await decodeState(`r${toBase64Url(new TextEncoder().encode(json))}`), expected);
  assert.deepEqual(loadSaved({ getItem: () => json }), expected);
  assert.equal(normalizeOptions({ clean: true, strokePreset: "theme" }).strokePreset, "theme");
  assert.equal(normalizeOptions({ clean: false }).strokePreset, "theme");
});

test("hash state refuses oversized, corrupt and hostile payloads", async () => {
  const opts = normalizeOptions({});
  // Source too big for the editor.
  const big = "x".repeat(MAX_SOURCE_BYTES + 1);
  const tooBig = await encodeState({ source: big, options: opts });
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.reason, "too-large");
  // Fits the editor but not a link (incompressible text).
  const noise = Buffer.from(randomBytes(30_000)).toString("base64");
  const long = await encodeState({ source: noise, options: opts });
  assert.equal(long.ok, false);
  assert.equal(long.reason, "too-long");
  assert.ok(MAX_HASH_CHARS < MAX_DECODE_CHARS);

  for (const bad of [
    "",
    "z",
    "x123",
    "zAAAA",
    "z!!!!",
    "r",
    "rnot json at all",
    `r${toBase64Url(new TextEncoder().encode('{"v":2,"s":"x"}'))}`,
    `r${toBase64Url(new TextEncoder().encode('{"v":1,"s":5}'))}`,
    `r${toBase64Url(new TextEncoder().encode("[1,2,3]"))}`,
    "z" + "A".repeat(MAX_DECODE_CHARS),
    undefined,
    null,
    42,
  ]) {
    assert.equal(await decodeState(/** @type {any} */ (bad)), null, String(bad).slice(0, 20));
  }
  // A small payload that inflates far beyond the limit is cut off.
  const bomb = new Blob([new Uint8Array(5_000_000)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(bomb).arrayBuffer());
  assert.ok(bytes.length < MAX_DECODE_CHARS * 0.75);
  assert.equal(await decodeState(`z${toBase64Url(bytes)}`), null);
  // Hostile option values are normalised, not trusted.
  const hostile = `r${toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, s: "a", o: { theme: "<script>", page: "x" } })))}`;
  const dec = await decodeState(hostile);
  assert.equal(dec?.options.theme, "auto");
  assert.equal(dec?.options.page, 0);
});

test("localStorage helpers never throw and tolerate damage", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const options = normalizeOptions({ theme: "mono" });
  assert.equal(save(storage, { source: SOURCE, options }), true);
  assert.deepEqual(loadSaved(storage), { source: SOURCE, options });
  mem.set(STORAGE_KEY, "{broken");
  assert.equal(loadSaved(storage), null);
  assert.equal(loadSaved(null), null);
  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("quota");
    },
  };
  assert.equal(loadSaved(throwing), null);
  assert.equal(save(throwing, { source: SOURCE, options }), false);
  assert.equal(save(null, { source: SOURCE, options }), false);
});

// --- plain-text links (#src=) -------------------------------------------------

test("#src= decodes plain percent-encoded PlantUML text, the form a model can write by hand", () => {
  const text = "@startuml\nA -> B : 50% + more\nnote right: ü ✓ #1\n@enduml";
  const state = decodePlainSource(encodeURIComponent(text));
  assert.equal(state?.source, text);
  assert.deepEqual(state?.options, normalizeOptions(undefined), "options stay at their defaults");
  // The link the skill tells a model to write.
  const hand = "%40startuml%0AAlice%20-%3E%20Bob%20%3A%20hi%0A%40enduml";
  assert.equal(decodePlainSource(hand)?.source, "@startuml\nAlice -> Bob : hi\n@enduml");
});

test("#src= refuses empty, malformed, oversized and hostile values", () => {
  for (const bad of [
    "",
    "%",
    "%E0%A4%A", // truncated UTF-8 escape
    "%ZZ",
    "a%00b", // NUL
    "x".repeat(MAX_DECODE_CHARS + 1),
    null,
    undefined,
    42,
  ]) {
    assert.equal(decodePlainSource(/** @type {any} */ (bad)), null, String(bad).slice(0, 20));
  }
});

test("a #src= link renders: the decoded text goes through the normal render path", async () => {
  const state = decodePlainSource("%40startuml%0AAlice%20-%3E%20Bob%20%3A%20hi%0A%40enduml");
  assert.ok(state);
  const result = await render(state.source, toRenderOptions(state.options));
  assert.ok(result.excalidraw.elements.length > 0);
});

// --- routing and examples -----------------------------------------------------

test("routes: the playground is the default, old gallery links still work", () => {
  assert.deepEqual(parseRoute(""), { view: "play" });
  assert.deepEqual(parseRoute("#"), { view: "play" });
  assert.deepEqual(parseRoute("#play"), { view: "play" });
  assert.deepEqual(parseRoute("#p=zabc"), { view: "play", payload: "zabc" });
  assert.deepEqual(parseRoute("#src=%40startuml%0AA%20-%3E%20B%0A%40enduml"), {
    view: "play",
    plainSource: "%40startuml%0AA%20-%3E%20B%0A%40enduml",
  });
  assert.deepEqual(parseRoute("#src="), { view: "play", plainSource: "" });
  assert.deepEqual(parseRoute("#play/class/shop-domain"), {
    view: "play",
    example: "class/shop-domain",
  });
  assert.deepEqual(parseRoute("#gallery"), { view: "gallery" });
  assert.deepEqual(parseRoute("#gallery/state/order-lifecycle"), {
    view: "gallery",
    example: "state/order-lifecycle",
  });
  assert.deepEqual(parseRoute("#gallery/state"), { view: "gallery", kind: "state" });
  assert.deepEqual(parseRoute("#sequence/checkout-flow"), {
    view: "gallery",
    example: "sequence/checkout-flow",
  });
  assert.deepEqual(parseRoute("#sequence"), { view: "gallery", kind: "sequence" });
  assert.deepEqual(parseRoute("#%E0%A4%A"), { view: "play" });
  assert.deepEqual(parseRoute("#whatever"), { view: "play" });
});

test("example index groups every example under its type", () => {
  const examples = loadExamples();
  const index = buildExampleIndex(examples);
  assert.equal(
    index.reduce((n, g) => n + g.items.length, 0),
    examples.length,
  );
  assert.equal(index[0].kind, "sequence", "display order is kept");
  const hit = findExample(index, "sequence/checkout-flow");
  assert.ok(hit);
  assert.match(hit.item.source, /^@startuml/);
  assert.equal(findExample(index, "nope/none"), null);
  for (const g of index) for (const i of g.items) assert.equal(i.id.split("/")[0], g.kind);
  const filtered = filterExamples(index, "gantt");
  assert.ok(filtered.length >= 1 && filtered.every((g) => g.kind === "gantt"));
  assert.equal(filterExamples(index, "").length, index.length);
  assert.deepEqual(filterExamples(index, "zzzzqqq"), []);
});

test("every example renders with the playground's limits", async () => {
  const engine = createEngine();
  for (const ex of loadExamples()) {
    const res = await engine.handle({
      type: "render",
      id: 1,
      source: ex.source,
      options: {},
      svg: {},
    });
    assert.equal(res.ok, true, `${ex.kind}/${ex.name}: ${res.error}`);
  }
});

// --- highlighting -------------------------------------------------------------

test("tokenizer classifies PlantUML", () => {
  const lines = tokenize(
    [
      "@startuml",
      "/' block",
      "still '/ x",
      'title Hi "there" <<st>> #red',
      "A -[#red]-> B : x - y",
      "' note",
      "@enduml",
    ].join("\n"),
  );
  const kinds = lines.map((l) => l.filter((t) => t.cls).map((t) => `${t.cls}:${t.text}`));
  assert.deepEqual(kinds[0], ["dir:@startuml"]);
  assert.deepEqual(kinds[1], ["com:/' block"]);
  assert.deepEqual(kinds[2], ["com:still '/"]);
  assert.deepEqual(kinds[3], ["kw:title", 'str:"there"', "ster:<<st>>", "col:#red"]);
  assert.deepEqual(kinds[4], ["arrow:-[#red]->"]);
  assert.deepEqual(kinds[5], ["com:' note"]);
  assert.deepEqual(kinds[6], ["dir:@enduml"]);
  // Text is preserved exactly.
  assert.equal(lines[4].map((t) => t.text).join(""), "A -[#red]-> B : x - y");
  // Long hostile lines stay linear and lossless.
  const nasty = "-".repeat(50_000) + "[".repeat(50_000);
  assert.equal(
    tokenize(nasty)[0]
      .map((t) => t.text)
      .join(""),
    nasty,
  );
});

// --- worker protocol ---------------------------------------------------------------

const hookSource = (label) => `@startuml
@hook #open alias:item .service
@hook alias:helper .service
@hook .service hover FontSize 46
component "${label}" as item [[https://example.com/orders]]
component "Help" as helper
@enduml`;

test("projects resolve nested files and export separate and combined outputs", async () => {
  const engine = createEngine();
  const files = [
    {
      path: "repo/architecture.puml",
      text: "@startuml\ncomponent Main\n!include parts/worker.iuml\n@enduml",
    },
    { path: "repo/parts/worker.iuml", text: "component Worker\n!include detail.iuml" },
    { path: "repo/parts/detail.iuml", text: "component SharedDetail" },
    { path: "repo/login.puml", text: "@startuml\nClient -> Server : log in\n@enduml" },
  ];
  const result = await engine.handle({ type: "project", id: 1, files, options: { kind: "class" } });
  assert.equal(result.ok, true, result.error);
  const { entries, combined, problems } = result.project;
  assert.deepEqual(problems, []);
  assert.deepEqual(
    entries.map((item) => [item.title, item.kind]),
    [
      ["repo/architecture.puml", "component"],
      ["repo/login.puml", "sequence"],
    ],
  );
  assert.match(entries[0].svg, /SharedDetail/);
  assert.match(combined.svg, /SharedDetail/);
  assert.match(combined.svg, /log in/);

  const exportAt = async (slot) =>
    JSON.parse((await engine.handle({ type: "export", id: 2, slot, what: "excalidraw" })).text);
  const combinedDoc = await exportAt(combined.slot);
  const ids = combinedDoc.elements.map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(combinedDoc.elements.some((element) => element.text === "SharedDetail"));
  const sequenceDoc = await exportAt(entries[1].slot);
  assert.ok(sequenceDoc.elements.some((element) => element.text === "log in"));
  assert.ok(!sequenceDoc.elements.some((element) => element.text === "SharedDetail"));

  const missing = await engine.handle({
    type: "project",
    id: 3,
    files: files.filter((file) => !file.path.endsWith("detail.iuml")),
  });
  assert.equal(missing.ok, true);
  assert.equal(missing.project.entries.length, 1);
  assert.equal(missing.project.entries[0].kind, "sequence");
  assert.match(missing.project.problems[0].message, /detail\.iuml.*repo\/parts\/worker\.iuml/);

  const ambiguous = await engine.handle({
    type: "project",
    id: 4,
    files: [
      { path: "worker.iuml", text: "component First" },
      { path: "worker.iuml", text: "component Second" },
    ],
  });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.error, /Ambiguous local file.*worker\.iuml/);
});

test("worker returns a live hook preview alongside the same static SVG", async () => {
  const engine = createEngine();
  const source = hookSource("Orders and delivery");
  const msg = { type: "render", id: 1, source, options: { strict: true, theme: "plain" } };
  const result = await engine.handle(msg);
  assert.equal(result.ok, true, result.error);
  const plain = await engine.handle({ ...msg, id: 2, source: source.replace(/^@hook.*\n/gm, "") });
  assert.equal(plain.ok, true, plain.error);
  assert.equal(result.svg, plain.svg);
  assert.match(result.svg, /<style>@font-face/);
  assert.equal(plain.interactive, undefined);

  const { svg, width, height } = result.interactive;
  assert.ok(width > result.width && height >= result.height);
  assert.match(svg, /data-excaliplant-hook-id="open" data-excaliplant-hook-classes="service"/);
  assert.match(svg, /data-excaliplant-variant="hover" display="none"/);
  assert.match(svg, /pointer-events="painted"/);
  assert.match(svg, /href="https:\/\/example\.com\/orders"/);
  assert.doesNotMatch(svg, /<style/);
});

test("combined project previews keep same-named and class-only hooks independent", async () => {
  const engine = createEngine();
  const files = [
    { path: "first.puml", text: hookSource("First") },
    { path: "second.puml", text: hookSource("Second") },
  ];
  const msg = { type: "project", id: 1, files, options: { strict: true, theme: "plain" } };
  const result = await engine.handle(msg);
  assert.equal(result.ok, true, result.error);
  const { entries, combined } = result.project;
  const getHooks = (svg) =>
    new Map(
      Array.from(
        svg.matchAll(
          /data-excaliplant-hook="([^"]+)"(?: data-excaliplant-hook-id="([^"]+)")? data-excaliplant-hook-classes="([^"]+)"/g,
        ),
        ([, name, id, classes]) => [name, { id, classes }],
      ),
    );
  const expected = [
    { id: "open", classes: "service" },
    { id: undefined, classes: "service" },
  ];
  for (const entry of entries) {
    assert.doesNotMatch(entry.svg, /data-excaliplant-hook/);
    const hooks = getHooks(entry.interactive.svg);
    assert.deepEqual([...hooks.values()], expected);
    assert.ok(hooks.has("open"));
    const exported = await engine.handle({
      type: "export",
      id: 2,
      slot: entry.slot,
      what: "excalidraw",
    });
    const hook = JSON.parse(exported.text).elements.find(
      (el) => el.customData?.excaliplantHook?.id === "open",
    );
    assert.equal(hook.customData.excaliplantHook.name, "open");
  }
  assert.doesNotMatch(combined.svg, /data-excaliplant-hook/);
  const combinedHooks = getHooks(combined.interactive.svg);
  assert.deepEqual([...combinedHooks.values()], [...expected, ...expected]);

  // Each entry fits on its own, and the second falls back after the first uses the budget.
  const onePreviewBytes = Math.max(
    ...entries.map(({ interactive }) => Buffer.byteLength(interactive.svg)),
  );
  const limited = await createEngine({ maxPreviewBytes: Math.floor(onePreviewBytes * 1.5) }).handle(
    msg,
  );
  assert.equal(limited.ok, true, limited.error);
  assert.deepEqual(
    limited.project.entries.map((entry) => entry.svg),
    entries.map((entry) => entry.svg),
  );
  assert.deepEqual(limited.project.entries[0].interactive, entries[0].interactive);
  assert.equal(limited.project.entries[1].interactive, undefined);
  assert.equal(limited.project.combined.svg, combined.svg);
  assert.equal(limited.project.combined.interactive, undefined);
});

test("worker protocol renders graph and non-graph diagrams", async () => {
  const engine = createEngine({ version: "9.9.9" });
  const graph = await engine.handle({
    type: "render",
    id: 1,
    source: "@startuml\nclass A\nclass B\nA --> B\n@enduml",
    options: { theme: "dark" },
    svg: { background: "#ffffff" },
  });
  assert.equal(graph.ok, true);
  assert.equal(graph.kind, "class");
  assert.match(graph.svg, /^<svg /);
  assert.ok(graph.width > 0 && graph.height > 0);
  assert.equal(graph.pages, 1);
  assert.ok(graph.ms >= 1);
  assert.equal(graph.interactive, undefined);

  const seq = await engine.handle({
    type: "render",
    id: 2,
    source: "Alice -> Bob : hi",
    options: {},
    svg: {},
  });
  assert.equal(seq.kind, "sequence");
  const wbs = await engine.handle({
    type: "render",
    id: 3,
    source: "@startwbs\n* A\n** B\n@endwbs",
    options: {},
    svg: {},
  });
  assert.equal(wbs.kind, "wbs");

  // Warnings carry line numbers; blocks are listed.
  const warn = await engine.handle({
    type: "render",
    id: 4,
    source: "@startuml\nA -> B\nfoo bar baz\n@enduml\n@startuml name2\nC -> D\n@enduml",
    options: {},
    svg: {},
  });
  assert.equal(warn.ok, true);
  assert.deepEqual(
    warn.diagnostics.map((d) => d.line),
    [3],
  );
  assert.deepEqual(
    warn.blocks.map((b) => b.name),
    [null, "name2"],
  );

  // Errors keep the line number.
  const bad = await engine.handle({
    type: "render",
    id: 5,
    source: "@startuml\nA -> B\n!if (\n@enduml",
    options: {},
    svg: {},
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.line, 3);
  assert.match(bad.error, /endif/);
  const strict = await engine.handle({
    type: "render",
    id: 6,
    source: "@startuml\nA -> B\nfoo bar baz\n@enduml",
    options: { strict: true },
    svg: {},
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.line, 3);

  // Oversized and malformed requests are refused without throwing.
  const huge = await engine.handle({
    type: "render",
    id: 7,
    source: "x".repeat(MAX_SOURCE_BYTES + 1),
    options: {},
    svg: {},
  });
  assert.equal(huge.ok, false);
  assert.match(huge.error, /exceeds/);
  assert.equal(
    (await engine.handle({ type: "render", id: 8, source: 5, options: {}, svg: {} })).ok,
    false,
  );
  assert.equal(await engine.handle(null), null);
  assert.equal(await engine.handle({ type: "unknown" }), null);
  assert.equal(await engine.handle("render"), null);
});

test("worker protocol: export, stale requests and warm-up", async () => {
  const engine = createEngine({ version: "1.2.3" });
  assert.equal(
    (await engine.handle({ type: "export", id: 1, what: "excalidraw" })).ok,
    false,
    "nothing rendered yet",
  );
  assert.deepEqual(await engine.warmup(), { type: "ready", version: "1.2.3" });
  assert.equal(
    (await engine.handle({ type: "export", id: 2, what: "excalidraw" })).ok,
    false,
    "warm-up is not kept",
  );
  const render1 = engine.handle({
    type: "render",
    id: 10,
    source: "Alice -> Bob",
    options: {},
    svg: {},
  });
  const render2 = engine.handle({
    type: "render",
    id: 11,
    source: "Alice -> Carol",
    options: {},
    svg: {},
  });
  const [a, b] = await Promise.all([render1, render2]);
  assert.equal(a.type, "stale", "a newer request makes the older result unnecessary");
  assert.equal(b.ok, true);
  const file = await engine.handle({ type: "export", id: 12, what: "excalidraw" });
  assert.equal(JSON.parse(file.text).type, "excalidraw");
  const clip = await engine.handle({ type: "export", id: 13, what: "clipboard" });
  const parsed = JSON.parse(clip.text);
  assert.equal(parsed.type, "excalidraw/clipboard");
  assert.ok(parsed.elements.length > 0);
});

test("worker exports the selected preset and independent overrides", async () => {
  const engine = createEngine();
  const options = toRenderOptions(
    normalizeOptions({ strokePreset: "cartoonist", roughness: 0.75 }),
  );
  const result = await engine.handle({
    type: "render",
    id: 1,
    source: SOURCE,
    options: options.render,
    svg: options.svg,
  });
  assert.equal(result.ok, true, result.error);
  const file = await engine.handle({ type: "export", id: 2, what: "excalidraw" });
  const elements = JSON.parse(file.text).elements;
  assert.equal(elements.find((e) => e.type === "rectangle").roughness, 0.75);
  assert.equal(elements.find((e) => e.type === "arrow").roughness, 2);
});

test("cleanRenderOptions whitelists what the page may send", () => {
  const o = cleanRenderOptions({
    theme: "mono",
    kind: "nope",
    limits: { maxInputBytes: 1e12 },
    include: () => "x",
    defines: { OK: "1", "bad name": "2", __proto__: "x", N: 5 },
    page: 1.5,
    block: 2,
    date: new Date(NaN),
    roughness: Infinity,
    edgeRoughness: "0.4",
  });
  assert.equal(o.theme, "mono");
  assert.ok(!("kind" in o));
  assert.ok(!("include" in o));
  assert.ok(!("page" in o));
  assert.ok(!("date" in o));
  assert.ok(!("roughness" in o));
  assert.ok(!("edgeRoughness" in o));
  assert.equal(o.block, 2);
  assert.deepEqual({ ...o.defines }, { OK: "1" });
  assert.ok(o.limits.maxInputBytes <= MAX_SOURCE_BYTES, "page cannot raise the limits");
});

// --- worker client --------------------------------------------------------------------

test("worker client restarts a hanging worker and drops superseded renders", async () => {
  /** @type {any[]} */
  const workers = [];
  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.terminated = false;
      this.sent = [];
      workers.push(this);
    }
    postMessage(msg) {
      this.sent.push(msg);
      // The first worker hangs; the second one answers.
      if (workers.indexOf(this) >= 1 && msg.type === "render") {
        queueMicrotask(() =>
          this.onmessage({ data: { type: "result", id: msg.id, ok: true, svg: "<svg/>" } }),
        );
      }
    }
    terminate() {
      this.terminated = true;
    }
  }
  const saved = globalThis.Worker;
  globalThis.Worker = /** @type {any} */ (FakeWorker);
  try {
    let ready = 0;
    const client = createEngineClient({
      workerUrl: "worker.js",
      timeoutMs: 40,
      onReady: () => ready++,
    });
    assert.equal(workers.length, 1);
    workers[0].onmessage({ data: { type: "ready", version: "1" } });
    assert.equal(ready, 1);
    const hung = await client.render("A -> B", {}, {});
    assert.equal(hung.ok, false);
    assert.equal(hung.timeout, true);
    assert.match(hung.error, /stopped/);
    assert.equal(workers[0].terminated, true);
    assert.equal(workers.length, 2, "a new worker was started");
    const fine = await client.render("A -> B", {}, {});
    assert.equal(fine.ok, true);
    assert.equal(workers[1].sent[0].type, "render");
    assert.equal(workers[1].url, "worker.js");
  } finally {
    globalThis.Worker = saved;
  }
});
