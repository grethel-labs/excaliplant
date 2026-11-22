// Corpus for the ELK option experiments (scripts/elk-experiments.mjs).
//
// Three sources, all deterministic:
//   examples  every examples/**/*.puml
//   tests     every @start…@end block found in test/*.test.mjs (pragmatic regex extraction)
//   random    generated graphs from a tiny seeded PRNG (never Math.random)
// Only inputs that render and actually run ELK are kept by `buildCorpus`.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * mulberry32: tiny deterministic PRNG.
 * @param {number} seed
 */
export function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** @param {number} lo @param {number} hi inclusive */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    /** @param {number} p */
    chance: (p) => next() < p,
    /** @template T @param {T[]} xs @returns {T} */
    pick: (xs) => xs[Math.floor(next() * xs.length)],
  };
}

/** @param {string} root */
export function exampleSources(root) {
  /** @type {{ name: string, src: string }[]} */
  const out = [];
  for (const kind of readdirSync(path.join(root, "examples")).sort())
    for (const f of readdirSync(path.join(root, "examples", kind)).sort())
      if (f.endsWith(".puml"))
        out.push({
          name: `ex:${kind}/${f}`,
          src: readFileSync(path.join(root, "examples", kind, f), "utf8"),
        });
  return out;
}

/**
 * Routing and direction variants of ELK-rendered sources (polyline routing, left to right).
 * @param {{ name: string, src: string }[]} list
 */
export function variantsOf(list) {
  /** @type {{ name: string, src: string }[]} */
  const out = [];
  for (const { name, src } of list) {
    if (!src.startsWith("@startuml")) continue;
    const nl = src.indexOf("\n");
    const head = src.slice(0, nl + 1);
    const body = src.slice(nl + 1);
    out.push({ name: `${name}+poly`, src: `${head}skinparam linetype polyline\n${body}` });
    out.push({ name: `${name}+lr`, src: `${head}left to right direction\n${body}` });
  }
  return out;
}

/** @param {string} root */
export function testSources(root) {
  /** @type {{ name: string, src: string }[]} */
  const out = [];
  const seen = new Set();
  for (const f of readdirSync(path.join(root, "test")).sort()) {
    if (!f.endsWith(".test.mjs") || f === "elk_options.test.mjs") continue;
    const text = readFileSync(path.join(root, "test", f), "utf8");
    const re = /@start(\w+)[\s\S]*?@end\1/g;
    let m;
    let i = 0;
    while ((m = re.exec(text))) {
      let s = m[0];
      if (s.includes("${")) continue;
      // Sources inside single/double quoted strings use escaped newlines.
      if (!s.includes("\n"))
        s = s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      else s = s.replace(/\\\\/g, "\\");
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ name: `test:${f}#${i++}`, src: s });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Random graphs

/**
 * Build a random tree of containers; returns the placement of node indices.
 * @param {ReturnType<typeof prng>} r
 * @param {number} n
 * @param {number} maxDepth
 * @param {number} pContainer
 */
function placement(r, n, maxDepth, pContainer) {
  /** @type {{ name: string, depth: number, nodes: number[], kids: any[] }} */
  const root = { name: "", depth: 0, nodes: [], kids: [] };
  /** @type {typeof root[]} */
  const containers = [root];
  const nContainers = r.chance(pContainer)
    ? r.int(1, Math.max(1, Math.min(6, Math.floor(n / 3))))
    : 0;
  for (let i = 0; i < nContainers; i++) {
    const parent = r.pick(containers.filter((c) => c.depth < maxDepth));
    const c = { name: `G${i}`, depth: parent.depth + 1, nodes: [], kids: [] };
    parent.kids.push(c);
    containers.push(c);
  }
  for (let i = 0; i < n; i++) r.pick(containers).nodes.push(i);
  return root;
}

/**
 * @param {ReturnType<typeof prng>} r
 * @param {number} n nodes
 * @param {number} m edges
 * @param {boolean} selfLoops
 * @returns {[number, number][]}
 */
function randomEdges(r, n, m, selfLoops) {
  /** @type {[number, number][]} */
  const edges = [];
  for (let i = 0; i < m; i++) {
    const a = r.int(0, n - 1);
    let b = r.int(0, n - 1);
    if (a === b && !(selfLoops && r.chance(0.5))) b = (a + 1 + r.int(0, Math.max(0, n - 2))) % n;
    // Mostly forward edges so graphs look like real diagrams, some back edges (cycles).
    edges.push(r.chance(0.8) && a > b ? [b, a] : [a, b]);
  }
  return edges;
}

const LABELS = [
  "uses",
  "calls",
  "owns",
  "reads",
  "emits",
  "ok",
  "retry",
  "a longer edge label here",
  "x",
];
const MULT = ["1", "*", "0..1", "1..*", "many"];

/**
 * @param {any} root
 * @param {(i: number) => string} fnNode
 * @param {(c: any) => string} fnOpen
 * @param {(c: any) => string} fnClose
 */
function emitTree(root, fnNode, fnOpen, fnClose) {
  /** @type {string[]} */
  const lines = [];
  /** @param {any} c @param {number} d */
  const walk = (c, d) => {
    const ind = "  ".repeat(d);
    for (const i of c.nodes) lines.push(ind + fnNode(i));
    for (const k of c.kids) {
      lines.push(ind + fnOpen(k));
      walk(k, d + 1);
      lines.push(ind + fnClose(k));
    }
  };
  walk(root, 0);
  return lines;
}

/** @param {number} seed @param {number} idx */
export function randomGraph(seed, idx) {
  const r = prng(seed * 7919 + idx * 104729 + 1);
  const styles = [
    "class",
    "component",
    "state",
    "usecase",
    "legacy",
    "object",
    "deployment",
    "dot",
  ];
  const style = styles[idx % styles.length];
  const big = r.chance(0.1);
  const n = big ? r.int(25, 40) : r.int(2, 18);
  const m = Math.min(80, big ? r.int(20, 80) : r.int(1, Math.max(1, Math.floor(n * 1.8))));
  const self = r.chance(0.3);
  const lr = r.chance(0.4);
  const edges = randomEdges(r, n, m, self);
  /** @type {string[]} */
  const L = ["@startuml"];
  if (style !== "dot" && lr) L.push("left to right direction");
  if (style !== "dot" && r.chance(0.12)) L.push("skinparam linetype polyline");
  const maxDepth = r.int(1, 3);
  /** @param {number} i */
  const lab = (i) => (r.chance(0.35) ? ` : ${r.pick(LABELS)}` : "");
  if (style === "class" || style === "object") {
    const tree = placement(r, n, maxDepth, 0.5);
    const kw = style === "object" ? "object" : "class";
    L.push(
      ...emitTree(
        tree,
        (i) => {
          const base = `${r.chance(0.15) && kw === "class" ? "interface" : kw} N${i}`;
          if (r.chance(0.35)) {
            const k = r.int(1, 4);
            const members = Array.from({ length: k }, (_, j) =>
              style === "object" ? `  f${j} = ${j}` : `  ${r.pick(["+", "-", "#"])}m${j}() : int`,
            );
            return `${base} {\n${members.join("\n")}\n}`;
          }
          return base;
        },
        (c) => `package ${c.name} {`,
        () => "}",
      ),
    );
    const arrows =
      style === "object"
        ? ["-->", "--", "..>"]
        : ["-->", "--", "<|--", "*--", "o--", "..>", "..|>", "->", "---->"];
    for (const [a, b] of edges) {
      const arrow = r.pick(arrows);
      let line = `N${a}`;
      if (style === "class" && r.chance(0.2)) line += ` "${r.pick(MULT)}"`;
      line += ` ${r.chance(0.08) && arrow.endsWith(">") ? r.pick(["-up->", "-down->", "-left->", "-right->"]) : arrow}`;
      if (style === "class" && r.chance(0.2)) line += ` "${r.pick(MULT)}"`;
      line += ` N${b}${lab(0)}`;
      L.push(line);
    }
  } else if (style === "component" || style === "deployment") {
    const tree = placement(r, n, maxDepth, 0.6);
    const kinds =
      style === "component"
        ? ["component", "interface", "database", "[%]"]
        : ["node", "artifact", "database", "cloud", "queue"];
    L.push(
      ...emitTree(
        tree,
        (i) => {
          const k = r.pick(kinds);
          return k === "[%]" ? `[N${i}] as N${i}` : `${k} N${i}`;
        },
        (c) => `${r.pick(["package", "node", "rectangle", "folder", "cloud"])} "${c.name}" {`,
        () => "}",
      ),
    );
    for (const [a, b] of edges)
      L.push(`N${a} ${r.pick(["-->", "..>", "--", "->", "-down->", "-right->"])} N${b}${lab(0)}`);
  } else if (style === "state") {
    // States with choice/fork/join pseudo states (side-fixed ports) and composites.
    const tree = placement(r, n, Math.min(maxDepth, 2), 0.35);
    L.push(
      ...emitTree(
        tree,
        (i) => {
          if (i > 1 && r.chance(0.12)) return `state N${i} <<choice>>`;
          if (i > 1 && r.chance(0.1)) return `state N${i} <<${r.pick(["fork", "join"])}>>`;
          return `state N${i}`;
        },
        (c) => `state ${c.name} {`,
        () => "}",
      ),
    );
    L.push(`[*] --> N0`);
    for (const [a, b] of edges) L.push(`N${a} --> N${b}${lab(0)}`);
    if (r.chance(0.6)) L.push(`N${n - 1} --> [*]`);
  } else if (style === "usecase") {
    const nAct = Math.max(1, Math.floor(n / 4));
    for (let i = 0; i < nAct; i++) L.push(`actor A${i}`);
    const tree = placement(r, n - nAct, Math.min(maxDepth, 2), 0.5);
    L.push(
      ...emitTree(
        tree,
        (i) => `usecase "UC ${i}" as U${i}`,
        (c) => `rectangle ${c.name} {`,
        () => "}",
      ),
    );
    const total = n - nAct;
    for (const [a, b] of edges) {
      if (total < 1) break;
      if (r.chance(0.5)) L.push(`A${a % nAct} ${r.pick(["-->", "--"])} U${b % total}${lab(0)}`);
      else
        L.push(
          `U${a % total} ${r.pick([".>", "-->"])} U${b % total} : ${r.pick(["include", "extend", "uses"])}`,
        );
    }
  } else if (style === "legacy") {
    L.push(`(*) --> "S0"`);
    let last = "S0";
    let k = 1;
    const steps = Math.max(2, Math.floor(n / 2));
    for (let i = 0; i < steps; i++) {
      if (r.chance(0.35)) {
        L.push(`if "cond ${i}?" then`);
        L.push(`  -->[yes] "S${k}"`);
        L.push(`  --> ===B${i}===`);
        L.push(`else`);
        L.push(`  -->[no] "S${k + 1}"`);
        L.push(`  --> ===B${i}===`);
        L.push(`endif`);
        L.push(`===B${i}=== --> "S${k + 2}"`);
        last = `S${k + 2}`;
        k += 3;
      } else {
        L.push(`"${last}" --> "S${k}"`);
        last = `S${k}`;
        k++;
      }
    }
    L.push(`--> (*)`);
  } else {
    // dot
    L.length = 0;
    L.push("@startdot");
    L.push("digraph G {");
    if (lr) L.push("  rankdir=LR;");
    const tree = placement(r, n, Math.min(maxDepth, 2), 0.4);
    L.push(
      ...emitTree(
        tree,
        (i) => `N${i} [label="Node ${i}"${r.chance(0.2) ? ", shape=box" : ""}];`,
        (c) => `subgraph cluster_${c.name} { label="${c.name}";`,
        () => "}",
      ),
    );
    for (const [a, b] of edges)
      L.push(`  N${a} -> N${b}${r.chance(0.3) ? ` [label="${r.pick(LABELS)}"]` : ""};`);
    L.push("}");
    L.push("@enddot");
    return { name: `rand:${style}:${idx}`, src: L.join("\n") };
  }
  L.push("@enduml");
  return { name: `rand:${style}:${idx}`, src: L.join("\n") };
}

/** @param {number} count @param {number} [seed] */
export function randomSources(count, seed = 20240601) {
  return Array.from({ length: count }, (_, i) => randomGraph(seed, i));
}
