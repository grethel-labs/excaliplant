import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { render, warmup } from "../src/index.mjs";
import { LAYOUT_CACHE_LIMITS } from "../src/core/limits.mjs";
import {
  runElk,
  clearLayoutCache,
  layoutCacheStats,
  isElkLoaded,
} from "../src/diagrams/graph/elk_runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CLASSES = `@startuml
package core {
  class Base
  class Worker
}
class Client
Base <|-- Worker
Client --> Worker : uses
@enduml`;

beforeEach(() => clearLayoutCache());

/** Run a snippet in a fresh process and parse the JSON it prints. */
function inFreshProcess(code) {
  const index = pathToFileURL(path.join(ROOT, "src", "index.mjs")).href;
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", code.replaceAll("INDEX_URL", JSON.stringify(index))],
    { encoding: "utf8", cwd: ROOT },
  );
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const ELK_LOADED = `
import { createRequire } from "node:module";
const loaded = () => Object.keys(createRequire(import.meta.url).cache).some((k) => /elk\\.bundled\\.js$/.test(k));`;

test("elkjs is not loaded by importing the library or rendering a non-graph diagram", () => {
  const out = inFreshProcess(`${ELK_LOADED}
const { render } = await import(INDEX_URL);
const afterImport = loaded();
const kinds = [];
for (const src of [
  "@startuml\\nA -> B : x\\n@enduml",
  "@startgantt\\n[Task] lasts 3 days\\n@endgantt",
  "@startmindmap\\n* root\\n** child\\n@endmindmap",
  "@startjson\\n{\\"a\\": 1}\\n@endjson",
]) kinds.push((await render(src)).kind);
console.log(JSON.stringify({ afterImport, afterPlain: loaded(), kinds }));`);
  assert.equal(out.afterImport, false);
  assert.equal(out.afterPlain, false);
  assert.deepEqual(out.kinds, ["sequence", "gantt", "mindmap", "json"]);
});

test("elkjs is loaded on the first graph render and only then", () => {
  const out = inFreshProcess(`${ELK_LOADED}
const { render } = await import(INDEX_URL);
const before = loaded();
const r = await render(${JSON.stringify(CLASSES)});
console.log(JSON.stringify({ before, after: loaded(), kind: r.kind }));`);
  assert.equal(out.before, false);
  assert.equal(out.after, true);
  assert.equal(out.kind, "class");
});

test("no module imports elkjs statically", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (name.endsWith(".mjs")) {
        const text = readFileSync(file, "utf8");
        if (/^\s*(import|export)\b[^;]*?from\s*["']elkjs/m.test(text)) offenders.push(file);
        if (/^\s*import\s*["']elkjs/m.test(text)) offenders.push(file);
      }
    }
  };
  walk(path.join(ROOT, "src"));
  assert.deepEqual(offenders, []);
});

test("rendering the same diagram twice runs ELK once and gives identical output", async () => {
  const a = await render(CLASSES);
  const afterFirst = layoutCacheStats();
  assert.equal(afterFirst.elkRuns, 1);
  assert.equal(afterFirst.entries, 1);
  const b = await render(CLASSES);
  const afterSecond = layoutCacheStats();
  assert.equal(afterSecond.elkRuns, 1, "second render must not call ELK");
  assert.equal(afterSecond.hits, 1);
  assert.equal(JSON.stringify(b.excalidraw), JSON.stringify(a.excalidraw));
  assert.equal(await b.toSvg(), await a.toSvg());
});

test("a cached render equals a render with the cache disabled", async () => {
  await render(CLASSES);
  const cached = await render(CLASSES);
  const fresh = await render(CLASSES, { layoutCache: false });
  assert.equal(JSON.stringify(cached.excalidraw), JSON.stringify(fresh.excalidraw));
});

test("theme, seed and colour changes hit the cache; label and node changes miss it", async () => {
  await render(CLASSES);
  assert.equal(layoutCacheStats().elkRuns, 1);

  await render(CLASSES, { theme: "dark" });
  await render(CLASSES, { theme: "blueprint", seed: "other" });
  await render(CLASSES, { sketch: false });
  const recolored = CLASSES.replace("class Client", "class Client #ffcc00");
  await render(recolored);
  const s = layoutCacheStats();
  assert.equal(s.elkRuns, 1, "non-geometric changes must not run ELK again");
  assert.equal(s.hits, 4);

  await render(CLASSES.replace("uses", "uses a much longer label"));
  assert.equal(layoutCacheStats().elkRuns, 2, "a different label changes the key");
  await render(CLASSES.replace("class Client", "class Client\nclass Extra"));
  assert.equal(layoutCacheStats().elkRuns, 3, "a different node set changes the key");
});

test("mutating a result does not poison the cache", async () => {
  const first = await render(CLASSES);
  const reference = JSON.stringify(first.excalidraw);
  // Layout writes x/y into the model; scribble over everything the caller can reach.
  for (const node of first.model.nodes.values()) {
    node.x += 1000;
    node.y -= 1000;
  }
  for (const edge of first.model.edges) edge.points.length = 0;
  const second = await render(CLASSES);
  assert.equal(layoutCacheStats().elkRuns, 1);
  assert.equal(JSON.stringify(second.excalidraw), reference);
});

test("runElk hands out private copies on hits and misses", async () => {
  const graph = () => ({
    id: "root",
    layoutOptions: { "elk.algorithm": "layered" },
    children: [
      { id: "a", width: 10, height: 10 },
      { id: "b", width: 10, height: 10 },
    ],
    edges: [{ id: "e", sources: ["a"], targets: ["b"] }],
  });
  const miss = await runElk(graph());
  const expected = structuredClone(miss);
  miss.children[0].x = 99999;
  miss.edges[0].sections.length = 0;
  const hit = await runElk(graph());
  assert.deepEqual(hit, expected);
  hit.children[1].y = -5;
  delete hit.edges;
  assert.deepEqual(await runElk(graph()), expected);
  assert.equal(layoutCacheStats().elkRuns, 1);
});

test("options.layoutCache === false bypasses the cache", async () => {
  await render(CLASSES, { layoutCache: false });
  await render(CLASSES, { layoutCache: false });
  const s = layoutCacheStats();
  assert.equal(s.elkRuns, 2);
  assert.equal(s.entries, 0);
  assert.equal(s.hits + s.misses, 0);
});

test("the cache is bounded by entries and refuses oversized entries", async () => {
  const graph = (i, filler = "") => ({
    id: "root",
    children: [{ id: `n${i}`, width: 10 + i, height: 10 }],
    layoutOptions: { filler },
  });
  const total = LAYOUT_CACHE_LIMITS.maxEntries + 10;
  for (let i = 0; i < total; i++) await runElk(graph(i));
  assert.equal(layoutCacheStats().entries, LAYOUT_CACHE_LIMITS.maxEntries);
  assert.ok(layoutCacheStats().bytes <= LAYOUT_CACHE_LIMITS.maxBytes);

  // Least recently used goes first: touch entry 10 (the oldest survivor), then add one more.
  await runElk(graph(10));
  assert.equal(layoutCacheStats().hits, 1);
  await runElk(graph(total));
  const runs = layoutCacheStats().elkRuns;
  await runElk(graph(10));
  assert.equal(layoutCacheStats().elkRuns, runs, "recently used entry survives");
  await runElk(graph(11));
  assert.equal(layoutCacheStats().elkRuns, runs + 1, "least recently used entry was evicted");

  clearLayoutCache();
  const huge = "x".repeat(LAYOUT_CACHE_LIMITS.maxEntryBytes);
  await runElk(graph(0, huge));
  assert.equal(layoutCacheStats().entries, 0);
});

test("warmup is idempotent, never rejects and leaves no trace", async () => {
  const p = warmup();
  assert.equal(warmup(), p, "calls share one promise");
  assert.equal(await p, undefined);
  assert.equal(isElkLoaded(), true);
  const s = layoutCacheStats();
  assert.equal(s.entries, 0, "warm-up must not fill the layout cache");
  assert.equal(s.hits + s.misses, 0);
  assert.equal(await warmup(), undefined);
  // Rendering is unaffected.
  const a = await render(CLASSES);
  const b = await render(CLASSES, { layoutCache: false });
  assert.equal(JSON.stringify(a.excalidraw), JSON.stringify(b.excalidraw));
});

test("scripts/bench.mjs --quick --json runs and reports both modes", () => {
  const r = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "bench.mjs"), "--quick", "--json"],
    {
      encoding: "utf8",
      cwd: ROOT,
    },
  );
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.cold.import.median > 0);
  assert.ok(out.cold.firstGraphRender.median > 0);
  assert.ok(out.cold.firstPlainRender.median > 0);
  assert.equal(out.cold.elkLoadedByPlainRender, false);
  assert.ok(out.warm.examples > 10);
  assert.ok(out.warm.cacheOff.totalMs > 0);
  assert.equal(out.warm.table.length, out.warm.examples);
});

test("loading ELK inside a worker scope keeps the host's message handler", () => {
  // elkjs ends with `if (typeof document === "undefined" && typeof self !== "undefined")
  // self.onmessage = …`: when it is evaluated inside a Web Worker it installs its own
  // handler. Loaded lazily (first graph layout), that used to replace the handler of
  // the host that runs the library in the worker (the playground), which then never
  // answered another message. Node has no `self`, so the worker scope is simulated.
  const index = pathToFileURL(path.join(ROOT, "src", "index.mjs")).href;
  const script = `
    globalThis.self = globalThis;
    const host = () => "host";
    globalThis.onmessage = host;
    const { render } = await import(${JSON.stringify(index)});
    await render("@startuml\\nclass A\\nclass B\\nA --> B\\n@enduml", { layoutCache: false });
    console.log(globalThis.onmessage === host ? "kept" : "replaced");
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "kept");
});
