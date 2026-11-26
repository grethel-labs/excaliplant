---
name: excaliplant-source-and-syntax
description: Change PlantUML block handling, preprocessing, detection or shared syntax. Use for comments, newpage, macros, includes, arrows, labels, skinparam, and diagnostics.
---

# Source and syntax

1. Reproduce the behavior through `parse()` or `detectKind()` in `src/api.mjs`. Keep an explicit block and a bare snippet in mind, and preserve original line numbers in diagnostics.
2. Follow `src/core/source.mjs` → `src/core/pipeline.mjs` → `src/core/preprocess/` → `src/core/registry.mjs`. Raw diagrams skip preprocessing and page splitting. For shared grammar, inspect `src/syntax/`. Start in the diagram module for grammar owned by one kind.
3. Budget expansion and scanning with `ctx.limits` or `DEFAULT_LIMITS`. Includes use the supplied resolver or bundled stdlib. Keep keys from diagram input in a `Map` or a null-prototype object. Prefer a scanner for ambiguous delimiters, and preserve strict-mode diagnostics.
4. Test the smallest parse case and any affected neighboring detection cases. Keep source limits, hostile-input regressions and resolver behavior in the security suite.

```sh
node --test test/preprocess.test.mjs test/detect.test.mjs test/syntax.test.mjs test/api.test.mjs test/security.test.mjs
```

The [guardrails](../../../docs/development/guardrails.md) describe the source and safety checks.
