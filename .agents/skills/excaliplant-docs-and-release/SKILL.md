---
name: excaliplant-docs-and-release
description: Update generated docs, gallery fixtures, the shipped agent skill, plugin archives, install rules, package manifests or release CI.
---

# Docs and release

1. Identify the tracked source in the [generator map](../../../docs/development/guidelines.md#generated-outputs). Edit the example, template, theme, or skill source. Run `npm run docs` and review the diff of the generated consumers.
2. For the shipped skill or plugins, follow `skills-src/excaliplant/` → `scripts/skills.mjs` → package, Claude/Codex/Gemini and archives. The marketplace trees have manifests, READMEs, license, privacy and icons. The pinned MCP launcher belongs to an archive that declares one, while the public directory builds omit the launcher.
3. For package or release changes, preserve the development version sentinel and run package/build checks. Use `release:major`, `release:minor`, `release:patch` or `release:none` to describe the intended merge outcome. The release job derives versions from tags and builds the generated plugin branch.
4. After an authorized merge, inspect the Release job and report the published version or the reason the label/job skipped publishing. See [releasing](../../../docs/releasing.md) for jobs that run after npm publication.

```sh
npm run docs:check
node --test test/skills.test.mjs test/codex_plugin.test.mjs test/plugin_ref.test.mjs
npm pack --dry-run
```
