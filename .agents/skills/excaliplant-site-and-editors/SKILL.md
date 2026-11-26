---
name: excaliplant-site-and-editors
description: Change the GitHub Pages playground or gallery, the browser worker, VS Code, or Obsidian integration.
---

# Site and editors

1. Trace the affected host to its renderer adapter. Pages uses `site/worker.mjs` and `site/playground/protocol.mjs`. `site/build.mjs` shims Node dependencies. VS Code and Obsidian bundle the library from `src/` and keep host dependencies in their own packages.
2. Exercise a graph and a non-graph render when touching the worker or lazy loading. Use the real browser smoke for navigation, worker messaging and the gallery mount under `/excaliplant/`.
3. Keep host trust, rendering options and DOM insertion in the owning adapter. VS Code can use a configured, trusted include root. Pages and Obsidian render offline without an include resolver. Follow the existing sanitizing and mounting helpers.
4. Install build tooling in the affected integration before running its bundle tests. The root suite can skip packaging tests when that tooling is missing.

```sh
npm run site
npm run site:smoke
node --test test/vscode.test.mjs test/vscode_build.test.mjs test/obsidian.test.mjs test/obsidian-build.test.mjs
```

Host-specific workflows are in [Pages](../../../docs/site.md), [VS Code](../../../docs/vscode.md) and [Obsidian](../../../docs/obsidian.md).
