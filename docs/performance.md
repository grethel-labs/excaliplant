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

## ELK options

Question: can the ELK input (layout options, graph shape) be trimmed so ELK runs faster **without changing a
single output byte**? Rule: quality beats speed. A change counts only if the geometry stays bit-identical on a
wide corpus; "looks similar" does not count. Result: **nothing was adopted**; no variant was both identical
and measurably faster.

Harness: `node scripts/elk-experiments.mjs` (corpus generator in `scripts/elk-corpus.mjs`). Variants wrap
`ELK.prototype.layout`, so production code is never touched.

- Corpus: 411 inputs that really run ELK (examples 44 including 32 polyline/left-to-right variants of the
  examples and test sources, 54 `@start…@end` blocks from `test/*.test.mjs`, 313 seeded random graphs: 2 to 40
  nodes, up to 80 edges, cycles, self loops, nested containers up to depth 3, edge labels, multiplicities,
  choice/fork/join ports, actors with icon ports, LR and TB, polyline routing, isolated nodes). Kinds:
  class, object, component, deployment, state, use case, legacy activity and DOT, plus the graph examples of
  the other kinds (C4, ArchiMate, Chen, …). Reference = SHA-256 of Excalidraw JSON and SVG, sketch and dark theme (822 hashes), taken with the
  unchanged code; `check` reproduces it.
- Identity test: the raw ELK result of every one of the 411 graphs, compared field by field (ELK echoes its
  input, so `layoutOptions`, label `text`, empty arrays and the internal `$H` counter are ignored). A control
  variant ("noop") must report 0 differences, and does.
- Where the time goes (warm, layout cache off, median of 7): ELK is 89 to 96 % of the render time in every size
  class. Median per input: 11 ms (up to 8 nodes), 31 ms (9 to 20), 93 ms (over 20 nodes), 243 ms (over 20
  nodes with containers). Containers (hierarchy handling) multiply the cost: the same node count is 2.6 times
  slower with containers. The median ELK time per node is about 2 to 4 ms, rising to 7 ms above 25 nodes.

| Candidate                                                    | Raw geometry identical (of 411) | Speed                 |
| ------------------------------------------------------------ | ------------------------------- | --------------------- |
| noop (control)                                               | yes (0 differ)                  | 0 % (noise)           |
| drop edge `priority.direction=0` (is the default)            | yes                             | not measurable        |
| drop empty edge `layoutOptions {}` / empty `labels []`       | yes                             | not measurable        |
| drop `mergeEdges=false`, `edgeLabels.inline=false`           | yes                             | not measurable        |
| drop `forceNodeModelOrder=false`, `sideSelection=SMART_DOWN` | yes                             | not measurable        |
| drop `separateConnectedComponents=true` / set it to `false`  | yes                             | not measurable        |
| drop `edgeRouting=ORTHOGONAL`, `algorithm=layered`           | yes                             | not measurable        |
| explicit `debugMode/validateGraph/validateOptions=false`     | yes                             | not measurable        |
| all of the identical ones combined                           | yes                             | -0.6 % (noop: -0.3 %) |
| `SEPARATE_CHILDREN` for graphs without containers            | no (122 differ)                 | not pursued           |
| remove `hierarchyHandling` for graphs without containers     | no (122 differ)                 | not pursued           |
| `SEPARATE_CHILDREN` when no edge crosses a container border  | no (140 differ)                 | not pursued           |
| drop label `text` from ELK labels                            | no (323 differ)                 | not pursued           |
| no spacing options repeated on containers                    | no (168 differ)                 | not pursued           |
| `thoroughness` 7 (ELK default) instead of 10                 | no (22 differ)                  | not pursued           |
| `thoroughness` 3 / 1                                         | no (76 / 118 differ)            | not pursued           |
| `thoroughness` 1 only for graphs with at most 3 nodes        | yes                             | -0.6 % (noop: -1.7 %) |
| `greedySwitch.type=OFF`                                      | yes                             | -1.8 % (noop: -1.7 %) |

Speed numbers are the summed median ELK time over the graphs (direct `elk.layout` calls on the captured input
graphs, JIT warm, alternating variants over several rounds), positive = faster. The noise floor was measured with
the control variant: about +-2 to 6 % per size class. A first, non-interleaved run reported -150 % to +50 % for
pure no-ops and was discarded.

What we take from this:

- The identical variants only remove bytes from the input JSON. ELK's time is spent in its layout phases (layering,
  crossing minimisation, node placement, routing), not in reading options, so none is faster than the noise floor.
  The two identical variants that touch an algorithm (`greedySwitch` off, `thoroughness` 1 for tiny graphs) are
  identical on this corpus (presumably because those phases have little to change with hierarchy handling and
  tiny graphs; this is not proven), and they are equally not faster (this was measured on the 377 graphs with up to 25 nodes).
- Every variant that would change the algorithm's work (`SEPARATE_CHILDREN`, lower `thoroughness`, no label text,
  no container spacing) changes the geometry on part of the corpus. These are exactly the quality settings; they
  were not adopted, and their speed was not pursued.
- So the production options in `src/diagrams/graph/layout.mjs` stay as they are. `test/elk_options.test.mjs`
  pins the quality-relevant options (`INCLUDE_CHILDREN`, `thoroughness` 10, `NETWORK_SIMPLEX`,
  `NODES_AND_EDGES`, `DEPTH_FIRST`, container spacing, side-fixed ports) so they cannot be loosened for speed
  by accident.
- Not covered here (outside the option set): elkjs delivers its result through `setTimeout` hops of its in-process
  worker (about 1 ms per hop), which shows as a floor of a few ms even for tiny graphs. That lives in the runtime
  binding, not in the options.

Re-run: `node scripts/elk-experiments.mjs baseline | check | screen -n 5 -v <ids> | list`. Reference data
goes to `$ELK_TMP`.
