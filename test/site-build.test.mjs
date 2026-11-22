// Build tests for the GitHub Pages site: the build script, the static output
// (no external requests, strict CSP, relative URLs) and the worker bundle,
// which has to run without any Node global.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.SITE_VERSION = "7.8.9"; // no registry lookup in tests
const { buildSite } = await import(pathToFileURL(path.join(root, "scripts", "site.mjs")).href);
const { loadExamples } = await import(
  pathToFileURL(path.join(root, "scripts", "showcase.mjs")).href
);

const out = mkdtempSync(path.join(os.tmpdir(), "excaliplant-site-"));
test.after(() => rmSync(out, { recursive: true, force: true }));
const read = (/** @type {string} */ f) => readFileSync(path.join(out, f), "utf8");

let built;
test("scripts/site.mjs builds the whole site", async () => {
  built = await buildSite(out);
  const examples = loadExamples();
  assert.equal(built.slides, examples.length);
  for (const f of ["index.html", "app.js", "worker.js", "boot.js", "styles.css", ".nojekyll"]) {
    assert.ok(existsSync(path.join(out, f)), f);
  }
  // Existing gallery URLs keep working.
  for (const ex of examples) {
    for (const ext of ["svg", "excalidraw", "puml"]) {
      assert.ok(
        existsSync(path.join(out, "d", ex.kind, `${ex.name}.${ext}`)),
        `${ex.kind}/${ex.name}.${ext}`,
      );
    }
  }
  assert.equal(
    read("d/sequence/checkout-flow.puml"),
    examples.find((e) => e.name === "checkout-flow").source,
  );
  assert.match(read("d/sequence/checkout-flow.svg"), /^<svg /);
});

test("the page shows the version and has no unresolved placeholders", () => {
  const html = read("index.html");
  assert.match(html, />v7\.8\.9</);
  assert.match(html, /npmjs\.com\/package\/@grethel-labs\/excaliplant\/v\/7\.8\.9/);
  assert.ok(!/\{\{|\}\}/.test(html));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
});

/** All absolute http(s) URLs in a text. */
const urls = (/** @type {string} */ text) =>
  [...text.matchAll(/https?:\/\/[^\s"'<>)\\`]+/g)].map((m) => m[0]);

test("no external URLs in HTML, CSS and page scripts, except project links", () => {
  const allowed = [
    /^https:\/\/github\.com\/grethel-labs\/excaliplant(\/|#|$)/,
    /^https:\/\/www\.npmjs\.com\/package\/@grethel-labs\/excaliplant(\/|$)/,
    /^https:\/\/grethel-labs\.github\.io\/excaliplant\/?$/,
    /^http:\/\/www\.w3\.org\/2000\/svg$/, // XML namespace, never fetched
  ];
  for (const f of ["index.html", "styles.css", "app.js", "boot.js"]) {
    for (const u of urls(read(f))) {
      assert.ok(
        allowed.some((re) => re.test(u)),
        `${f} references ${u}`,
      );
    }
  }
  // The library bundle only carries XML namespace identifiers and comments.
  for (const u of urls(read("worker.js"))) {
    assert.ok(
      allowed.some((re) => re.test(u)) ||
        /^http:\/\/www\.(w3|eclipse)\.org\//.test(u) ||
        /^http:\/\/\/org\/eclipse\//.test(u),
      `worker.js references ${u}`,
    );
  }
  assert.ok(!/@import|url\(\s*["']?https?:/.test(read("styles.css")), "no remote CSS");
});

test("static output: relative URLs, strict CSP, no inline code", () => {
  const html = read("index.html");
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";
  for (const want of [
    "default-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "worker-src 'self' blob:",
  ]) {
    assert.ok(csp.includes(want), `CSP has ${want}`);
  }
  assert.ok(!csp.includes("unsafe-inline") && !csp.includes("unsafe-eval"));
  assert.ok(!/ \*|https?:/.test(csp), "CSP names no remote origin");
  // Scripts and styles are files; no inline script, style attribute or handler.
  assert.ok(!/<script(?![^>]*\bsrc=)/i.test(html), "no inline script");
  assert.ok(!/\sstyle=/i.test(html), "no style attributes");
  assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<meta[^>]*>/g, "")), "no inline handlers");
  assert.ok(!/<style/i.test(html));
  for (const [, ref] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^(https:|#|data:)/.test(ref)) continue;
    assert.ok(!ref.startsWith("/"), `root-relative URL ${ref} breaks under /excaliplant/`);
    assert.ok(existsSync(path.join(out, ref)), `${ref} exists`);
  }
  const app = read("app.js");
  assert.ok(!/\binnerHTML\b|\binsertAdjacentHTML\b|\bouterHTML\b|\bdocument\.write\b/.test(app));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(app));
  assert.ok(!/(^|[^.\w$])eval\s*\(|new Function/.test(app));
  assert.match(app, /"worker\.js"/, "the worker is a separate file next to the page");
  const worker = read("worker.js");
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts/.test(worker));
  assert.ok(!/resvg/i.test(worker), "no native rasteriser in the browser bundle");
  assert.ok(!/Excalifont-Regular\.(woff2|ttf)/.test(worker), "the font is embedded, not a path");
  // No third-party fonts or CDN.
  assert.ok(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/.test(html + read("styles.css") + app));
  assert.ok(
    readdirSync(out).every((f) => !f.endsWith(".woff2")),
    "no font file shipped: the SVG carries its own",
  );
});

test("size budget", () => {
  // Gzip sizes, in bytes; the library bundle (ELK) dominates.
  assert.ok(built.files["app.js.gz"] < 40_000, `app.js ${built.files["app.js.gz"]}`);
  assert.ok(built.files["styles.css.gz"] < 8_000);
  assert.ok(built.files["worker.js.gz"] < 900_000, `worker.js ${built.files["worker.js.gz"]}`);
  assert.ok(statSync(path.join(out, "boot.js")).size < 1000);
});

/** A browser-like worker scope without any Node global. */
function sandbox() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    URL,
    performance,
  };
  vm.createContext(context);
  const global = vm.runInContext("globalThis", context);
  context.self = global;
  context.window = global;
  assert.equal(
    vm.runInContext("typeof process + typeof Buffer + typeof require + typeof module", context),
    "undefinedundefinedundefinedundefined",
  );
  return context;
}

test("the worker bundle renders graph and non-graph diagrams without Node globals", async () => {
  const context = sandbox();
  new vm.Script(read("worker.js"), { filename: "worker.js" }).runInContext(context);
  const engine = vm.runInContext("globalThis.excaliplantEngine", context);
  assert.equal(typeof engine.handle, "function");
  assert.equal(engine.version, "7.8.9");

  const ready = await engine.warmup();
  assert.equal(ready.type, "ready");
  assert.equal(ready.version, "7.8.9");

  const graph = await engine.handle({
    type: "render",
    id: 1,
    source: "@startuml\nclass A\nclass B\nA --> B\n@enduml",
    options: {},
    svg: {},
  });
  assert.equal(graph.ok, true, graph.error);
  assert.equal(graph.kind, "class");
  assert.match(graph.svg, /^<svg /);
  assert.match(
    graph.svg,
    /@font-face\{font-family:"?Excalifont"?;src:url\(data:font\/woff2;base64,/,
  );
  assert.ok(graph.svg.length > 10_000);

  const seq = await engine.handle({
    type: "render",
    id: 2,
    source: "Alice -> Bob : hi",
    options: { theme: "dark" },
    svg: {},
  });
  assert.equal(seq.ok, true, seq.error);
  assert.equal(seq.kind, "sequence");

  const timing = await engine.handle({
    type: "render",
    id: 3,
    source: "@startmindmap\n* root\n** child\n@endmindmap",
    options: {},
    svg: {},
  });
  assert.equal(timing.kind, "mindmap");

  const bad = await engine.handle({
    type: "render",
    id: 4,
    source: "@startuml\n!if (\n@enduml",
    options: {},
    svg: {},
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.line, 2);

  // Same bytes as the Node library renders: the bundle and src/ agree.
  const { render } = await import(pathToFileURL(path.join(root, "src", "index.mjs")).href);
  const { sanitizeSvg } = await import(
    pathToFileURL(path.join(root, "src", "markdown", "sanitize.mjs")).href
  );
  const want = sanitizeSvg(await (await render("Alice -> Bob : hi", { theme: "dark" })).toSvg());
  assert.equal(seq.svg, want);

  const file = await engine.handle({ type: "export", id: 5, what: "excalidraw" });
  assert.equal(JSON.parse(file.text).type, "excalidraw");
});

test("the page script parses and needs nothing but the browser", () => {
  const app = read("app.js");
  assert.doesNotThrow(() => new vm.Script(app, { filename: "app.js" }));
  assert.ok(app.length < 120_000);
  assert.doesNotThrow(() => new vm.Script(read("boot.js"), { filename: "boot.js" }));
  // The page bundle holds the examples but not the renderer (that is worker.js).
  assert.ok(!/ElkGraph|rough\.generator|sanitizeSvg|createEngine/.test(app));
  assert.match(app, /checkout-flow/);
});
