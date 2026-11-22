# Performance

Rendering is fast for everything except graph diagrams (class, component, state, use case, deployment, …),
whose layout is computed by [ELK](https://github.com/kieler/elkjs). ELK dominates every graph render:
in a warm process roughly 78 % of the time is spent inside it and about 8 % in excaliplant itself.
Sequence, Gantt, mind map, WBS, JSON/YAML, salt, math, regex, EBNF and the other non-graph diagram types
do not use ELK at all (median of all examples, warm: about 2 ms).

## What is lazy and what is cached

- **ELK is loaded lazily.** `elkjs` (1.5 MB, about 0.5 to 0.9 s to evaluate) is imported with a dynamic
  `import()` the first time a graph layout actually has to run ELK. Importing excaliplant, and rendering any
  non-graph diagram, never loads it. A failed import is not remembered, so a later render retries.
  The only code that touches ELK is `src/diagrams/graph/elk_runner.mjs`.
- **Layouts are cached.** Between "ELK input graph built" and "ELK runs" sits a process-wide LRU cache. The
  key is the complete serialized ELK input (structure, node sizes, label sizes and text, every layout
  option), so identical input gives identical geometry without running ELK. The full string is the key
  (not a short hash), because a collision would silently return the geometry of another diagram.
  - Things that are not part of the ELK graph do not change the key: theme, seed, colours, sketch/clean
    strokes. Re-rendering a diagram in another theme is a cache hit. A different label, node, edge or
    layout option is a miss.
  - Results are deep-copied on the way in and out, so code that mutates a result can
    never change what later renders see.
  - Bounds: at most 64 entries and about 16 MiB (estimated: two bytes per character of key and result);
    a single entry above 4 MiB is not cached. Constants: `LAYOUT_CACHE_LIMITS` in `src/core/limits.mjs`.
  - Opt out per render with `render(src, { layoutCache: false })`.
  - Output is bit-identical with and without the cache (checked by hashing every example, see below).
- **`warmup()`** loads ELK and lays out a small class diagram (a container, labelled edges, multiplicities)
  so the first real graph render does not pay for loading and cold code. It is idempotent, shares one promise
  between calls, bypasses and does not fill the cache, discards its result and never rejects.

```js
import { warmup, render } from "@grethel-labs/excaliplant";
warmup(); // fire and forget at start-up; optionally `await warmup()`
```

## Numbers

Node 22, 2 cores, Linux, a noisy shared machine; medians of 7 runs (each in a fresh process), measured on a
quiet moment, with `node scripts/bench.mjs --cold -n 7`. Treat them as orders of magnitude.

| Cold start (fresh process)               | Before | After  |
| ---------------------------------------- | ------ | ------ |
| `import` of `src/index.mjs`              | 535 ms | 95 ms  |
| first non-graph render (sequence)        | 35 ms  | 36 ms  |
| first graph render (small class diagram) | 375 ms | 850 ms |
| import + first non-graph render          | 570 ms | 130 ms |
| import + first graph render              | 910 ms | 945 ms |

- Anything that never lays out a graph (a CLI call for a sequence diagram, a Markdown page without graph
  diagrams) starts about 0.45 s faster.
- The ELK cost did not disappear, it moved from `import` to the first graph render: the total to the first
  graph diagram is unchanged. `warmup()` runs that cost in the background: with a warm-up, the first real
  graph render took about 80 ms instead of about 1.1 s (the warm-up itself took about 0.9 s).

Warm (same process, all 41 examples, `render()` only, median of 7 runs per example, sketch theme):

| Warm                        | Before (= cache off) | Cache off    | Cache on (repeat) |
| --------------------------- | -------------------- | ------------ | ----------------- |
| sum of all examples         | about 590 ms         | about 600 ms | about 83 ms       |
| median example              | about 2.1 ms         | about 2.1 ms | about 1.7 ms      |
| slowest example (ELK graph) | about 65 ms          | about 67 ms  | about 6 ms        |

The cache does not make a cold or changed graph faster; it makes the repeat of an identical graph (same
diagram, another theme, a re-render after an unrelated edit, a live preview that re-renders the same text)
cost a copy instead of an ELK run. Later phases of the benchmark run on warmer JIT code, so a small part of
the "cache on" gain (about 10 to 15 %) is JIT, not the cache.

## V8 compile cache

`NODE_COMPILE_CACHE` (or `module.enableCompileCache()`) was measured on the CLI (`bin/excaliplant.mjs`,
sequence and class examples, interleaved runs with and without a populated cache, medians of 7 to 15 runs).
The gain varied between 2 % and 22 % from run to run (about 10 % typical), below the 20 % bar, so nothing
was changed. It is harmless to set in your own environment.

## How to benchmark

```sh
node scripts/bench.mjs                  # cold (n=7) and warm (n=5), human-readable
node scripts/bench.mjs --cold -n 7      # fresh process per measurement
node scripts/bench.mjs --warm -n 9      # per-example table, slowest first, with totals
node scripts/bench.mjs --json           # machine-readable
node scripts/bench.mjs --quick          # one run, a few examples (used by the test suite)
node scripts/bench.mjs --root <dir>     # benchmark another checkout, e.g. a baseline copy of main
node scripts/bench.mjs --golden write out.json   # hash every example (Excalidraw JSON + SVG, sketch + dark)
node scripts/bench.mjs --golden check out.json   # must report "identical" after an optimisation
```

Method: cold mode times the `import` and the first graph render and the first non-graph render, each
in its own freshly spawned `node`, and reports median, min and max. Warm mode renders every example in two
untimed passes (JIT, ELK), then measures `n` passes with the cache off, then `n` passes with it on. To compare
two versions, check one out into a second directory and pass it with `--root`, alternating the two a few
times; this machine class has run-to-run noise of 10 to 30 %.

There is deliberately no CI gate on timings (too noisy). `test/perf.test.mjs` checks the behaviour instead:
ELK stays unloaded after a non-graph render, no module imports ELK statically, cache hits do not call ELK,
non-geometric changes hit the cache and geometric ones miss, mutated results do not poison it, the cache is
bounded, `warmup()` is idempotent, and the benchmark script runs.

## Limits

- ELK is the main cost of graph diagrams and is outside our control; the cache only helps when the ELK input
  is byte-for-byte the same. Changing a single label re-runs ELK for the whole diagram.
- The cache lives in the process and is not shared between processes; a one-shot CLI call never benefits
  from it. Hosts that stay alive (MCP server, editor extensions) do.
- Lazy loading shifts the cost to the first graph render; it only saves time when a graph is never rendered
  or when `warmup()` hides it.
- `warmup()` costs about 1 s of CPU in the background; a host that renders only non-graph diagrams should not
  call it.
