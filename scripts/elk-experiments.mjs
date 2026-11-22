#!/usr/bin/env node
// ELK option experiments: does a change to the ELK input graph keep the output bit-identical, and is it faster?
//
//   node scripts/elk-experiments.mjs baseline            build the corpus, hash it with the CURRENT code
//   node scripts/elk-experiments.mjs check [-v NAME]     re-hash (optionally with a variant) and compare
//   node scripts/elk-experiments.mjs time  [-n 7]        warm cost of ELK per diagram size class
//   node scripts/elk-experiments.mjs matrix [-n 7]       every variant: identical? speedup per class
//   node scripts/elk-experiments.mjs list                list the variants
//
// Variants are applied by wrapping `ELK.prototype.layout` (the one call elk_runner.mjs makes), so the
// production code is never touched. Reference data lives in $ELK_TMP (default
// <os tmpdir>/excaliplant-elk-experiments): corpus.json (name -> source) and baseline.json (hashes);
// run `baseline` once (with the code you want to compare against) before `check`, `time` or `screen`.
// The corpus is: examples/**/*.puml, every @start…@end block of test/*.test.mjs that renders through ELK,
// and seeded random graphs (scripts/elk-corpus.mjs). Quality rule: a variant counts as identical only if
// the SHA-256 of the Excalidraw JSON and the SVG of every input (sketch and dark theme) is unchanged.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import ELK from "elkjs/lib/elk.bundled.js";
import { exampleSources, randomSources, testSources, variantsOf } from "./elk-corpus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TMP = process.env.ELK_TMP ?? path.join(os.tmpdir(), "excaliplant-elk-experiments");
const THEMES = ["sketch", "dark"];
const RANDOM_COUNT = 320;

const { render } = await import(path.join(ROOT, "src/index.mjs"));
const { layoutCacheStats } = await import(path.join(ROOT, "src/diagrams/graph/elk_runner.mjs"));

// ---------------------------------------------------------------------------
// Graph helpers for variants

/** @param {any} g @param {(n: any, parent: any) => void} fn */
function eachNode(g, fn) {
  for (const c of g.children ?? []) {
    fn(c, g);
    eachNode(c, fn);
  }
}

/** @param {any} g */
const hasContainers = (g) => (g.children ?? []).some((c) => (c.children ?? []).length > 0);

/** True if some edge connects nodes with different parents (it crosses a container border). @param {any} g */
function hasCrossingEdges(g) {
  /** @type {Map<string, string>} */
  const parentOf = new Map();
  eachNode(g, (n, p) => {
    parentOf.set(n.id, p.id);
    for (const port of n.ports ?? []) parentOf.set(port.id, p.id);
  });
  return (g.edges ?? []).some((e) => {
    const a = parentOf.get(e.sources[0]);
    const b = parentOf.get(e.targets[0]);
    return a !== b;
  });
}

/** @param {any} g @param {(opts: any) => void} fn applied to the root and every container */
function eachLayoutOptions(g, fn) {
  fn(g.layoutOptions);
  eachNode(g, (n) => n.layoutOptions && fn(n.layoutOptions));
}

/** @param {string} key @param {string} value */
const dropRoot = (key, value) => (g) => {
  if (g.layoutOptions[key] === value) delete g.layoutOptions[key];
};

/**
 * @typedef {{ id: string, note: string, transform: (g: any) => void }} Variant
 * @type {Variant[]}
 */
export const VARIANTS = [
  {
    id: "noop",
    note: "control: identity (must report 0 differences)",
    transform: () => {},
  },
  {
    id: "sep-flat",
    note: "hierarchyHandling SEPARATE_CHILDREN when the graph has no container",
    transform: (g) => {
      if (!hasContainers(g)) g.layoutOptions["elk.hierarchyHandling"] = "SEPARATE_CHILDREN";
    },
  },
  {
    id: "no-hh-flat",
    note: "hierarchyHandling option removed when the graph has no container",
    transform: (g) => {
      if (!hasContainers(g)) delete g.layoutOptions["elk.hierarchyHandling"];
    },
  },
  {
    id: "sep-noncrossing",
    note: "SEPARATE_CHILDREN when containers exist but no edge crosses a container border",
    transform: (g) => {
      if (!hasCrossingEdges(g)) g.layoutOptions["elk.hierarchyHandling"] = "SEPARATE_CHILDREN";
    },
  },
  {
    id: "drop-prio0",
    note: "edge option elk.layered.priority.direction=0 removed (ELK default is 0)",
    transform: (g) => {
      for (const e of g.edges ?? []) delete e.layoutOptions["elk.layered.priority.direction"];
    },
  },
  {
    id: "drop-empty-lo",
    note: "empty layoutOptions objects on edges removed",
    transform: (g) => {
      for (const e of g.edges ?? [])
        if (!Object.keys(e.layoutOptions).length) delete e.layoutOptions;
    },
  },
  {
    id: "drop-empty-arrays",
    note: "empty labels arrays on edges removed",
    transform: (g) => {
      for (const e of g.edges ?? []) if (!e.labels.length) delete e.labels;
    },
  },
  {
    id: "drop-label-text",
    note: "label text removed from ELK labels (only sizes matter)",
    transform: (g) => {
      for (const e of g.edges ?? []) for (const l of e.labels ?? []) delete l.text;
    },
  },
  {
    id: "drop-mergeEdges",
    note: "elk.layered.mergeEdges=false removed (default false)",
    transform: dropRoot("elk.layered.mergeEdges", "false"),
  },
  {
    id: "drop-inline",
    note: "elk.edgeLabels.inline=false removed (default false)",
    transform: dropRoot("elk.edgeLabels.inline", "false"),
  },
  {
    id: "drop-forceModelOrder",
    note: "crossingMinimization.forceNodeModelOrder=false removed (default false)",
    transform: dropRoot("elk.layered.crossingMinimization.forceNodeModelOrder", "false"),
  },
  {
    id: "drop-sideSelection",
    note: "edgeLabels.sideSelection=SMART_DOWN removed (default SMART_DOWN)",
    transform: dropRoot("elk.layered.edgeLabels.sideSelection", "SMART_DOWN"),
  },
  {
    id: "drop-sepComponents",
    note: "separateConnectedComponents=true removed (default true)",
    transform: dropRoot("elk.separateConnectedComponents", "true"),
  },
  {
    id: "sepComponents-false",
    note: "separateConnectedComponents=false",
    transform: (g) => {
      g.layoutOptions["elk.separateConnectedComponents"] = "false";
    },
  },
  {
    id: "drop-routing-ortho",
    note: "edgeRouting=ORTHOGONAL removed (layered default)",
    transform: dropRoot("elk.edgeRouting", "ORTHOGONAL"),
  },
  {
    id: "drop-algorithm",
    note: "algorithm=layered removed (ELK default algorithm)",
    transform: dropRoot("elk.algorithm", "layered"),
  },
  {
    id: "drop-defaults",
    note: "all of: prio0, mergeEdges, inline, forceModelOrder, sideSelection, sepComponents, ortho, algorithm",
    transform: (g) => {
      for (const e of g.edges ?? []) delete e.layoutOptions["elk.layered.priority.direction"];
      for (const [k, v] of [
        ["elk.layered.mergeEdges", "false"],
        ["elk.edgeLabels.inline", "false"],
        ["elk.layered.crossingMinimization.forceNodeModelOrder", "false"],
        ["elk.layered.edgeLabels.sideSelection", "SMART_DOWN"],
        ["elk.separateConnectedComponents", "true"],
        ["elk.edgeRouting", "ORTHOGONAL"],
        ["elk.algorithm", "layered"],
      ])
        dropRoot(k, v)(g);
    },
  },
  {
    id: "combo-identical",
    note: "all variants whose raw ELK geometry matched on the whole corpus: prio0, empty lo/labels, mergeEdges, inline, forceModelOrder, sideSelection, sepComponents, ortho, algorithm",
    transform: (g) => {
      for (const e of g.edges ?? []) {
        delete e.layoutOptions["elk.layered.priority.direction"];
        if (!Object.keys(e.layoutOptions).length) delete e.layoutOptions;
        if (!e.labels.length) delete e.labels;
      }
      for (const [k, v] of [
        ["elk.layered.mergeEdges", "false"],
        ["elk.edgeLabels.inline", "false"],
        ["elk.layered.crossingMinimization.forceNodeModelOrder", "false"],
        ["elk.layered.edgeLabels.sideSelection", "SMART_DOWN"],
        ["elk.separateConnectedComponents", "true"],
        ["elk.edgeRouting", "ORTHOGONAL"],
        ["elk.algorithm", "layered"],
      ])
        dropRoot(k, v)(g);
    },
  },
  {
    id: "no-spacing-repeat",
    note: "spacing options not repeated on containers",
    transform: (g) => {
      eachNode(g, (n) => {
        if (!n.layoutOptions) return;
        for (const k of Object.keys(n.layoutOptions))
          if (k.includes("spacing")) delete n.layoutOptions[k];
      });
    },
  },
  {
    id: "thorough-7",
    note: "QUALITY: thoroughness 7 (ELK default) instead of 10",
    transform: (g) => {
      g.layoutOptions["elk.layered.thoroughness"] = "7";
    },
  },
  {
    id: "thorough-3",
    note: "QUALITY: thoroughness 3",
    transform: (g) => {
      g.layoutOptions["elk.layered.thoroughness"] = "3";
    },
  },
  {
    id: "thorough-1",
    note: "QUALITY: thoroughness 1",
    transform: (g) => {
      g.layoutOptions["elk.layered.thoroughness"] = "1";
    },
  },
  {
    id: "thorough-10-nocontainer-1",
    note: "QUALITY: thoroughness 1 only for graphs with <= 3 nodes",
    transform: (g) => {
      let n = 0;
      eachNode(g, () => n++);
      if (n <= 3) g.layoutOptions["elk.layered.thoroughness"] = "1";
    },
  },
  {
    id: "greedy-off",
    note: "QUALITY: crossingMinimization.greedySwitch.type OFF",
    transform: (g) => {
      g.layoutOptions["elk.layered.crossingMinimization.greedySwitch.type"] = "OFF";
    },
  },
  {
    id: "no-debug",
    note: "elk.debugMode=false and elk.validateGraph=false / validateOptions=false set explicitly",
    transform: (g) => {
      g.layoutOptions["elk.debugMode"] = "false";
      g.layoutOptions["elk.validateGraph"] = "false";
      g.layoutOptions["elk.validateOptions"] = "false";
    },
  },
];

// ---------------------------------------------------------------------------
// ELK wrapper: variants + timing

/** @type {Variant | null} */
let active = null;
let elkMs = 0;
let elkCalls = 0;
/** @type {{ nodes: number, edges: number, containers: number, ports: number } | null} */
let lastShape = null;
/** When set, the JSON of every ELK input is pushed here (before any variant). @type {string[] | null} */
let capture = null;
const origLayout = /** @type {any} */ (ELK).prototype.layout;
/** @type {any} */ (ELK).prototype.layout = async function (
  /** @type {any} */ graph,
  /** @type {any} */ o,
) {
  if (active) active.transform(graph);
  const t = performance.now();
  try {
    return await origLayout.call(this, graph, o);
  } finally {
    elkMs += performance.now() - t;
    elkCalls++;
  }
};

/**
 * JSON.stringify replacer: ELK echoes the input graph (layoutOptions, label text, empty arrays) into its result;
 * only the computed geometry may be compared, otherwise removing an input field would look like a layout change.
 * @param {string} key @param {any} value
 */
function geometryOnly(key, value) {
  if (key === "layoutOptions" || key === "text" || key.startsWith("$")) return undefined; // "$H": ELK-internal counter
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

/** Structure of the ELK input: used to classify diagrams. @param {any} g */
function shapeOf(g) {
  let nodes = 0;
  let containers = 0;
  let ports = 0;
  eachNode(g, (n) => {
    nodes++;
    if ((n.children ?? []).length) containers++;
    ports += (n.ports ?? []).length;
  });
  return { nodes, edges: (g.edges ?? []).length, containers, ports };
}
// Record the shape of every ELK input (before the variant mutates it).
const wrapped = /** @type {any} */ (ELK).prototype.layout;
/** @type {any} */ (ELK).prototype.layout = function (
  /** @type {any} */ graph,
  /** @type {any} */ o,
) {
  lastShape = shapeOf(graph);
  if (capture) capture.push(JSON.stringify(graph));
  return wrapped.call(this, graph, o);
};

// ---------------------------------------------------------------------------
// Corpus

const sha = (/** @type {string} */ s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** @param {string} src @param {string} theme */
async function hashRender(src, theme) {
  try {
    const r = await render(src, { theme, layoutCache: false });
    return `${sha(JSON.stringify(r.excalidraw))}:${sha(await r.toSvg())}`;
  } catch (e) {
    return `ERR:${String(/** @type {Error} */ (e).message).slice(0, 80)}`;
  }
}

/** @param {{ name: string, src: string }[]} candidates keep only inputs that render and run ELK */
async function filterCorpus(candidates) {
  /** @type {Record<string, string>} */
  const kept = {};
  const dropped = { error: 0, noElk: 0, duplicate: 0 };
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.src)) {
      dropped.duplicate++;
      continue;
    }
    const before = layoutCacheStats().elkRuns;
    try {
      await render(c.src, { layoutCache: false });
    } catch {
      dropped.error++;
      continue;
    }
    if (layoutCacheStats().elkRuns === before) {
      dropped.noElk++;
      continue;
    }
    seen.add(c.src);
    kept[c.name] = c.src;
  }
  return { kept, dropped };
}

function loadCorpus() {
  return /** @type {Record<string, string>} */ (
    JSON.parse(readFileSync(path.join(TMP, "corpus.json"), "utf8"))
  );
}

/** @param {Record<string, string>} corpus */
async function hashAll(corpus) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [name, src] of Object.entries(corpus))
    for (const theme of THEMES) out[`${name}@${theme}`] = await hashRender(src, theme);
  return out;
}

/** @param {Record<string, string>} ref @param {Record<string, string>} now */
function diff(ref, now) {
  return Object.keys(ref).filter((k) => ref[k] !== now[k]);
}

// ---------------------------------------------------------------------------
// Timing

/** @param {number[]} xs */
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : NaN;
};

/** @param {{ nodes: number, containers: number }} s */
function sizeClass(s) {
  const size = s.nodes <= 8 ? "S (<=8 nodes)" : s.nodes <= 20 ? "M (9-20)" : "L (>20)";
  return `${size}${s.containers ? " +container" : ""}`;
}

/**
 * Time every input `n` times. `variants` are alternated within each round (order flips every round) so slow
 * drift of the shared machine hits all of them equally.
 * @param {Record<string, string>} corpus
 * @param {(Variant | null)[]} variants
 * @param {number} n
 */
async function measure(corpus, variants, n) {
  const names = Object.keys(corpus);
  /** @type {Map<string, { total: number[][], elk: number[][], shape: any }>} */
  const data = new Map(
    names.map((k) => [
      k,
      { total: variants.map(() => []), elk: variants.map(() => []), shape: null },
    ]),
  );
  const pass = async (/** @type {number} */ vi, /** @type {boolean} */ record) => {
    active = variants[vi];
    for (const name of names) {
      elkMs = 0;
      const t = performance.now();
      await render(corpus[name], { layoutCache: false });
      const total = performance.now() - t;
      if (record) {
        const d = /** @type {any} */ (data.get(name));
        d.total[vi].push(total);
        d.elk[vi].push(elkMs);
        d.shape = lastShape;
      }
    }
  };
  for (let w = 0; w < 2; w++) for (let v = 0; v < variants.length; v++) await pass(v, false);
  for (let round = 0; round < n; round++) {
    const order = variants.map((_, i) => i);
    if (round % 2) order.reverse();
    for (const v of order) await pass(v, true);
  }
  active = null;
  return data;
}

/** @param {Map<string, any>} data @param {number} vi */
function byClass(data, vi) {
  /** @type {Map<string, { n: number, total: number, elk: number }>} */
  const out = new Map();
  for (const d of data.values()) {
    const k = sizeClass(d.shape);
    const c = out.get(k) ?? { n: 0, total: 0, elk: 0 };
    c.n++;
    c.total += median(d.total[vi]);
    c.elk += median(d.elk[vi]);
    out.set(k, c);
  }
  return out;
}

/** @param {Map<string, any>} data */
function printTime(data) {
  const cls = byClass(data, 0);
  let sumT = 0;
  let sumE = 0;
  console.log(
    "class                      inputs  sum(render) ms  sum(ELK) ms  ELK share  median render ms",
  );
  for (const k of [...cls.keys()].sort()) {
    const c = /** @type {any} */ (cls.get(k));
    const med = median(
      [...data.values()].filter((d) => sizeClass(d.shape) === k).map((d) => median(d.total[0])),
    );
    sumT += c.total;
    sumE += c.elk;
    console.log(
      `${k.padEnd(26)} ${String(c.n).padStart(6)}  ${c.total.toFixed(0).padStart(14)}  ${c.elk.toFixed(0).padStart(11)}  ${((100 * c.elk) / c.total).toFixed(0).padStart(8)}%  ${med.toFixed(1).padStart(15)}`,
    );
  }
  console.log(
    `${"all".padEnd(26)} ${String(data.size).padStart(6)}  ${sumT.toFixed(0).padStart(14)}  ${sumE.toFixed(0).padStart(11)}  ${((100 * sumE) / sumT).toFixed(0).padStart(8)}%`,
  );
  // Time vs. node count, to see how ELK time scales.
  const rows = [...data.values()].map((d) => ({
    nodes: d.shape.nodes,
    edges: d.shape.edges,
    elk: median(d.elk[0]),
    total: median(d.total[0]),
  }));
  const buckets = [
    [0, 3],
    [4, 8],
    [9, 15],
    [16, 25],
    [26, 60],
  ];
  console.log("\nnodes      inputs  median ELK ms  median render ms  median ELK ms per node");
  for (const [lo, hi] of buckets) {
    const r = rows.filter((x) => x.nodes >= lo && x.nodes <= hi);
    if (!r.length) continue;
    console.log(
      `${`${lo}-${hi}`.padEnd(10)} ${String(r.length).padStart(6)}  ${median(r.map((x) => x.elk))
        .toFixed(2)
        .padStart(13)}  ${median(r.map((x) => x.total))
        .toFixed(2)
        .padStart(16)}  ${median(r.map((x) => x.elk / Math.max(1, x.nodes)))
        .toFixed(3)
        .padStart(22)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Commands

/** @param {string[]} argv @param {string} flag @param {string} [fallback] */
function arg(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : fallback;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  mkdirSync(TMP, { recursive: true });
  const n = Number(arg(rest, "-n", "7"));
  if (cmd === "list") {
    for (const v of VARIANTS) console.log(`${v.id.padEnd(26)} ${v.note}`);
    return;
  }
  if (cmd === "baseline") {
    const real = [...exampleSources(ROOT), ...testSources(ROOT)];
    const all = [...real, ...variantsOf(real), ...randomSources(RANDOM_COUNT)];
    const { kept, dropped } = await filterCorpus(all);
    writeFileSync(path.join(TMP, "corpus.json"), JSON.stringify(kept, null, 1));
    const hashes = await hashAll(kept);
    writeFileSync(path.join(TMP, "baseline.json"), JSON.stringify(hashes, null, 1));
    const errs = Object.values(hashes).filter((h) => h.startsWith("ERR")).length;
    const by = (/** @type {string} */ p) => Object.keys(kept).filter((k) => k.startsWith(p)).length;
    console.log(
      `corpus: ${Object.keys(kept).length} inputs (examples ${by("ex:")}, tests ${by("test:")}, random ${by("rand:")}; of these ${Object.keys(kept).filter((k) => /\+(poly|lr)$/.test(k)).length} are polyline/LR variants of examples and tests); candidates ${all.length}; dropped ${JSON.stringify(dropped)}; ${Object.keys(hashes).length} hashes, ${errs} render errors`,
    );
    return;
  }
  if (cmd === "check") {
    const v = arg(rest, "-v");
    active = v ? (VARIANTS.find((x) => x.id === v) ?? null) : null;
    if (v && !active) throw new Error(`unknown variant ${v}`);
    const ref = JSON.parse(readFileSync(path.join(TMP, "baseline.json"), "utf8"));
    const bad = diff(ref, await hashAll(loadCorpus()));
    console.log(
      bad.length
        ? `DIFFERENT (${bad.length}/${Object.keys(ref).length}): ${bad.slice(0, 12).join(", ")}`
        : `identical (${Object.keys(ref).length} hashes, ${Object.keys(ref).length / THEMES.length} inputs)`,
    );
    process.exitCode = bad.length ? 1 : 0;
    return;
  }
  if (!existsSync(path.join(TMP, "corpus.json"))) throw new Error("run `baseline` first");
  const corpus = loadCorpus();
  if (cmd === "time") {
    printTime(await measure(corpus, [null], n));
    return;
  }
  if (cmd === "screen") {
    // Direct ELK comparison on the captured ELK input graphs: raw result identical? how long does ELK take?
    const only = arg(rest, "-v");
    const list = VARIANTS.filter((v) => !only || only.split(",").includes(v.id));
    /** @type {string[]} */
    const graphs = [];
    capture = graphs;
    for (const src of Object.values(corpus)) await render(src, { layoutCache: false });
    capture = null;
    const maxNodes = Number(arg(rest, "--max-nodes", "1e9"));
    for (let i = graphs.length - 1; i >= 0; i--)
      if (shapeOf(JSON.parse(graphs[i])).nodes > maxNodes) graphs.splice(i, 1);
    const shapes = graphs.map((j) => shapeOf(JSON.parse(j)));
    const run = async (/** @type {Variant | null} */ v, /** @type {string} */ json) => {
      const g = JSON.parse(json);
      if (v) v.transform(g);
      const t = performance.now();
      const res = await origLayout.call(elkInstance, g);
      return { ms: performance.now() - t, out: JSON.stringify(res, geometryOnly) };
    };
    const elkInstance = new /** @type {any} */ (ELK)();
    const baseOut = [];
    for (const j of graphs) baseOut.push((await run(null, j)).out);
    const variants = [null, ...list];
    /** @type {number[][][]} */
    const times = variants.map(() => graphs.map(() => []));
    /** @type {number[]} */
    const differing = variants.map(() => 0);
    const warm = n > 1 ? 2 : 0;
    for (let round = -warm; round < n; round++) {
      const order = variants.map((_, i) => i);
      if (round % 2) order.reverse();
      for (const vi of order)
        for (let gi = 0; gi < graphs.length; gi++) {
          const r = await run(variants[vi], graphs[gi]);
          if (round >= 0) times[vi][gi].push(r.ms);
          if (round === 0 && r.out !== baseOut[gi]) differing[vi]++;
        }
    }
    const classes = [...new Set(shapes.map(sizeClass))].sort();
    console.log(
      `graphs: ${graphs.length}; raw ELK result identical to baseline? speedup of summed median ELK time per class`,
    );
    console.log(
      [
        "variant".padEnd(26),
        "raw-differs".padStart(11),
        ...classes.map((c) => c.padStart(22)),
        "all".padStart(8),
      ].join(" "),
    );
    const sumBy = (/** @type {number} */ vi, /** @type {(s: any) => boolean} */ f) =>
      graphs.reduce((acc, _, gi) => acc + (f(shapes[gi]) ? median(times[vi][gi]) : 0), 0);
    for (let vi = 1; vi < variants.length; vi++) {
      const cells = classes.map((c) => {
        const b = sumBy(0, (s) => sizeClass(s) === c);
        const x = sumBy(vi, (s) => sizeClass(s) === c);
        return `${(((b - x) / b) * 100).toFixed(1)}%`.padStart(22);
      });
      const b = sumBy(0, () => true);
      const x = sumBy(vi, () => true);
      console.log(
        [
          /** @type {Variant} */ (variants[vi]).id.padEnd(26),
          String(differing[vi]).padStart(11),
          ...cells,
          `${(((b - x) / b) * 100).toFixed(1)}%`.padStart(8),
        ].join(" "),
      );
    }
    return;
  }
  if (cmd === "matrix") {
    const ref = JSON.parse(readFileSync(path.join(TMP, "baseline.json"), "utf8"));
    const only = arg(rest, "-v");
    const list = VARIANTS.filter((v) => !only || only.split(",").includes(v.id));
    // Hash check per variant (cheap relative to timing).
    /** @type {Map<string, number>} */
    const differing = new Map();
    for (const v of list) {
      active = v;
      differing.set(v.id, diff(ref, await hashAll(corpus)).length);
      console.error(`hash ${v.id}: ${differing.get(v.id)} differing`);
    }
    active = null;
    const data = await measure(corpus, [null, ...list], n);
    const base = byClass(data, 0);
    const classes = [...base.keys()].sort();
    console.log(
      `\nspeedup of sum(render) vs baseline per class (positive = faster); identical = 0 differing of ${Object.keys(ref).length} hashes`,
    );
    console.log(
      [
        "variant".padEnd(26),
        "differing".padStart(9),
        ...classes.map((c) => c.padStart(22)),
        "all".padStart(8),
      ].join(" "),
    );
    for (let i = 0; i < list.length; i++) {
      const cv = byClass(data, i + 1);
      const cells = classes.map((c) => {
        const b = /** @type {any} */ (base.get(c)).total;
        const x = /** @type {any} */ (cv.get(c)).total;
        return `${(((b - x) / b) * 100).toFixed(1)}%`.padStart(22);
      });
      const tb = [...base.values()].reduce((s, c) => s + c.total, 0);
      const tx = [...cv.values()].reduce((s, c) => s + c.total, 0);
      console.log(
        [
          list[i].id.padEnd(26),
          String(differing.get(list[i].id)).padStart(9),
          ...cells,
          `${(((tb - tx) / tb) * 100).toFixed(1)}%`.padStart(8),
        ].join(" "),
      );
    }
    return;
  }
  console.log(
    "usage: elk-experiments.mjs baseline | check [-v NAME] | time [-n N] | screen [-n N] [-v a,b] | matrix [-n N] [-v a,b] | list",
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
