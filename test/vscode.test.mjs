// VS Code extension (integrations/vscode), tested without an Electron host:
// the extension receives a mock `vscode` API and a mini markdown-it.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { COMMANDS, createExtension } from "../integrations/vscode/src/extension.mjs";
import { createMarkdownIntegration } from "../integrations/vscode/src/markdown.mjs";
import { readSettings } from "../integrations/vscode/src/config.mjs";
import { blockOptions } from "../integrations/vscode/src/options.mjs";
import { createIncludeResolver, resolveIncludeRoot } from "../integrations/vscode/src/include.mjs";
import { escapeHtml, previewBody, previewHtml } from "../integrations/vscode/src/preview.mjs";
import { Position, Uri, createMiniMarkdownIt, createMockVscode, waitFor } from "./vscode_shim.mjs";

const EXT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "integrations",
  "vscode",
);
const manifest = JSON.parse(readFileSync(path.join(EXT, "package.json"), "utf8"));

const SEQ = "@startuml\nAlice -> Bob : hello\n@enduml";
const fence = (body = "Alice -> Bob : hi", info = "plantuml") =>
  `# T\n\n\`\`\`${info}\n${body}\n\`\`\`\n`;

/** Activate the extension against a fresh mock. */
function activated(init) {
  const mock = createMockVscode(init);
  const ext = createExtension(mock.vscode);
  const context = { subscriptions: [] };
  const api = ext.activate(context);
  return { ...mock, ext, api, context };
}

describe("manifest", () => {
  it("is a self-contained extension with a placeholder version", () => {
    assert.equal(manifest.version, "0.0.0");
    assert.equal(manifest.name, "excaliplant");
    assert.ok(manifest.publisher);
    assert.equal(manifest.main, "./dist/extension.js");
    assert.equal(manifest.contributes["markdown.markdownItPlugins"], true);
    assert.equal(manifest.dependencies, undefined, "runtime dependencies would need node_modules");
    assert.ok(manifest.engines.vscode);
  });

  it("contributes exactly the commands that activate registers", () => {
    const contributed = manifest.contributes.commands.map((c) => c.command).sort();
    const { state } = activated();
    assert.deepEqual(contributed, [...state.commands.keys()].sort());
    assert.deepEqual(contributed, Object.values(COMMANDS).sort());
  });

  it("restricts include, limits and asset settings in untrusted workspaces", () => {
    const ut = manifest.capabilities.untrustedWorkspaces;
    assert.equal(ut.supported, "limited");
    assert.ok(ut.description);
    const props = manifest.contributes.configuration.properties;
    for (const key of ut.restrictedConfigurations) assert.ok(props[key], `${key} is not a setting`);
    for (const key of ["excaliplant.includeDir", "excaliplant.limits"]) {
      assert.ok(ut.restrictedConfigurations.includes(key));
    }
    assert.equal(props["excaliplant.includeDir"].default, "", "!include must be off by default");
  });

  it("only claims PlantUML file extensions and ships its grammar and icon", () => {
    const lang = manifest.contributes.languages[0];
    assert.equal(lang.id, "plantuml");
    assert.deepEqual(lang.extensions, [".puml", ".plantuml", ".pu", ".iuml"]);
    const grammar = JSON.parse(
      readFileSync(path.join(EXT, manifest.contributes.grammars[0].path), "utf8"),
    );
    assert.equal(grammar.scopeName, manifest.contributes.grammars[0].scopeName);
    assert.notEqual(
      grammar.scopeName,
      "source.wsd",
      "must not collide with other extensions' scope",
    );
    const icon = readFileSync(path.join(EXT, "icon.png"));
    assert.equal(icon.readUInt32BE(16), 128);
    assert.equal(icon.readUInt32BE(20), 128);
    assert.ok(
      manifest.contributes.configuration.properties["excaliplant.theme"].enum.includes("auto"),
    );
  });

  it("has no telemetry or network code in the sources", () => {
    for (const f of [
      "extension",
      "commands",
      "markdown",
      "preview",
      "config",
      "include",
      "options",
      "diagram",
    ]) {
      const text = readFileSync(path.join(EXT, "src", `${f}.mjs`), "utf8");
      assert.doesNotMatch(
        text,
        /node:(https?|net|dgram|tls|dns)|\bfetch\(|XMLHttpRequest|WebSocket/,
        f,
      );
    }
  });
});

describe("settings", () => {
  it("resolves the auto theme from the colour theme", () => {
    const light = createMockVscode({ settings: { "excaliplant.theme": "auto" } });
    assert.equal(readSettings(light.vscode).theme, "sketch");
    const dark = createMockVscode({ dark: true });
    assert.equal(readSettings(dark.vscode).theme, "dark");
    const fixed = createMockVscode({ dark: true, settings: { "excaliplant.theme": "blueprint" } });
    assert.equal(readSettings(fixed.vscode).theme, "blueprint");
    const bogus = createMockVscode({ settings: { "excaliplant.theme": "nope" } });
    assert.equal(readSettings(bogus.vscode).theme, "sketch");
  });

  it("ignores include and limit overrides in an untrusted workspace", () => {
    const settings = {
      "excaliplant.includeDir": "/etc",
      "excaliplant.limits": { maxElements: 10, bogus: 1, maxNodes: -3 },
    };
    const trusted = readSettings(createMockVscode({ settings }).vscode);
    assert.equal(trusted.includeDir, "/etc");
    assert.deepEqual(trusted.limits, { maxElements: 10 });
    const untrusted = readSettings(createMockVscode({ settings, trusted: false }).vscode);
    assert.equal(untrusted.includeDir, "");
    assert.deepEqual(untrusted.limits, {});
    assert.equal(blockOptions({ settings: untrusted }).include, undefined);
  });

  it("caps limit overrides at a multiple of the default", () => {
    const m = createMockVscode({ settings: { "excaliplant.limits": { maxElements: 1e12 } } });
    assert.ok(readSettings(m.vscode).limits.maxElements <= 200_000 * 32);
  });
});

describe("include resolver", () => {
  const dir = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "excaliplant-inc-"));
  const root = path.join(dir, "inc");
  const outside = path.join(dir, "secret.puml");
  mkdirSync(root);
  writeFileSync(path.join(root, "a.puml"), "A -> B");
  writeFileSync(outside, "SECRET");
  symlinkSync(outside, path.join(root, "link.puml"));
  const real = resolveIncludeRoot("inc", dir);

  it("resolves relative to the workspace and requires an existing folder", () => {
    assert.ok(real);
    assert.equal(resolveIncludeRoot("", dir), null);
    assert.equal(resolveIncludeRoot("missing", dir), null);
    assert.equal(resolveIncludeRoot("inc", undefined), null);
  });

  it("reads files below the root only", () => {
    const resolve = createIncludeResolver(real, 1000);
    const file = { from: null, kind: "file" };
    assert.equal(resolve("a.puml", file), "A -> B");
    assert.equal(resolve("../secret.puml", file), null);
    assert.equal(resolve(outside, file), null);
    assert.equal(resolve("link.puml", file), null, "symlinks that leave the tree are refused");
    assert.equal(resolve("a.puml", { from: null, kind: "url" }), null);
    assert.equal(createIncludeResolver(real, 2)("a.puml", file), null, "size limit");
  });

  it("keys the cache by folder and generation", () => {
    const settings = {
      ...readSettings(createMockVscode({ settings: { "excaliplant.includeDir": real } }).vscode),
    };
    const a = blockOptions({ settings, includeGeneration: 0 });
    const b = blockOptions({ settings, includeGeneration: 1 });
    assert.equal(typeof a.include, "function");
    assert.notEqual(a.includeKey, b.includeKey);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("markdown preview integration", () => {
  it("returns a placeholder first, then the SVG after a refresh", async () => {
    const { api, state } = activated();
    const md = api.extendMarkdownIt(createMiniMarkdownIt());
    const text = fence();
    const first = md.render(text, {});
    assert.match(first, /excaliplant-pending/);
    await waitFor(() => state.executed.some(([id]) => id === "markdown.preview.refresh"));
    const second = md.render(text, {});
    assert.match(second, /<div class="excaliplant" role="img"[^>]*><svg/);
    assert.doesNotMatch(second, /<script|onload=|foreignObject/i);
  });

  it("leaves other fences and non-PlantUML documents alone", () => {
    const { api } = activated();
    const md = api.extendMarkdownIt(createMiniMarkdownIt());
    assert.equal(
      md.render("```js\nlet a = 1 < 2\n```\n"),
      "<pre><code>let a = 1 &lt; 2\n</code></pre>\n",
    );
  });

  it("does nothing when the Markdown integration is disabled", () => {
    const { api } = activated({ settings: { "excaliplant.markdown.enabled": false } });
    const md = createMiniMarkdownIt();
    const rule = md.renderer.rules.fence;
    assert.equal(api.extendMarkdownIt(md).renderer.rules.fence, rule);
  });

  it("renders fence errors visibly and without throwing", async () => {
    const { api, state } = activated();
    const md = api.extendMarkdownIt(createMiniMarkdownIt());
    const text = fence("Alice -> Bob", "plantuml {theme=nonexistent}");
    md.render(text, {});
    await waitFor(() => state.executed.length > 0);
    assert.match(md.render(text, {}), /class="excaliplant-error"/);
  });

  it("follows the VS Code colour theme and the settings", async () => {
    const { api, state, events } = activated({ dark: true });
    const md = api.extendMarkdownIt(createMiniMarkdownIt());
    const text = fence("Alice -> Bob : theme");
    md.render(text, {});
    await waitFor(() => !/pending/.test(md.render(text, {})));
    assert.match(md.render(text, {}), /fill="#121212"/, "dark theme in a dark VS Code");

    state.colorKind = 1;
    events.theme.fire({});
    assert.match(md.render(text, {}), /pending|fill="#ffffff"/);
    await waitFor(() => !/pending/.test(md.render(text, {})));
    assert.doesNotMatch(md.render(text, {}), /fill="#121212"/, "sketch theme in a light VS Code");

    state.settings["excaliplant.theme"] = "blueprint";
    events.config.fire({ affectsConfiguration: (s) => s === "excaliplant" });
    await waitFor(() => !/pending/.test(md.render(text, {})));
    assert.match(md.render(text, {}), /#0b3d91/);
  });

  it("pre-renders documents in the background so the preview is complete", async () => {
    const mock = createMockVscode();
    const integration = createMarkdownIntegration({
      vscode: mock.vscode,
      getContext: () => ({ settings: readSettings(mock.vscode) }),
    });
    const md = integration.extendMarkdownIt(createMiniMarkdownIt());
    const doc = mock.addDocument("/ws/a.md", "markdown", fence("A -> B : pre"));
    integration.schedulePrerender(doc);
    await waitFor(() => integration.cache.size > 0);
    const html = md.render(doc.getText(), {});
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /pending/);
    assert.equal(
      mock.state.executed.filter(([id]) => id === "markdown.preview.refresh").length,
      0,
      "a pre-rendered document needs no refresh",
    );
    // Other languages are ignored.
    integration.schedulePrerender(mock.addDocument("/ws/a.txt", "plaintext", fence("X -> Y")));
    integration.dispose();
  });

  it("reinstalling does not stack fence wrappers", () => {
    const mock = createMockVscode();
    const integration = createMarkdownIntegration({
      vscode: mock.vscode,
      getContext: () => ({ settings: readSettings(mock.vscode) }),
    });
    const md = integration.extendMarkdownIt(createMiniMarkdownIt());
    const original = md.renderer.rules.fence;
    integration.reconfigure();
    integration.reconfigure();
    assert.notEqual(md.renderer.rules.fence, original);
    // The wrapped rule delegates to the original fence rule exactly one level deep.
    assert.equal(md.render("```js\nx\n```\n"), "<pre><code>x\n</code></pre>\n");
    integration.dispose();
  });

  it("re-renders when an included file changes", async () => {
    const dir = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "excaliplant-inc2-"));
    try {
      writeFileSync(path.join(dir, "defs.puml"), '!$who = "Alice"');
      const { state, events, api } = activated({ settings: { "excaliplant.includeDir": dir } });
      assert.equal(state.watchers.length, 1);
      const md = api.extendMarkdownIt(createMiniMarkdownIt());
      const text = fence("!include defs.puml\n$who -> Bob : inc");
      md.render(text, {});
      await waitFor(() => !/pending/.test(md.render(text, {})));
      assert.match(md.render(text, {}), /Alice/);
      writeFileSync(path.join(dir, "defs.puml"), '!$who = "Carol"');
      state.watchers[0].change.fire({});
      await waitFor(() => !/pending/.test(md.render(text, {})));
      assert.match(md.render(text, {}), /Carol/);
      // Changing the setting replaces the watcher.
      state.settings["excaliplant.includeDir"] = "";
      events.config.fire({ affectsConfiguration: () => true });
      assert.equal(state.watchers[0].disposed, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not read include files in an untrusted workspace", async () => {
    const dir = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "excaliplant-inc3-"));
    try {
      writeFileSync(path.join(dir, "defs.puml"), '!$who = "Mallory"');
      const { api, state } = activated({
        trusted: false,
        settings: { "excaliplant.includeDir": dir },
      });
      assert.equal(state.watchers.length, 0);
      const md = api.extendMarkdownIt(createMiniMarkdownIt());
      const text = fence("!include defs.puml\nAlice -> Bob : x");
      md.render(text, {});
      await waitFor(() => !/pending/.test(md.render(text, {})));
      assert.doesNotMatch(md.render(text, {}), /Mallory/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("render commands", () => {
  const twoDiagrams = "@startuml first\nA -> B\n@enduml\n\n@startuml second\nC -> D\n@enduml\n";

  it("renders a .puml file to SVG next to the source", async () => {
    const { state, addDocument } = activated();
    addDocument("/ws/dir/flow.puml", "plantuml", SEQ, { active: true });
    let suggested;
    state.saveAnswer = (uri) => ((suggested = uri), Uri.file(uri.path));
    await state.commands.get(COMMANDS.renderSvg)();
    assert.equal(suggested.path, "/ws/dir/flow.svg");
    const svg = state.files.get("/ws/dir/flow.svg");
    assert.match(svg, /^<svg[^>]*>/);
    assert.match(svg, /font-face/, "the font is embedded");
    assert.match(svg, /Alice/);
  });

  it("renders to an Excalidraw document", async () => {
    const { state, addDocument } = activated();
    addDocument("/ws/flow.puml", "plantuml", SEQ, { active: true });
    state.saveAnswer = (uri) => Uri.file(uri.path);
    await state.commands.get(COMMANDS.renderExcalidraw)();
    const doc = JSON.parse(state.files.get("/ws/flow.excalidraw"));
    assert.equal(doc.type, "excalidraw");
    assert.ok(doc.elements.length > 0);
  });

  it("picks the diagram under the cursor, or asks", async () => {
    const mock = activated();
    const { state, addDocument } = mock;
    state.saveAnswer = (uri) => Uri.file(uri.path);
    addDocument("/ws/two.puml", "plantuml", twoDiagrams, { active: true, line: 6 });
    await state.commands.get(COMMANDS.renderSvg)();
    assert.deepEqual([...state.files.keys()], ["/ws/two-second.svg"]);
    assert.match(state.files.get("/ws/two-second.svg"), /D/);
    assert.equal(state.quickPicks.length, 0);

    state.files.clear();
    state.activeTextEditor = {
      document: state.documents.get("file:///ws/two.puml"),
      selection: { active: new Position(3, 0) },
    };
    state.quickPickAnswer = 0;
    await state.commands.get(COMMANDS.renderSvg)();
    assert.equal(state.quickPicks.length, 1, "between the diagrams the user is asked");
    assert.deepEqual([...state.files.keys()], ["/ws/two-first.svg"]);
  });

  it("renders the Markdown fence under the cursor with its attributes", async () => {
    const { state, addDocument } = activated();
    const text = `${fence("A -> B : one")}\n\`\`\`puml {theme=dark}\nC -> D : two\n\`\`\`\n`;
    addDocument("/ws/doc.md", "markdown", text, { active: true, line: 7 });
    state.saveAnswer = (uri) => Uri.file(uri.path);
    await state.commands.get(COMMANDS.renderSvg)();
    const [name] = [...state.files.keys()];
    assert.match(name, /^\/ws\/doc-diagram-L7\.svg$/);
    assert.match(state.files.get(name), /two/);
    assert.match(state.files.get(name), /#121212/, "fence theme wins over the settings");
  });

  it("works from an Explorer URI without an open editor", async () => {
    const { state, addDocument } = activated();
    const doc = addDocument("/ws/x.puml", "plantuml", SEQ);
    state.saveAnswer = (uri) => Uri.file(uri.path);
    await state.commands.get(COMMANDS.renderSvg)(doc.uri);
    assert.ok(state.files.has("/ws/x.svg"));
  });

  it("reports problems instead of throwing", async () => {
    const { state, addDocument } = activated();
    await state.commands.get(COMMANDS.renderSvg)();
    assert.equal(state.messages.at(-1).level, "warning");

    addDocument("/ws/empty.md", "markdown", "no diagrams", { active: true });
    await state.commands.get(COMMANDS.renderSvg)();
    assert.match(state.messages.at(-1).text, /no plantuml/i);

    addDocument("/ws/notes.txt", "plaintext", "x", { active: true });
    await state.commands.get(COMMANDS.renderSvg)();
    assert.match(state.messages.at(-1).text, /PlantUML files/);

    addDocument("/ws/bad.puml", "plantuml", "@startuml\n!include /etc/passwd\nA -> B\n@enduml", {
      active: true,
    });
    state.saveAnswer = (uri) => Uri.file(uri.path);
    await state.commands.get(COMMANDS.renderSvg)();
    assert.ok(state.files.has("/ws/bad.svg"), "a blocked include is a warning, not a failure");
    assert.doesNotMatch(state.files.get("/ws/bad.svg"), /root:/);

    state.files.clear();
    addDocument("/ws/big.puml", "plantuml", `@startuml\n${"A -> B\n".repeat(10)}@enduml`, {
      active: true,
    });
    state.settings["excaliplant.limits"] = { maxEdges: 1 };
    await state.commands.get(COMMANDS.renderSvg)();
    assert.equal(state.messages.at(-1).level, "error", "limits are passed to the renderer");
    assert.equal(state.files.size, 0);
  });

  it("does nothing when the save dialog is cancelled", async () => {
    const { state, addDocument } = activated();
    addDocument("/ws/flow.puml", "plantuml", SEQ, { active: true });
    await state.commands.get(COMMANDS.renderSvg)();
    assert.equal(state.files.size, 0);
  });
});

describe("replace diagrams in Markdown", () => {
  const text = `# Doc\n\n${fence("A -> B : one")}\n${fence("C -> D : two")}`;

  it("writes SVG files, replaces the blocks and keeps the source", async () => {
    const { state, addDocument } = activated();
    const doc = addDocument("/ws/docs/readme.md", "markdown", text, { active: true });
    await state.commands.get(COMMANDS.replaceInMarkdown)();
    const files = [...state.files.keys()];
    assert.equal(files.length, 2);
    for (const f of files) {
      assert.match(f, /^\/ws\/docs\/assets\/[0-9a-f]{16}\.svg$/);
      assert.match(state.files.get(f), /^<svg/);
    }
    assert.ok(state.dirs.has("/ws/docs/assets"));
    assert.match(doc.text, /!\[[^\]]*\]\(assets\/[0-9a-f]{16}\.svg\)/);
    assert.match(doc.text, /excaliplant:source/);
    assert.doesNotMatch(doc.text, /```plantuml/);
    assert.equal(state.messages.at(-1).level, "info");
  });

  it("refuses an assets folder outside the workspace", async () => {
    const { state, addDocument } = activated({
      settings: { "excaliplant.markdown.assetsDir": "../../../outside" },
    });
    const doc = addDocument("/ws/docs/readme.md", "markdown", text, { active: true });
    await state.commands.get(COMMANDS.replaceInMarkdown)();
    assert.equal(state.files.size, 0);
    assert.equal(doc.text, text, "nothing changes when the folder is refused");
    assert.match(state.messages.at(-1).text, /leaves the workspace/);
  });

  it("reports blocks that fail and leaves them untouched", async () => {
    const { state, addDocument } = activated();
    const doc = addDocument(
      "/ws/a.md",
      "markdown",
      `${fence("A -> B")}\n${fence("A -> B", "plantuml {theme=zzz}")}`,
      { active: true },
    );
    await state.commands.get(COMMANDS.replaceInMarkdown)();
    assert.equal(state.messages.at(-1).level, "warning");
    assert.match(doc.text, /theme=zzz/);
    assert.equal(state.files.size, 1);
  });

  it("is a no-op for a document without diagrams", async () => {
    const { state, addDocument } = activated();
    addDocument("/ws/a.md", "markdown", "# nothing\n", { active: true });
    await state.commands.get(COMMANDS.replaceInMarkdown)();
    assert.equal(state.files.size, 0);
    assert.match(state.messages.at(-1).text, /nothing to replace/);
  });
});

describe("side preview", () => {
  it("opens a locked-down webview with the rendered SVG as an image", async () => {
    const { state, addDocument } = activated();
    addDocument("/ws/flow.puml", "plantuml", SEQ, { active: true });
    await state.commands.get(COMMANDS.openPreviewToSide)();
    const [panel] = state.panels;
    assert.equal(panel.viewType, "excaliplant.preview");
    assert.equal(panel.options.enableScripts, false);
    assert.deepEqual(panel.options.localResourceRoots, []);
    await waitFor(() => panel.webview.html);
    const html = panel.webview.html;
    assert.match(
      html,
      /Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-[\w+/=]+'"/,
    );
    assert.match(html, /<img src="data:image\/svg\+xml;base64,/);
    assert.doesNotMatch(html, /<script|<svg|onerror|unsafe-inline/i);
    const nonce = /nonce-([\w+/=]+)'/.exec(html)[1];
    assert.ok(html.includes(`<style nonce="${nonce}">`));
    const svg = Buffer.from(/base64,([^"]+)"/.exec(html)[1], "base64").toString();
    assert.match(svg, /Alice/);
  });

  it("reuses the panel and updates it while typing", async () => {
    const { state, events, addDocument } = activated();
    const doc = addDocument("/ws/flow.puml", "plantuml", SEQ, { active: true });
    await state.commands.get(COMMANDS.openPreviewToSide)();
    await state.commands.get(COMMANDS.openPreviewToSide)();
    assert.equal(state.panels.length, 1);
    assert.equal(state.panels[0].revealed, 1);
    await waitFor(() => state.panels[0].webview.html);
    const before = state.panels[0].webview.html;
    doc.text = "@startuml\nCarol -> Dave : changed\n@enduml";
    events.changeDoc.fire({ document: doc });
    await waitFor(() => state.panels[0].webview.html !== before);
    const svg = Buffer.from(
      /base64,([^"]+)"/.exec(state.panels[0].webview.html)[1],
      "base64",
    ).toString();
    assert.match(svg, /Carol/);
  });

  it("shows several diagrams and escapes error text", async () => {
    const { state, addDocument } = activated();
    addDocument(
      "/ws/m.puml",
      "plantuml",
      "@startuml a\nA -> B\n@enduml\n@startuml b\nC -> D\n@enduml\n",
      {
        active: true,
      },
    );
    await state.commands.get(COMMANDS.openPreviewToSide)();
    await waitFor(() => state.panels[0].webview.html);
    assert.equal((state.panels[0].webview.html.match(/<img /g) ?? []).length, 2);
    assert.match(state.panels[0].webview.html, /<figcaption>a<\/figcaption>/);

    const body = previewBody([{ error: "<img src=x onerror=alert(1)>", title: "<b>" }]);
    assert.doesNotMatch(body, /<img|<b>/);
    assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
    assert.match(previewHtml("x", "N0nce"), /style-src 'nonce-N0nce'/);
  });

  it("asks for a file when none is open and disposes with the extension", async () => {
    const { state, addDocument, ext } = activated();
    await state.commands.get(COMMANDS.openPreviewToSide)();
    assert.match(state.messages.at(-1).text, /open a PlantUML file/);
    addDocument("/ws/flow.puml", "plantuml", SEQ, { active: true });
    await state.commands.get(COMMANDS.openPreviewToSide)();
    ext.deactivate();
    assert.equal(state.commands.size, 0, "commands are unregistered");
  });
});
