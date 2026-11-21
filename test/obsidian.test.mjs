// Tests for the Obsidian plugin (integrations/obsidian) that need neither
// Obsidian nor esbuild: manifest rules, settings, rendering glue, the plugin
// class against a mock `obsidian` module, and source hygiene.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderBlock } from "../src/markdown/render.mjs";
import {
  FakeDOMParser,
  FakeElement,
  createApp,
  createContext,
  createEditor,
  installDom,
  notices,
} from "./obsidian_mock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(root, "integrations", "obsidian");
const readJson = (name) => JSON.parse(readFileSync(path.join(pluginDir, name), "utf8"));

register(pathToFileURL(path.join(root, "test", "obsidian_loader.mjs")).href);
const { default: ExcaliplantPlugin } = await import("../integrations/obsidian/src/main.js");
const config = await import("../integrations/obsidian/src/config.js");
const engine = await import("../integrations/obsidian/src/engine.js");
const shimCrypto = await import("../integrations/obsidian/shims/crypto.js");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- manifest and versions.json (rules: docs.obsidian.md, Reference/Manifest and Submit your plugin) ---

test("manifest.json satisfies the community plugin rules", () => {
  const m = readJson("manifest.json");
  for (const key of ["id", "name", "version", "minAppVersion", "description", "author"]) {
    assert.equal(typeof m[key], "string", `${key} is a string`);
    assert.ok(m[key].length > 0, `${key} is not empty`);
  }
  assert.equal(typeof m.isDesktopOnly, "boolean");
  // id: lowercase letters and hyphens only; no "obsidian"; must not end in "plugin".
  assert.match(m.id, /^[a-z-]+$/);
  assert.ok(!m.id.includes("obsidian") && !m.id.endsWith("plugin"));
  // name: Basic Latin, only - + ( ) as punctuation, no "Obsidian"/"Plugin".
  assert.match(m.name, /^[A-Za-z0-9 ()+-]+$/);
  assert.ok(!/obsidian|plugin/i.test(m.name));
  // version and minAppVersion: x.y.z. The repository carries the placeholder.
  assert.equal(m.version, "0.0.0");
  assert.match(m.minAppVersion, /^\d+\.\d+\.\d+$/);
  // description: under 250 characters, starts with an action, ends with a period, no emoji.
  assert.ok(m.description.length < 250);
  assert.match(m.description, /^[A-Z][a-z]+ .*\.$/);
  assert.ok(!/^this is/i.test(m.description));
  assert.ok(!/\p{Extended_Pictographic}/u.test(m.description));
  // Mobile-compatible: the bundle uses no Node or Electron API.
  assert.equal(m.isDesktopOnly, false);
  assert.ok(!("fundingUrl" in m), "no fundingUrl without a donation page");
});

test("minAppVersion covers the Obsidian APIs the plugin calls", () => {
  // FileManager.getAvailablePathForAttachment is @since 1.5.7 (obsidian.d.ts).
  const [a, b, c] = readJson("manifest.json").minAppVersion.split(".").map(Number);
  assert.ok(a > 1 || (a === 1 && (b > 5 || (b === 5 && c >= 7))));
});

test("versions.json maps versions to minAppVersion", () => {
  const v = readJson("versions.json");
  assert.equal(typeof v, "object");
  for (const [k, min] of Object.entries(v)) {
    assert.match(k, /^\d+\.\d+\.\d+$/);
    assert.match(min, /^\d+\.\d+\.\d+$/);
  }
});

test("styles use theme variables and no hard-coded colours", () => {
  const css = readFileSync(path.join(pluginDir, "styles.css"), "utf8");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
  assert.ok(css.includes("var(--"));
});

// --- settings ---

test("normalizeSettings repairs stored data", () => {
  assert.deepEqual(config.normalizeSettings(undefined), config.DEFAULT_SETTINGS);
  const s = config.normalizeSettings({
    theme: "nope",
    clean: "yes",
    seed: `  ${"x".repeat(100)} `,
    maxWidth: 1e9,
    transparent: true,
  });
  assert.equal(s.theme, "auto");
  assert.equal(s.clean, false);
  assert.equal(s.seed.length, 64);
  assert.equal(s.maxWidth, 16000);
  assert.equal(s.transparent, true);
  assert.equal(config.normalizeSettings({ maxWidth: -5 }).maxWidth, 0);
  assert.equal(config.normalizeSettings({ maxWidth: "abc" }).maxWidth, 0);
  assert.ok(config.THEME_CHOICES.includes("blueprint") && config.THEME_CHOICES[0] === "auto");
});

// --- engine ---

test("fenceAttrsAt reads attributes from the fence line", () => {
  const text = "intro\n```plantuml {theme=blueprint clean width=600}\nA -> B\n```";
  const hit = engine.fenceAttrsAt(text, 1);
  assert.equal(hit.fenceLine, true);
  assert.deepEqual(hit.attrs, { theme: "blueprint", clean: true, width: 600 });
  assert.equal(engine.fenceAttrsAt("> ```puml {seed=7}\n> A -> B", 0).attrs.seed, "7");
  assert.deepEqual(engine.fenceAttrsAt("- list\n  text", 1), { attrs: {}, fenceLine: false });
  assert.deepEqual(engine.fenceAttrsAt("", 3), { attrs: {}, fenceLine: false });
});

test("resolveOptions applies settings, theme mode and fence overrides", () => {
  const s = config.normalizeSettings({});
  assert.equal(engine.resolveOptions(s, {}, { dark: false }).theme, "sketch");
  assert.equal(engine.resolveOptions(s, {}, { dark: true }).theme, "dark");
  assert.equal(engine.resolveOptions(s, { theme: "auto" }, { dark: true }).theme, "dark");
  assert.equal(engine.resolveOptions(s, { theme: "mono" }, { dark: true }).theme, "mono");
  const fixed = config.normalizeSettings({ theme: "plain", clean: true, seed: "42" });
  const o = engine.resolveOptions(fixed, {}, { dark: true, scope: ".x" });
  assert.deepEqual([o.theme, o.clean, o.seed, o.scope], ["plain", true, "42", ".x"]);
  assert.equal(engine.resolveOptions(fixed, { clean: false }, {}).sketch, true);
  const t = config.normalizeSettings({ transparent: true });
  assert.equal(engine.resolveOptions(t, {}, {}).background, "transparent");
  assert.equal(engine.resolveOptions(t, {}, { forExport: true }).background, undefined);
  assert.equal("include" in engine.resolveOptions(s, {}, {}), false, "!include stays off");
});

test("findBlock picks the block under the cursor or the only block", () => {
  const text = "a\n```plantuml\nA -> B\n```\nb\n~~~puml\nC -> D\n~~~\n";
  assert.equal(engine.findBlock(text, 2).source, "A -> B");
  assert.equal(engine.findBlock(text, 6).source, "C -> D");
  assert.equal(engine.findBlock(text, 4), null);
  assert.equal(engine.findBlock("x\n```plantuml\nA -> B\n```\n", 0).source, "A -> B");
  assert.equal(engine.findBlock("nothing", 0), null);
});

test("slug is file-name safe", () => {
  assert.equal(engine.slug("Login flow / v2?"), "login-flow-v2");
  assert.equal(engine.slug("***"), "diagram");
});

test("mountSvg goes through DOMParser, never innerHTML", () => {
  const { doc } = installDom();
  const holder = new FakeElement("div", doc);
  engine.mountSvg(holder, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(FakeDOMParser.calls[0].type, "image/svg+xml");
  assert.equal(holder.children.length, 1);
  assert.throws(() => engine.mountSvg(holder, "<div>no svg</div>"), /could not be displayed/);
  assert.throws(() => {
    holder.innerHTML = "x";
  }, /innerHTML/);
});

test("SHA-256 shim matches node:crypto", () => {
  const samples = [
    "",
    "abc",
    "ä€😀",
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(64),
    "y".repeat(1000),
  ];
  for (let n = 0; n < 130; n++) samples.push("q".repeat(n));
  for (const s of samples) {
    const want = createHash("sha256").update(s).digest("hex");
    assert.equal(
      shimCrypto.createHash("sha256").update(s).digest("hex"),
      want,
      `length ${s.length}`,
    );
  }
  assert.throws(() => shimCrypto.createHash("md5"));
});

// --- plugin against the mock ---

/** @param {{ dark?: boolean, data?: unknown }} [o] */
async function loadPlugin({ dark = false, data = null } = {}) {
  const env = installDom({ dark });
  const plugin = new ExcaliplantPlugin(createApp(), { id: "excaliplant" });
  plugin.stored = data;
  await plugin.onload();
  return { plugin, ...env };
}

test("plugin registers processors, commands and the settings tab", async () => {
  const { plugin } = await loadPlugin();
  assert.deepEqual([...plugin.processors.keys()].sort(), ["plantuml", "puml", "uml"]);
  assert.deepEqual(
    plugin.commands.map((c) => c.id),
    ["export-excalidraw", "export-svg", "export-png", "copy-excalidraw-json"],
  );
  for (const c of plugin.commands) {
    assert.ok(!c.id.includes("excaliplant"), "command ids must not repeat the plugin id");
    assert.ok(!c.hotkeys, "no default hotkeys");
    assert.equal(typeof c.editorCallback, "function");
  }
  assert.equal(plugin.tabs.length, 1);
  assert.equal(plugin.events.length, 1);
});

test("a block shows a placeholder, then the sanitised SVG", async () => {
  const { plugin, doc } = await loadPlugin();
  const el = new FakeElement("div", doc);
  const done = plugin.processors.get("plantuml")("Alice -> Bob : hi", el, createContext());
  assert.ok(el.find("excaliplant-pending"), "placeholder first");
  assert.match(el.allText, /Rendering…/);
  await done;
  assert.equal(el.find("excaliplant-pending"), null);
  const holder = el.find("excaliplant");
  assert.equal(holder.getAttribute("role"), "img");
  assert.match(el.className, /excaliplant-block/);
  const want = await renderBlock("Alice -> Bob : hi", { theme: "sketch", scope: ".excaliplant" });
  assert.equal(holder.children[0].svgText, want.svg);
  assert.equal(FakeDOMParser.calls.at(-1).text, want.svg);
  assert.ok(!/<script|onload=|foreignObject|javascript:/i.test(want.svg));
});

test("cached blocks render synchronously", async () => {
  const { plugin, doc } = await loadPlugin();
  const first = new FakeElement("div", doc);
  await plugin.processors.get("puml")("A -> B", first, createContext());
  const second = new FakeElement("div", doc);
  const pending = plugin.processors.get("uml")("A -> B", second, createContext());
  assert.ok(second.find("excaliplant"), "diagram present before the promise settles");
  assert.equal(second.find("excaliplant-pending"), null);
  await pending;
});

test("fence attributes and Obsidian's colour scheme choose the theme", async () => {
  const { plugin, doc } = await loadPlugin({ dark: true });
  const el = new FakeElement("div", doc);
  await plugin.processors.get("plantuml")("A -> B", el, createContext());
  const dark = await renderBlock("A -> B", { theme: "dark", scope: ".excaliplant" });
  assert.equal(el.find("excaliplant").children[0].svgText, dark.svg);

  const text = '```plantuml {theme=blueprint alt="Flow"}\nA -> B\n```';
  const el2 = new FakeElement("div", doc);
  await plugin.processors.get("plantuml")("A -> B", el2, createContext({ text }));
  const bp = await renderBlock("A -> B", { theme: "blueprint", scope: ".excaliplant" });
  assert.equal(el2.find("excaliplant").children[0].svgText, bp.svg);
  assert.equal(el2.find("excaliplant").getAttribute("aria-label"), "Flow");
});

test("errors name the line in the diagram and in the note", async () => {
  const { plugin, doc } = await loadPlugin();
  const text = "a\nb\nc\nd\n```plantuml\n@startuml\nA -> B\n!if (\n@enduml\n```";
  const el = new FakeElement("div", doc);
  await plugin.processors.get("plantuml")(
    "@startuml\nA -> B\n!if (\n@enduml",
    el,
    createContext({ text, lineStart: 4 }),
  );
  const box = el.find("excaliplant-error");
  assert.equal(box.getAttribute("role"), "alert");
  assert.match(
    box.find("excaliplant-error-line").textContent,
    /Line 3 of the diagram \(line 8 of this note\)/,
  );
  assert.match(box.find("excaliplant-error-message").textContent, /endif/);
  assert.equal(el.find("excaliplant"), null);
});

test("hostile diagram text never reaches the DOM unsanitised", async () => {
  const { plugin, doc } = await loadPlugin();
  const el = new FakeElement("div", doc);
  await plugin.processors.get("plantuml")(
    "A -> B : <img src=x onerror=alert(1)></svg><script>alert(1)</script>",
    el,
    createContext(),
  );
  const parsed = FakeDOMParser.calls.at(-1).text;
  assert.ok(!/<script|<img|onerror=/i.test(parsed));
});

test("changing settings persists them and redraws live blocks", async () => {
  const { plugin, doc } = await loadPlugin();
  const el = new FakeElement("div", doc);
  await plugin.processors.get("plantuml")("A -> B", el, createContext());
  const before = el.find("excaliplant").children[0].svgText;
  await plugin.updateSettings({ theme: "mono", maxWidth: 400 });
  assert.equal(plugin.stored.theme, "mono");
  await tick();
  await tick();
  const after = el.find("excaliplant");
  assert.notEqual(after.children[0].svgText, before);
  assert.equal(after.styleProps.get("--excaliplant-max-width"), "400px");
  // Unloading stops redraws.
  plugin.blocks.clear();
});

test("css-change redraws only with the automatic theme", async () => {
  const fixed = await loadPlugin({ data: { theme: "plain" } });
  const el = new FakeElement("div", fixed.doc);
  await fixed.plugin.processors.get("plantuml")("A -> B", el, createContext());
  const node = el.find("excaliplant");
  fixed.plugin.app.handlers.get("css-change")();
  await tick();
  assert.equal(el.find("excaliplant"), node, "not redrawn");

  const auto = await loadPlugin();
  const el2 = new FakeElement("div", auto.doc);
  await auto.plugin.processors.get("plantuml")("A -> B", el2, createContext());
  const node2 = el2.find("excaliplant");
  auto.plugin.app.handlers.get("css-change")();
  await tick();
  await tick();
  assert.notEqual(el2.find("excaliplant"), node2, "redrawn");
});

test("warnings are listed only when enabled", async () => {
  const { plugin, doc } = await loadPlugin({ data: { showWarnings: true } });
  const el = new FakeElement("div", doc);
  await plugin.processors.get("plantuml")("A -> B\nfoo bar ???", el, createContext());
  assert.match(el.find("excaliplant-warnings").allText, /1 warning/);
  assert.match(el.find("excaliplant-warnings").allText, /Line 2: Ignored unrecognised line/);
  const off = await loadPlugin();
  const el2 = new FakeElement("div", off.doc);
  await off.plugin.processors.get("plantuml")("A -> B\nfoo bar ???", el2, createContext());
  assert.equal(el2.find("excaliplant-warnings"), null);
});

const NOTE = "intro\n```plantuml\n@startuml\ntitle Login flow\nA -> B : hi\n@enduml\n```\n";
const command = (plugin, id) => plugin.commands.find((c) => c.id === id);
const view = { file: { path: "notes/a.md", basename: "a" } };

test("export commands write attachments next to the note", async () => {
  const { plugin } = await loadPlugin();
  await command(plugin, "export-svg").editorCallback(createEditor(NOTE, 4), view);
  const [svg] = plugin.app.created;
  assert.match(svg.path, /^attachments\/login-flow-[0-9a-f]{8}\.svg#notes\/a\.md$/);
  assert.match(svg.data, /^<svg /);
  assert.ok(!/<script|onload=/i.test(svg.data));
  assert.ok(!svg.data.includes(".excaliplant text"), "exports are not scoped to a note");

  await command(plugin, "export-excalidraw").editorCallback(createEditor(NOTE, 4), view);
  const doc = JSON.parse(plugin.app.created[1].data);
  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
  assert.match(plugin.app.created[1].path, /\.excalidraw#notes\/a\.md$/);
});

test("copy command puts Excalidraw clipboard JSON on the clipboard", async () => {
  const { plugin, clipboard } = await loadPlugin();
  await command(plugin, "copy-excalidraw-json").editorCallback(createEditor(NOTE, 5), view);
  const data = JSON.parse(clipboard.text);
  assert.equal(data.type, "excalidraw/clipboard");
  assert.ok(data.elements.length > 0);
  assert.deepEqual(data.files, {});
});

test("export without a block under the cursor tells the user", async () => {
  const { plugin } = await loadPlugin();
  const two = `${NOTE}\ntext\n${NOTE}`;
  notices.length = 0;
  await command(plugin, "export-svg").editorCallback(createEditor(two, 0), view);
  assert.equal(plugin.app.created.length, 0);
  assert.match(notices.at(-1), /cursor inside a PlantUML code block/);
});

test("export failures are reported, not thrown", async () => {
  const { plugin } = await loadPlugin();
  notices.length = 0;
  await command(plugin, "export-svg").editorCallback(
    createEditor("```plantuml\n@startuml\n!if (\n@enduml\n```", 1),
    view,
  );
  assert.match(notices.at(-1), /^Export failed: /);
});

// --- source hygiene (the checks Obsidian reviewers look for) ---

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".js"))
    .map((e) => path.join(dir, e.name));
}

test("plugin sources avoid unsafe DOM, network and dynamic code", () => {
  const forbidden = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /(^|[^.\w$])eval\s*\(/,
    /\bnew Function\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bsendBeacon\b/,
    /\brequestUrl\b/,
    /from "node:/,
    /\brequire\(/,
    /\bconsole\.log\b/,
    /\bwindow\.app\b/,
  ];
  const files = [
    ...sourceFiles(path.join(pluginDir, "src")),
    ...sourceFiles(path.join(pluginDir, "shims")),
  ];
  assert.ok(files.length >= 6);
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const re of forbidden) assert.ok(!re.test(text), `${path.basename(file)} matches ${re}`);
  }
});

test("the plugin never wires up !include", () => {
  const text = readFileSync(path.join(pluginDir, "src", "engine.js"), "utf8");
  assert.ok(!/\binclude\s*:/.test(text));
});
