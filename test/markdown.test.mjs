import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  extractBlocks,
  renderBlock,
  renderMarkdown,
  runMarkdownCommand,
  createCache,
  sanitizeSvg,
  blockHash,
  MARKDOWN_LIMITS,
} from "../src/markdown/index.mjs";
import { scanMarkdown, encodeComment, decodeComment } from "../src/markdown/scan.mjs";
import excaliplantPlugin, { prerender } from "../src/markdown/markdown_it.mjs";
import remarkExcaliplant from "../src/markdown/remark.mjs";
import { LimitError } from "../src/core/errors.mjs";

const PUML = "@startuml\nA -> B : hello\n@enduml";
const fenced = (/** @type {string} */ body, lang = "plantuml", fence = "```") =>
  `${fence}${lang}\n${body}\n${fence}`;

// --- extractBlocks ---------------------------------------------------------

test("extractBlocks finds backtick and tilde fences with offsets", () => {
  const md = `# T\n\n${fenced(PUML)}\n\ntext\n\n${fenced("A -> C", "puml", "~~~~")}\n`;
  const blocks = extractBlocks(md);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].lang, "plantuml");
  assert.equal(blocks[0].source, PUML);
  assert.equal(blocks[0].fence, "```");
  assert.equal(md.slice(blocks[0].start, blocks[0].end), fenced(PUML));
  assert.equal(blocks[0].line, 3);
  assert.equal(blocks[1].lang, "puml");
  assert.equal(blocks[1].fence, "~~~~");
  assert.equal(blocks[1].source, "A -> C");
});

test("extractBlocks accepts uml, mixed case and ignores other languages", () => {
  const md = [fenced("A -> B", "UML"), fenced("let x", "js"), fenced("A -> C", "PlantUML")].join(
    "\n\n",
  );
  assert.deepEqual(
    extractBlocks(md).map((b) => b.lang),
    ["uml", "plantuml"],
  );
});

test("extractBlocks handles fence length, nesting and examples", () => {
  const inner = "```plantuml\nA -> B\n```";
  const md = `${fenced(inner, "markdown", "````")}\n\n${fenced("X -> Y")}\n`;
  const blocks = extractBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].source, "X -> Y");
  // A shorter closing fence does not close a longer opener.
  const long = "````plantuml\nA -> B\n```\nstill inside\n````";
  const b = extractBlocks(long);
  assert.equal(b.length, 1);
  assert.equal(b[0].source, "A -> B\n```\nstill inside");
  // Closing fence must use the same character.
  assert.equal(extractBlocks("```plantuml\nA -> B\n~~~\n```").length, 1);
});

test("extractBlocks: indentation, unclosed fences and invalid openers", () => {
  assert.equal(extractBlocks("   ```plantuml\n   A -> B\n   ```").length, 1);
  assert.equal(extractBlocks("   ```plantuml\n   A -> B\n   ```")[0].source, "A -> B");
  assert.equal(extractBlocks("    ```plantuml\n    A -> B\n    ```").length, 0);
  assert.equal(extractBlocks("```plantuml\nA -> B\n").length, 0);
  assert.equal(extractBlocks("``` plantuml`x\nA\n```").length, 0);
  assert.equal(extractBlocks("``plantuml\nA\n``").length, 0);
  assert.equal(extractBlocks("").length, 0);
});

test("extractBlocks: CRLF input and no trailing newline", () => {
  const md = "```plantuml\r\nA -> B\r\n```";
  const [b] = extractBlocks(md);
  assert.equal(b.source, "A -> B");
  assert.equal(md.slice(b.start, b.end), md);
});

test("extractBlocks parses info-string attributes", () => {
  const md =
    '```plantuml {theme=dark clean seed=abc width=600 alt="Login flow, v2"}\nA -> B\n```\n' +
    "```puml theme=mono width=99999\nA\n```\n" +
    "```plantuml{clean=false}\nA\n```\n";
  const [a, b, c] = extractBlocks(md);
  assert.deepEqual(a.attrs, {
    theme: "dark",
    clean: true,
    seed: "abc",
    width: 600,
    alt: "Login flow, v2",
  });
  assert.equal(b.attrs.theme, "mono");
  assert.equal(b.attrs.width, 16000);
  assert.equal(c.attrs.clean, false);
  assert.throws(() => extractBlocks(/** @type {any} */ (42)), TypeError);
});

test("comment encoding round-trips and never contains --", () => {
  const samples = ["a --> b", "<!-- x -->", "--!>", "100%25 %2D % --", "- -- ---", "%", "%2", ""];
  for (const s of samples) {
    const enc = encodeComment(s);
    assert.ok(!enc.includes("--"), enc);
    assert.equal(decodeComment(enc), s);
  }
});

// --- cache -----------------------------------------------------------------

test("createCache is an LRU with deterministic eviction", () => {
  const c = createCache({ max: 2 });
  c.set("a", 1);
  c.set("b", 2);
  assert.equal(c.get("a"), 1); // a is now most recent
  c.set("c", 3); // evicts b
  assert.equal(c.has("b"), false);
  assert.equal(c.has("a"), true);
  assert.equal(c.size, 2);
  c.clear();
  assert.equal(c.size, 0);
});

test("cache memo shares in-flight work", async () => {
  const c = createCache();
  let runs = 0;
  const produce = async () => {
    runs++;
    return "v";
  };
  const [x, y] = await Promise.all([c.memo("k", produce), c.memo("k", produce)]);
  assert.equal(x, "v");
  assert.equal(y, "v");
  assert.equal(runs, 1);
  await c.memo("k", produce);
  assert.equal(runs, 1);
});

// --- renderBlock -----------------------------------------------------------

test("renderBlock returns sanitised SVG and a stable hash", async () => {
  const cache = createCache();
  const a = await renderBlock(PUML, { cache });
  assert.equal(a.error, undefined);
  assert.match(a.svg ?? "", /^<svg /);
  assert.match(a.hash, /^[0-9a-f]{16}$/);
  const b = await renderBlock(PUML, { cache });
  assert.equal(b.svg, a.svg);
  assert.equal(b.hash, a.hash);
  assert.equal(cache.size, 1);
  assert.equal(a.hash, blockHash(PUML));
  // Options are part of the key.
  assert.notEqual((await renderBlock(PUML, { cache, theme: "dark" })).hash, a.hash);
  assert.notEqual((await renderBlock(PUML, { cache, clean: true })).hash, a.hash);
  assert.notEqual((await renderBlock(`${PUML}\n`, { cache })).hash, a.hash);
  assert.equal(cache.size, 4);
});

test("renderBlock output is deterministic across caches", async () => {
  const one = await renderBlock(PUML, { cache: createCache() });
  const two = await renderBlock(PUML, { cache: false });
  assert.equal(one.svg, two.svg);
});

test("renderBlock never throws", async () => {
  const bad = await renderBlock("@startuml\nA -> B\n@enduml", { theme: "nope", cache: false });
  assert.match(bad.error ?? "", /Unknown theme/);
  const big = await renderBlock("@startuml\nA -> B\n@enduml", {
    limits: { maxInputBytes: 4 },
    cache: false,
  });
  assert.match(big.error ?? "", /exceeds/);
  const strict = await renderBlock("@startuml\nthis is nonsense ((\n@enduml", {
    strict: true,
    cache: false,
  });
  assert.ok(strict.error);
  const nonString = await renderBlock(/** @type {any} */ (null));
  assert.ok(nonString.error);
});

test("renderBlock width rescales the root element", async () => {
  const r = await renderBlock(PUML, { width: 300, cache: false });
  assert.match(r.svg ?? "", /^<svg [^>]*width="300"/);
});

test("renderBlock does not cache results that depend on an anonymous include resolver", async () => {
  const cache = createCache();
  let content = "class First";
  const include = () => content;
  const src = "@startuml\n!include x\n@enduml";
  const a = await renderBlock(src, { include });
  content = "class Second";
  const b = await renderBlock(src, { include });
  assert.notEqual(a.svg, b.svg);
  const k = await renderBlock(src, { include, includeKey: "v1", cache });
  assert.ok(k.svg);
});

// --- sanitizer -------------------------------------------------------------

test("sanitizeSvg removes scripts, handlers and external references", () => {
  const dirty =
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 10 10" width="10" height="10">' +
    '<script>alert(1)</script><foreignObject><div onclick="x()">hi</div></foreignObject>' +
    '<image href="https://evil.example/x.png"/><use href="#a"/>' +
    '<rect x="1" y="1" width="2" height="2" fill="url(https://evil.example/f)" style="x:y" onclick="a()"/>' +
    '<a href="javascript:alert(1)"><text x="1" y="1">a &amp; b &bogus; <b>x</b></text></a>' +
    '<a xlink:href="https://ok.example/"><path d="M0 0L1 1"/></a>' +
    "<style>@import url(https://evil.example/a.css);text{fill:red;font-family:Excalifont}</style>" +
    "<!-- c --></svg><svg><g/></svg>";
  const out = sanitizeSvg(dirty);
  assert.doesNotMatch(
    out,
    /script|onload|onclick|foreignObject|<image|<use|javascript|evil|@import/i,
  );
  assert.doesNotMatch(out, /style="/);
  assert.match(out, /<a xlink:href="https:\/\/ok\.example\/">/);
  assert.match(out, /a &amp; b &amp;bogus;/);
  assert.match(out, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(out, /<svg[^>]*>[^]*<svg/);
});

test("sanitizeSvg keeps only the font-face and scoped text rule of the stylesheet", async () => {
  const r = await renderBlock(PUML, { scope: ".excaliplant", cache: false });
  assert.match(
    r.svg ?? "",
    /<style>@font-face\{font-family:"Excalifont";src:url\(data:font\/woff2;base64,/,
  );
  assert.match(r.svg ?? "", /\.excaliplant text\{font-family:/);
  assert.doesNotMatch(r.svg ?? "", /https?:\/\/(?!www\.w3\.org)/);
});

test("sanitizeSvg rejects documents without an svg root", () => {
  assert.throws(() => sanitizeSvg("<div>no</div>"));
  assert.throws(() => sanitizeSvg(/** @type {any} */ (1)), TypeError);
});

// --- renderMarkdown --------------------------------------------------------

test("renderMarkdown replaces fences with inline SVG", async () => {
  const md = `# Title\n\n${fenced(PUML)}\n\nafter\n`;
  const { markdown, blocks, changed } = await renderMarkdown(md, { cache: createCache() });
  assert.equal(changed, true);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].replaced, true);
  assert.match(
    markdown,
    /^# Title\n\n<div class="excaliplant" role="img" aria-label="PlantUML diagram"><svg /,
  );
  assert.match(markdown, /<\/svg><\/div>\n\nafter\n$/);
  assert.equal(extractBlocks(markdown).length, 0);
  assert.doesNotMatch(markdown, /\n\n\n/);
  // SVG must not contain blank lines (they would end the HTML block).
  const html = markdown.split("\n").find((l) => l.startsWith("<div class"));
  assert.ok(html?.endsWith("</div>"));
});

test("renderMarkdown inserts a blank line when text follows directly", async () => {
  const { markdown } = await renderMarkdown(`${fenced(PUML)}\nnext line\n`, {
    cache: createCache(),
  });
  assert.match(markdown, /<\/div>\n\nnext line\n$/);
});

test("renderMarkdown is idempotent without keepSource", async () => {
  const cache = createCache();
  const once = await renderMarkdown(`a\n\n${fenced(PUML)}\n\nb\n`, { cache });
  const twice = await renderMarkdown(once.markdown, { cache });
  assert.equal(twice.markdown, once.markdown);
  assert.equal(twice.changed, false);
  assert.equal(twice.blocks.length, 0);
});

test("renderMarkdown keepSource regions re-render to identical output", async () => {
  const cache = createCache();
  const src = `intro\n\n${fenced(PUML)}\n\n${fenced("A -> C : two", "puml")}\n\noutro\n`;
  const a = await renderMarkdown(src, { keepSource: true, cache });
  assert.equal(a.blocks.length, 2);
  assert.match(a.markdown, /<!-- excaliplant:begin hash=[0-9a-f]{16} -->/);
  assert.match(a.markdown, /<!-- excaliplant:end -->/);
  assert.equal(extractBlocks(a.markdown).length, 0);
  const b = await renderMarkdown(a.markdown, { keepSource: true, cache: createCache() });
  assert.equal(b.markdown, a.markdown);
  assert.equal(b.blocks.length, 2);
  assert.equal(b.blocks[0].kind, "region");
  // Re-rendering without the option still keeps regions as they are.
  const c = await renderMarkdown(a.markdown, { cache });
  assert.equal(c.markdown, a.markdown);
});

test("keepSource is safe against --> and <!-- in the source", async () => {
  const hostile = '@startuml\nnote right: x --> y <!-- z --!> w\nA -> B : "-->"\n@enduml';
  const md = fenced(hostile);
  const { markdown } = await renderMarkdown(md, { keepSource: true, cache: createCache() });
  // Only the marker lines and the source terminator may close a comment.
  for (const line of markdown.split("\n")) {
    if (line.includes("-->")) {
      assert.ok(/^<!-- excaliplant:(begin|end)/.test(line) || line === "-->", line);
    }
  }
  const items = scanMarkdown(markdown);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "region");
  assert.equal(items[0].source, hostile);
  const again = await renderMarkdown(markdown, { keepSource: true, cache: createCache() });
  assert.equal(again.markdown, markdown);
});

test("keepSource details shows the source in a collapsible block", async () => {
  const body = "@startuml\nA -> B : ```tick```\n@enduml";
  const cache = createCache();
  const a = await renderMarkdown(fenced(body), { keepSource: "details", cache });
  assert.match(a.markdown, /<details>\n<summary>PlantUML source<\/summary>/);
  assert.match(a.markdown, /````plantuml\n@startuml/);
  assert.equal(extractBlocks(a.markdown).length, 0);
  const b = await renderMarkdown(a.markdown, { cache });
  assert.equal(b.markdown, a.markdown);
});

test("keepSource preserves info attributes for re-rendering", async () => {
  const cache = createCache();
  const md = '```plantuml {theme=dark alt="Dark one"}\nA -> B\n```\n';
  const a = await renderMarkdown(md, { keepSource: true, cache });
  assert.match(a.markdown, /aria-label="Dark one"/);
  assert.match(a.markdown, /<!-- excaliplant:source plantuml \{theme=dark alt="Dark one"\}\n/);
  const b = await renderMarkdown(a.markdown, { cache });
  assert.equal(b.markdown, a.markdown);
});

test("renderMarkdown file mode links assets and passes them to writeFile", async () => {
  /** @type {Map<string, string>} */
  const written = new Map();
  const cache = createCache();
  const md = `${fenced(PUML)}\n\n${fenced(PUML)}\n\n${fenced("A -> Z", "plantuml", "~~~")}\n`;
  const r = await renderMarkdown(md, {
    mode: "file",
    assetsDir: "img/diagrams",
    cache,
    writeFile: (name, data) => void written.set(name, data),
  });
  const links = [
    ...r.markdown.matchAll(/!\[PlantUML diagram\]\((img\/diagrams\/[0-9a-f]{16}\.svg)\)/g),
  ];
  assert.equal(links.length, 3);
  assert.equal(links[0][1], links[1][1]); // same content, same file
  assert.equal(written.size, 2);
  assert.deepEqual([...written.keys()].sort(), r.assets.map((a) => a.name).sort());
  for (const data of written.values()) assert.match(data, /^<svg /);
  assert.doesNotMatch(r.markdown, /<svg/);
  const again = await renderMarkdown(r.markdown, { mode: "file", cache });
  assert.equal(again.markdown, r.markdown);
});

test("file mode rejects unsafe asset directories", async () => {
  for (const dir of ["/abs", "C:\\x", "a\\b", "x?y", "x#y"]) {
    await assert.rejects(
      renderMarkdown(fenced(PUML), { mode: "file", assetsDir: dir }),
      RangeError,
    );
  }
  await assert.rejects(
    renderMarkdown(fenced(PUML), { mode: "file", assetsUrl: "javascript:alert(1)" }),
    RangeError,
  );
  await assert.rejects(renderMarkdown("x", { mode: /** @type {any} */ ("zip") }), TypeError);
});

test("failed blocks stay untouched and are reported", async () => {
  const bad = fenced("@startuml\nA -> B\n@enduml", "plantuml {theme=nope}");
  const md = `${bad}\n\n${fenced(PUML)}\n`;
  const r = await renderMarkdown(md, { cache: createCache() });
  assert.equal(r.blocks.length, 2);
  assert.match(r.blocks[0].error ?? "", /Unknown theme/);
  assert.equal(r.blocks[0].replaced, false);
  assert.ok(r.markdown.startsWith(bad));
  assert.equal(r.blocks[1].error, undefined);
});

test("block, source and document budgets are enforced", async () => {
  const cache = createCache();
  const md = [1, 2, 3].map((i) => fenced(`A -> B${i}`)).join("\n\n");
  const r = await renderMarkdown(md, { cache, budget: { maxBlocks: 1 } });
  assert.equal(r.blocks.filter((b) => b.error === undefined).length, 1);
  assert.match(r.blocks[2].error ?? "", /budget/);
  assert.equal(extractBlocks(r.markdown).length, 2);
  const s = await renderMarkdown(md, { cache, budget: { maxTotalSourceBytes: 10 } });
  assert.ok(s.blocks.some((b) => /Source budget/.test(b.error ?? "")));
  await assert.rejects(
    renderMarkdown("x".repeat(100), { budget: { maxDocumentBytes: 10 } }),
    LimitError,
  );
  assert.equal(MARKDOWN_LIMITS.maxBlocks, 50);
  // Overrides cannot exceed the hard ceiling.
  const big = await renderMarkdown("x", { budget: { maxBlocks: 1e9 } });
  assert.equal(big.changed, false);
});

test("renderMarkdown keeps CRLF line endings and untouched text", async () => {
  const md = `head\r\n\r\n\`\`\`plantuml\r\n${PUML.replaceAll("\n", "\r\n")}\r\n\`\`\`\r\n\r\ntail\r\n`;
  const r = await renderMarkdown(md, { keepSource: true, cache: createCache() });
  assert.ok(r.markdown.startsWith("head\r\n\r\n<!-- excaliplant:begin"));
  assert.ok(r.markdown.endsWith("<!-- excaliplant:end -->\r\n\r\ntail\r\n"));
  assert.equal(scanMarkdown(r.markdown)[0].source, PUML);
});

test("fences inside examples and regions are never rendered twice", async () => {
  const example = fenced(`${fenced(PUML)}`, "markdown", "````");
  const r = await renderMarkdown(`${example}\n`, { cache: createCache() });
  assert.equal(r.changed, false);
  assert.equal(r.blocks.length, 0);
});

test("font is embedded once per document in inline mode", async () => {
  const cache = createCache();
  const md = `${fenced("A -> B : one")}\n\n${fenced("A -> B : two")}\n`;
  const r = await renderMarkdown(md, { cache });
  assert.equal(r.markdown.split("@font-face").length - 1, 1);
  const all = await renderMarkdown(md, { cache, shareFont: false });
  assert.equal(all.markdown.split("@font-face").length - 1, 2);
});

// --- markdown-it -----------------------------------------------------------

/** Minimal markdown-it stand-in: fences only, same renderer-rule contract. */
function mockMarkdownIt() {
  /** @type {any} */
  const md = {
    renderer: {
      rules: {
        fence: (/** @type {any[]} */ tokens, /** @type {number} */ idx) =>
          `<pre><code>${tokens[idx].content}</code></pre>\n`,
      },
    },
    parse(/** @type {string} */ text) {
      const tokens = [];
      for (const b of extractBlocks(text)) {
        tokens.push({ type: "fence", info: b.info, content: `${b.source}\n` });
      }
      // Plain fences of other languages are also tokens in real markdown-it.
      const other = /```js\n([^]*?)\n```/g;
      for (const m of text.matchAll(other)) {
        tokens.push({ type: "fence", info: "js", content: `${m[1]}\n` });
      }
      return tokens;
    },
    render(/** @type {string} */ text, env = {}) {
      return md
        .parse(text)
        .map((/** @type {any} */ t, /** @type {number} */ i, /** @type {any[]} */ all) =>
          md.renderer.rules.fence(all, i, {}, env, md),
        )
        .join("");
    },
  };
  return md;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("markdown-it: cache miss gives a placeholder, then the SVG", async () => {
  const md = mockMarkdownIt();
  /** @type {string[]} */
  const done = [];
  excaliplantPlugin(md, { cache: createCache(), onRendered: (h) => done.push(h) });
  const text = fenced("A -> B : mdit");
  const first = md.render(text);
  const m =
    /^<div class="excaliplant excaliplant-pending" data-excaliplant-hash="([0-9a-f]{16})"><\/div>\n$/.exec(
      first,
    );
  assert.ok(m, first);
  // Rendering twice while pending does not start more work.
  md.render(text);
  for (let i = 0; i < 200 && done.length === 0; i++) await new Promise((r) => setTimeout(r, 25));
  assert.ok(done.length >= 1);
  assert.equal(done[0], m[1]);
  await settle();
  const second = md.render(text);
  assert.match(second, /^<div class="excaliplant" role="img" aria-label="PlantUML diagram"><svg /);
  assert.ok(second.endsWith("</div>\n"));
});

test("markdown-it: prerender makes the synchronous render complete", async () => {
  const md = mockMarkdownIt();
  excaliplantPlugin(md, { cache: createCache() });
  const text = `${fenced("A -> B : pre1")}\n\n${fenced("A -> B : pre2", "puml {theme=dark}")}\n`;
  const results = await prerender(md, text);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.svg));
  const html = md.render(text);
  assert.doesNotMatch(html, /pending/);
  assert.equal(html.split("<svg ").length - 1, 2);
  assert.equal(html.split("@font-face").length - 1, 1);
});

test("markdown-it: other fences use the previous rule; errors show a box", async () => {
  const md = mockMarkdownIt();
  excaliplantPlugin(md, { cache: createCache(), theme: "bogus" });
  assert.equal(md.render("```js\nlet x\n```"), "<pre><code>let x\n</code></pre>\n");
  await prerender(md, fenced("A -> B"));
  const html = md.render(fenced("A -> B"));
  assert.match(html, /^<pre class="excaliplant-error" role="alert">PlantUML error: Unknown theme/);
  await assert.rejects(prerender(/** @type {any} */ ({}), "x"), /not installed/);
  assert.throws(() => excaliplantPlugin(/** @type {any} */ (null)), TypeError);
});

test("markdown-it: per-document block budget applies", async () => {
  const md = mockMarkdownIt();
  excaliplantPlugin(md, { cache: createCache(), budget: { maxBlocks: 1 } });
  const text = `${fenced("A -> B : b1")}\n\n${fenced("A -> B : b2")}\n`;
  const html = md.render(text);
  assert.match(html, /Block budget exceeded/);
});

// --- remark ----------------------------------------------------------------

const codeNode = (/** @type {string} */ value, lang = "plantuml", meta = null) => ({
  type: "code",
  lang,
  meta,
  value,
  position: { start: { line: 1, column: 1 }, end: { line: 3, column: 4 } },
});

test("remark: code nodes become html nodes (also nested)", async () => {
  const nested = codeNode("A -> B : nested", "puml");
  const tree = {
    type: "root",
    children: [
      codeNode("A -> B : top"),
      codeNode("let x", "js"),
      { type: "blockquote", children: [{ type: "list", children: [nested] }] },
    ],
  };
  /** @type {any[]} */
  const messages = [];
  const run = remarkExcaliplant({ cache: createCache() });
  await run(tree, { message: (/** @type {string} */ m) => messages.push(m) });
  assert.equal(tree.children[0].type, "html");
  assert.match(/** @type {any} */ (tree.children[0]).value, /^<div class="excaliplant"[^>]*><svg /);
  assert.equal(tree.children[1].type, "code");
  assert.equal(nested.type, "html");
  assert.ok(/** @type {any} */ (tree.children[0]).position);
  // Only the first diagram embeds the font.
  assert.equal(/** @type {any} */ (nested).value.includes("@font-face"), false);
  assert.deepEqual(messages, []);
});

test("remark: meta attributes and file mode with writeFile", async () => {
  /** @type {Map<string, string>} */
  const written = new Map();
  const node = codeNode("A -> B : file", "plantuml", 'theme=dark alt="Flow"');
  const tree = { type: "root", children: [node] };
  await remarkExcaliplant({
    mode: "file",
    assetsDir: "static/img/uml",
    assetsUrl: "/img/uml",
    writeFile: (name, data) => void written.set(name, data),
    cache: createCache(),
  })(tree);
  const p = /** @type {any} */ (tree.children[0]);
  assert.equal(p.type, "paragraph");
  assert.equal(p.children[0].type, "image");
  assert.equal(p.children[0].alt, "Flow");
  assert.match(p.children[0].url, /^\/img\/uml\/[0-9a-f]{16}\.svg$/);
  const [name] = [...written.keys()];
  assert.match(name, /^static\/img\/uml\/[0-9a-f]{16}\.svg$/);
  assert.ok(name.endsWith(p.children[0].url.slice("/img/uml/".length)));
});

test("remark: errors become boxes, can be kept or thrown", async () => {
  const mk = () => ({ type: "root", children: [codeNode("A -> B", "plantuml", "theme=nope")] });
  const messages = /** @type {string[]} */ ([]);
  const file = { message: (/** @type {string} */ m) => messages.push(m) };
  const t1 = mk();
  await remarkExcaliplant({ cache: createCache() })(t1, file);
  assert.match(/** @type {any} */ (t1.children[0]).value, /excaliplant-error/);
  assert.equal(messages.length, 1);
  const t2 = mk();
  await remarkExcaliplant({ cache: createCache(), onError: "keep" })(t2);
  assert.equal(t2.children[0].type, "code");
  await assert.rejects(
    remarkExcaliplant({ cache: createCache(), onError: "throw" })(mk()),
    /Unknown theme/,
  );
  assert.throws(() => remarkExcaliplant({ mode: /** @type {any} */ ("x") }), TypeError);
  await assert.rejects(
    remarkExcaliplant({ mode: "file", cache: createCache() })({
      type: "root",
      children: [codeNode("A -> B : nowrite")],
    }),
    /writeFile/,
  );
});

test("remark: very deep trees do not overflow the stack", async () => {
  /** @type {any} */
  let node = { type: "root", children: [] };
  const root = node;
  for (let i = 0; i < 50_000; i++) {
    const child = { type: "blockquote", children: [] };
    node.children.push(child);
    node = child;
  }
  node.children.push(codeNode("A -> B : deep"));
  await remarkExcaliplant({ cache: createCache() })(root);
  assert.equal(node.children[0].type, "html");
});

// --- runMarkdownCommand ----------------------------------------------------

/**
 * @param {Record<string, string>} files
 * @param {{ stdin?: string }} [opts]
 */
function fakeIo(files, opts = {}) {
  const fs = new Map(Object.entries(files));
  const out = { stdout: "", stderr: "" };
  const io = {
    fs,
    out,
    readFile: async (/** @type {string} */ f) => {
      if (!fs.has(f)) throw new Error(`ENOENT ${f}`);
      return /** @type {string} */ (fs.get(f));
    },
    writeFile: async (/** @type {string} */ f, /** @type {string} */ d) => void fs.set(f, d),
    readStdin: async () => opts.stdin ?? "",
    stdout: { write: (/** @type {string} */ s) => void (out.stdout += s) },
    stderr: { write: (/** @type {string} */ s) => void (out.stderr += s) },
  };
  return io;
}

test("markdown command: stdout, -o, --in-place and --check", async () => {
  const doc = `# D\n\n${fenced(PUML)}\n`;
  const io = fakeIo({ "doc.md": doc });
  assert.equal(await runMarkdownCommand(["doc.md"], io), 0);
  assert.match(io.out.stdout, /<div class="excaliplant"/);
  assert.equal(io.fs.get("doc.md"), doc);

  assert.equal(await runMarkdownCommand(["doc.md", "-o", "out/doc.md"], io), 0);
  assert.match(io.fs.get("out/doc.md") ?? "", /<svg /);
  assert.doesNotMatch(io.fs.get("out/doc.md") ?? "", /excaliplant:source/);

  // --check against the output file: up to date, then stale.
  assert.equal(await runMarkdownCommand(["doc.md", "-o", "out/doc.md", "--check"], io), 0);
  io.fs.set("out/doc.md", "stale");
  assert.equal(await runMarkdownCommand(["doc.md", "-o", "out/doc.md", "--check"], io), 1);
  assert.match(io.out.stderr, /out\/doc\.md: out of date/);
  assert.equal(io.fs.get("out/doc.md"), "stale"); // --check never writes

  // In-place keeps the source; --check passes afterwards.
  assert.equal(await runMarkdownCommand(["doc.md", "--check"], io), 1);
  assert.equal(await runMarkdownCommand(["doc.md", "--in-place"], io), 0);
  const rewritten = io.fs.get("doc.md") ?? "";
  assert.match(rewritten, /<!-- excaliplant:begin/);
  assert.equal(await runMarkdownCommand(["doc.md", "--check"], io), 0);
  assert.equal(await runMarkdownCommand(["-i", "doc.md"], io), 0);
  assert.equal(io.fs.get("doc.md"), rewritten);
});

test("markdown command: file mode writes assets next to the output", async () => {
  const io = fakeIo({ "docs/a.md": fenced(PUML) });
  const code = await runMarkdownCommand(
    ["docs/a.md", "-o", "site/a.md", "--mode", "file", "--assets-dir=img"],
    io,
  );
  assert.equal(code, 0, io.out.stderr);
  const md = io.fs.get("site/a.md") ?? "";
  const m = /\]\(img\/([0-9a-f]{16})\.svg\)/.exec(md);
  assert.ok(m, md);
  assert.match(io.fs.get(path.join("site", "img", `${m[1]}.svg`)) ?? "", /^<svg /);
  // Check fails when the asset is missing.
  io.fs.delete(path.join("site", "img", `${m[1]}.svg`));
  assert.equal(
    await runMarkdownCommand(
      ["docs/a.md", "-o", "site/a.md", "--mode", "file", "--assets-dir", "img", "--check"],
      io,
    ),
    1,
  );
});

test("markdown command: stdin, options and several files", async () => {
  const io = fakeIo({ "x.md": fenced(PUML), "y.md": "no diagrams\n" }, { stdin: fenced(PUML) });
  assert.equal(
    await runMarkdownCommand(["-", "--theme", "dark", "--clean", "--width", "300"], io),
    0,
  );
  assert.match(io.out.stdout, /^<div class="excaliplant"[^>]*><svg [^>]*width="300"/);
  assert.equal(await runMarkdownCommand(["-i", "x.md", "y.md"], io), 0);
  assert.equal(io.fs.get("y.md"), "no diagrams\n");
  assert.match(io.fs.get("x.md") ?? "", /excaliplant:begin/);
  assert.equal(await runMarkdownCommand(["--check", "x.md", "y.md"], io), 0);
  // `--` ends option parsing.
  const dash = fakeIo({ "-weird.md": "plain\n" });
  assert.equal(await runMarkdownCommand(["--check", "--", "-weird.md"], dash), 0);
});

test("markdown command: render errors give exit code 1 and a located message", async () => {
  const doc = `a\n\n${fenced("@startuml\nA -> B\n@enduml", "plantuml {theme=nope}")}\n`;
  const io = fakeIo({ "bad.md": doc });
  assert.equal(await runMarkdownCommand(["bad.md"], io), 1);
  assert.match(io.out.stderr, /^bad\.md:3: error: Unknown theme/);
  assert.equal(io.out.stdout, doc); // failed fences stay as written
  const missing = fakeIo({});
  assert.equal(await runMarkdownCommand(["nope.md"], missing), 1);
  assert.match(missing.out.stderr, /nope\.md: error: ENOENT/);
});

test("markdown command: usage errors give exit code 2", async () => {
  const cases = [
    [],
    ["--bogus", "a.md"],
    ["a.md", "--mode", "zip"],
    ["a.md", "--theme", "nope"],
    ["a.md", "--width", "5"],
    ["a.md", "-o"],
    ["a.md", "b.md", "-o", "c.md"],
    ["a.md", "b.md"],
    ["a.md", "-o", "b.md", "-i"],
    ["-", "--check"],
  ];
  for (const argv of cases) {
    const io = fakeIo({ "a.md": "x", "b.md": "y" });
    assert.equal(await runMarkdownCommand(argv, io), 2, argv.join(" "));
    assert.match(io.out.stderr, /excaliplant markdown:/);
  }
  const io = fakeIo({});
  assert.equal(await runMarkdownCommand(["--help"], io), 0);
  assert.match(io.out.stdout, /Usage:/);
});

test("file mode produces portable assets for root and nested Markdown", async (t) => {
  const { promises: fs } = await import("node:fs");
  const dir = mkdtempSync(path.join(tmpdir(), "excaliplant-md-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "README.md");
  const nested = path.join(dir, "docs", "reference", "guide.md");
  mkdirSync(path.dirname(nested), { recursive: true });
  writeFileSync(file, `# R\n\n${fenced(PUML)}\n`);
  writeFileSync(nested, `# Guide\n\n${fenced(PUML)}\n`);
  const errors = [];
  const io = {
    readFile: (/** @type {string} */ f) => fs.readFile(f, "utf8"),
    writeFile: async (/** @type {string} */ f, /** @type {string} */ d) => {
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, d);
    },
    stdout: process.stdout,
    stderr: { write: (/** @type {string} */ text) => errors.push(text) },
  };
  const args = [file, nested, "--mode", "file"];
  assert.equal(await runMarkdownCommand([...args, "--in-place"], io), 0);
  const assets = [file, nested].map((doc) => {
    const text = readFileSync(doc, "utf8");
    const match = /!\[[^\]]+\]\((assets\/[0-9a-f]{16}\.svg)\)/.exec(text);
    assert.ok(match, doc);
    return path.join(path.dirname(doc), match[1]);
  });
  const svg = readFileSync(assets[0], "utf8");
  assert.match(svg, /^<svg/);
  assert.match(svg, /@font-face/);
  assert.equal(readFileSync(assets[1], "utf8"), svg);
  assert.equal(await runMarkdownCommand([...args, "--check"], io), 0);
  await fs.unlink(assets[1]);
  assert.equal(await runMarkdownCommand([...args, "--check"], io), 1);
  assert.match(errors.join(""), /guide\.md: out of date/);
  assert.equal(existsSync(assets[1]), false);
});
