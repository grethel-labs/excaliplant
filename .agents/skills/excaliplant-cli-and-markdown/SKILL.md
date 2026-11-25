---
name: excaliplant-cli-and-markdown
description: Change the excaliplant CLI, Markdown fences, output files, Markdown render cache, markdown-it, remark or the composite GitHub Action.
---

# CLI and Markdown

1. Start at `bin/excaliplant.mjs` for arguments, files and output selection. For fences, follow `src/markdown/scan.mjs` → `document.mjs` / plugin → `render.mjs` → the shared API. Keep renderer and Markdown scan independent of host I/O.
2. Preserve line offsets, EOLs, unrelated Markdown and idempotence. If render options change, check which options affect block hashes and whether an include resolver makes a result uncacheable.
3. Preserve SVG sanitizing, safe asset paths and output budgets. Keep file writes in the injected writer or CLI. The CLI’s include resolver is opt-in and checks real paths, so test the real I/O path when it changes.
4. Test the public command and affected plugins. If help changes, regenerate the skill’s CLI reference with `npm run docs`.

```sh
node --test test/cli.test.mjs test/markdown.test.mjs test/security.test.mjs
```

See [Markdown usage](../../../docs/markdown.md) for adapter-specific options.
