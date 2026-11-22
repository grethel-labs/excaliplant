#!/usr/bin/env node
// Reproducible rendering benchmark. Timing is noisy and never a CI gate; see docs/performance.md.
//
//   node scripts/bench.mjs                  cold and warm benchmark, human-readable
//   node scripts/bench.mjs --cold -n 7      only the cold start (fresh process per measurement)
//   node scripts/bench.mjs --warm -n 5      only the warm table (per example, median of n runs)
//   node scripts/bench.mjs --json           machine-readable output on stdout
//   node scripts/bench.mjs --quick          one run, a few examples (smoke test)
//   node scripts/bench.mjs --root <dir>     benchmark another checkout (e.g. a baseline copy)
//   node scripts/bench.mjs --golden write <file>
//   node scripts/bench.mjs --golden check <file>
//
// Cold mode spawns a fresh `node` per measurement and times the `import` of
// src/index.mjs, the first graph render (ELK) and the first non-graph render
// (sequence), each in its own process so they do not warm one another.
// Warm mode renders every example once untimed, then n timed passes; it reports
// the median per example with the layout cache off (engine cost) and on (what a
// repeated render costs). `--golden` writes/checks hashes of the Excalidraw JSON
// and SVG of every example in the sketch and dark themes (same format as the
// one-off golden script), proving an optimisation left the output bit-identical.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SELF), "..");

/** Fixed sources for the cold measurements: one graph (ELK) and one non-graph diagram. */
const COLD_SOURCES = {
  graph: `@startuml
package core {
  class Base {
    +id : int
    +run() : void
  }
  class Worker
}
class Client
Base <|-- Worker
Client "1" --> "*" Worker : uses
Client ..> Base : depends
@enduml`,
  plain: `@startuml
Alice -> Bob : hello
Bob --> Alice : hi
Alice -> Carol : again
@enduml`,
};

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const opts = {
    cold: false,
    warm: false,
    json: false,
    quick: false,
    runs: 0,
    root: DEFAULT_ROOT,
    golden: /** @type {[string, string] | null} */ (null),
    child: /** @type {string | null} */ (null),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cold") opts.cold = true;
    else if (a === "--warm") opts.warm = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--quick") opts.quick = true;
    else if (a === "-n" || a === "--runs") opts.runs = Number(argv[++i]);
    else if (a === "--root") opts.root = path.resolve(argv[++i] ?? "");
    else if (a === "--golden") opts.golden = [argv[++i], argv[++i]];
    else if (a === "--child") opts.child = argv[++i];
    else if (a === "-h" || a === "--help") {
      process.stdout.write(readFileSync(SELF, "utf8").split("\n").slice(1, 15).join("\n") + "\n");
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (opts.runs && !(opts.runs >= 1)) throw new Error("-n needs a positive number");
  if (!opts.cold && !opts.warm) opts.cold = opts.warm = true;
  return opts;
}

/** @param {number[]} xs */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** @param {number[]} xs */
function summary(xs) {
  return { median: median(xs), min: Math.min(...xs), max: Math.max(...xs), runs: xs.length };
}

/** @param {string} root @returns {{ name: string, source: string }[]} */
function listExamples(root) {
  const dir = path.join(root, "examples");
  const out = [];
  for (const kind of readdirSync(dir).sort()) {
    for (const f of readdirSync(path.join(dir, kind))
      .filter((x) => x.endsWith(".puml"))
      .sort()) {
      out.push({ name: `${kind}/${f}`, source: readFileSync(path.join(dir, kind, f), "utf8") });
    }
  }
  return out;
}

/** @param {string} root */
function loadApi(root) {
  return import(pathToFileURL(path.join(root, "src", "index.mjs")).href);
}

// ---------------------------------------------------------------- cold ---

/** Runs inside the fresh child process: one import, one first render. */
async function runChild(kind, root) {
  const t0 = performance.now();
  const api = await loadApi(root);
  const t1 = performance.now();
  await api.render(COLD_SOURCES[kind]);
  const t2 = performance.now();
  const cache = createRequire(import.meta.url).cache;
  const elkLoaded = Object.keys(cache).some((k) => /elkjs[\\/]lib[\\/]elk\.bundled\.js$/.test(k));
  process.stdout.write(JSON.stringify({ importMs: t1 - t0, renderMs: t2 - t1, elkLoaded }));
}

/** @param {string} kind @param {string} root */
function spawnChild(kind, root) {
  const r = spawnSync(process.execPath, [SELF, "--child", kind, "--root", root], {
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`cold child failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** @param {string} root @param {number} n */
function runCold(root, n) {
  /** @type {Record<string, number[]>} */
  const acc = { importMs: [], graphMs: [], plainMs: [] };
  let elkAfterPlain = false;
  for (let i = 0; i < n; i++) {
    const g = spawnChild("graph", root);
    const p = spawnChild("plain", root);
    acc.importMs.push(g.importMs, p.importMs);
    acc.graphMs.push(g.renderMs);
    acc.plainMs.push(p.renderMs);
    elkAfterPlain ||= p.elkLoaded;
  }
  return {
    import: summary(acc.importMs),
    firstGraphRender: summary(acc.graphMs),
    firstPlainRender: summary(acc.plainMs),
    elkLoadedByPlainRender: elkAfterPlain,
  };
}

// ---------------------------------------------------------------- warm ---

/** @param {string} root @param {number} n @param {boolean} quick */
async function runWarm(root, n, quick) {
  const api = await loadApi(root);
  let examples = listExamples(root);
  if (quick) {
    const seen = new Set();
    examples = examples.filter((e) => {
      const kind = e.name.split("/")[0];
      return seen.has(kind) ? false : (seen.add(kind), true);
    });
  }
  /** @param {{ source: string }} e @param {object} options */
  const time = async (e, options) => {
    const t = performance.now();
    await api.render(e.source, options);
    return performance.now() - t;
  };
  // Untimed passes so JIT and ELK are hot for every example, then one with the
  // cache on so the timed "on" renders are all repeated ones.
  for (let i = 0; i < 2; i++) for (const e of examples) await time(e, { layoutCache: false });
  for (const e of examples) await time(e, { layoutCache: true });
  const rows = examples.map((e) => ({
    name: e.name,
    off: /** @type {number[]} */ ([]),
    on: /** @type {number[]} */ ([]),
  }));
  // Two separate phases: cache-hit renders create clone garbage that would
  // otherwise distort the cache-off timings that follow them.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < examples.length; j++) {
      rows[j].off.push(await time(examples[j], { layoutCache: false }));
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < examples.length; j++) {
      rows[j].on.push(await time(examples[j], { layoutCache: true }));
    }
  }
  const table = rows
    .map((r) => ({ name: r.name, cacheOffMs: median(r.off), cacheOnMs: median(r.on) }))
    .sort((a, b) => b.cacheOffMs - a.cacheOffMs || (a.name < b.name ? -1 : 1));
  const offs = table.map((r) => r.cacheOffMs);
  const ons = table.map((r) => r.cacheOnMs);
  return {
    examples: table.length,
    runs: n,
    cacheOff: {
      totalMs: offs.reduce((s, x) => s + x, 0),
      medianMs: median(offs),
      maxMs: Math.max(...offs),
    },
    cacheOn: {
      totalMs: ons.reduce((s, x) => s + x, 0),
      medianMs: median(ons),
      maxMs: Math.max(...ons),
    },
    table,
  };
}

// -------------------------------------------------------------- golden ---

/** @param {string} s */
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** @param {string} root @param {"write" | "check"} mode @param {string} file */
async function runGolden(root, mode, file) {
  const { render } = await loadApi(root);
  /** @type {Record<string, string>} */
  const out = {};
  for (const e of listExamples(root)) {
    for (const theme of ["sketch", "dark"]) {
      const r = await render(e.source, { theme });
      out[`${e.name}@${theme}`] = `${sha(JSON.stringify(r.excalidraw))}:${sha(await r.toSvg())}`;
    }
  }
  if (mode === "write") {
    writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(`wrote ${Object.keys(out).length} hashes`);
    return 0;
  }
  if (mode !== "check") throw new Error("--golden needs write|check <file>");
  const ref = JSON.parse(readFileSync(file, "utf8"));
  const bad = Object.keys(ref).filter((k) => ref[k] !== out[k]);
  console.log(
    bad.length
      ? `DIFFERENT (${bad.length}/${Object.keys(ref).length}): ${bad.join(", ")}`
      : `identical (${Object.keys(ref).length} renders)`,
  );
  return bad.length ? 1 : 0;
}

// ---------------------------------------------------------------- main ---

/** @param {number} x */
const ms = (x) => x.toFixed(x < 10 ? 2 : 0).padStart(8);

/** @param {ReturnType<typeof summary>} s */
const fmt = (s) => `${ms(s.median).trim()} ms (min ${ms(s.min).trim()}, max ${ms(s.max).trim()})`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.child) return runChild(opts.child, opts.root);
  if (opts.golden)
    process.exit(await runGolden(opts.root, /** @type {any} */ (opts.golden[0]), opts.golden[1]));

  const result = /** @type {any} */ ({
    node: process.version,
    root: opts.root,
  });
  if (opts.cold) result.cold = runCold(opts.root, opts.runs || (opts.quick ? 1 : 7));
  if (opts.warm)
    result.warm = await runWarm(opts.root, opts.runs || (opts.quick ? 1 : 5), opts.quick);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`excaliplant benchmark, node ${result.node}, ${opts.root}`);
  if (result.cold) {
    const c = result.cold;
    console.log(`\ncold start (fresh process per measurement, n=${c.import.runs / 2})`);
    console.log(`  import src/index.mjs     ${fmt(c.import)}`);
    console.log(`  first graph render       ${fmt(c.firstGraphRender)}`);
    console.log(`  first non-graph render   ${fmt(c.firstPlainRender)}`);
    console.log(`  elkjs loaded by a non-graph render: ${c.elkLoadedByPlainRender ? "yes" : "no"}`);
  }
  if (result.warm) {
    const w = result.warm;
    console.log(`\nwarm render() per example, median of ${w.runs} runs, slowest first`);
    console.log("  cache off      cache on   example");
    for (const r of w.table) {
      console.log(`  ${ms(r.cacheOffMs)}      ${ms(r.cacheOnMs)}   ${r.name}`);
    }
    for (const [label, s] of /** @type {const} */ ([
      ["cache off", w.cacheOff],
      ["cache on ", w.cacheOn],
    ])) {
      console.log(
        `  ${label}: total ${ms(s.totalMs).trim()} ms, median ${ms(s.medianMs).trim()} ms, max ${ms(s.maxMs).trim()} ms (${w.examples} examples)`,
      );
    }
  }
}

await main();
