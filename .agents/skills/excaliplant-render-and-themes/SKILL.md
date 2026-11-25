---
name: excaliplant-render-and-themes
description: Change Canvas, Excalidraw scenes, SVG or PNG output, typography, colour themes, or ELK loading and layout caching.
---

# Rendering and themes

1. Trace `src/core/pipeline.mjs` through `Canvas`, `decorate` and `validateDocument`. SVG consumes the scene, and PNG consumes the SVG. Preserve stable IDs and stroke seeds from `stableHash32` and keep renderer inputs independent of PlantUML.
2. Add named tokens to `src/draw/themes/base.json` and use inheritance in theme JSON. Use `roleStyle` and `themeColor` in consumers. Check skin overrides, ink/background contrast, transparency and exported HTML or SVG boundaries when relevant.
3. For fonts, edit or replace the bundled asset and regenerate `src/layout/font_metrics.mjs` from the TTF. Node font loading and browser font shims have different I/O contracts.
4. For ELK, preserve lazy loading, worker globals and private copies of cached geometry. Compare cache-on and cache-off output and prefer counts and bounds over fixed latency gates. Use `node scripts/bench.mjs --quick` for local timing comparisons.

```sh
npm run themes:check
node --test test/themes.test.mjs test/elk_options.test.mjs test/perf.test.mjs
npm run docs
```

The [performance notes](../../../docs/performance.md) describe the cache key and browser behavior.
