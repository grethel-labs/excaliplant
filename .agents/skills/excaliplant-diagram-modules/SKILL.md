---
name: excaliplant-diagram-modules
description: Add or extend a diagram family, parser rule, layout engine or connector. Use for diagram-specific behavior and layout regressions.
---

# Diagram modules

1. Start with the closest fixture in `examples/<kind>/`. Find the registered module and its priority in `src/diagrams/index.mjs`. Compare a small ambiguous `@startuml` input with neighboring kinds when adjusting `score()`.
2. Put the parser rule in the owning module and preserve its `createMeta()` model. Use `graphModule`, `parseDeclaration`, `parseLink`, `layoutGraph`, and `drawGraph` for node/edge families when their contracts fit. For the specialized engines, follow the owning family’s model and layout.
3. Keep geometry in layout. Use `layoutText` for measured labels and `src/layout/labels.mjs` to avoid overlap. Draw via `Canvas`, shape helpers and theme roles. Check routes, arrowheads, bounds and labels against the rendered picture.
4. Register new kinds with a showcase entry in `scripts/showcase.mjs` and at least one warning-free example. Add a fixture or focused geometry assertion that fails for the behavior you changed. Regenerate the gallery when examples or rendering change.

```sh
node --test test/detect.test.mjs test/examples.test.mjs
node bin/excaliplant.mjs examples/class/shop-domain.puml --strict -o /tmp/excaliplant-review.svg
npm run docs
```

For collision and routing work, use the applicable `test/visual-*.test.mjs` and `test/layout-quality.test.mjs`.
