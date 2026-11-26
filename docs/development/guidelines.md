# Development guidelines

Use the skill table in [AGENTS.md](../../AGENTS.md) to find the owning subsystem. The [guardrails](guardrails.md) record which contracts run in CI.

## Finding the change

1. Start with the smallest input that reproduces the request and the closest existing fixture. For shared `@startuml` grammar, compare at least one neighboring kind if the detection can change.
2. Prefer the graph toolkit for node/edge diagrams and the existing specialized engine for its own family. Prefer `runRules` for independent line rules and a scanner for ambiguous delimiters. In modules that combine stages in one file, review the parse, layout and draw hooks separately.
3. Measure layout with the existing Excalifont helpers. Use semantic theme roles for paint. Compare cache-on and cache-off output when changing ELK inputs or the cache. Use the benchmark script to measure performance changes. Keep JSDoc on public contracts and comments in English.
4. Extend an example for syntax the gallery can demonstrate. Use a focused assertion for syntax or geometry that a gallery case would miss. Review the rendered SVG or PNG for overlap, clipped labels and routing. CI checks structural output and selected geometry regressions.
5. Add a targeted case to `test/security.test.mjs` when a change affects untrusted input, budgets, resource access or output escaping. Check new unbounded scans and hostile-input regexes for cost. Use `Map` or a null-prototype object for keys supplied by diagrams.
6. Add a line under Unreleased in `CHANGELOG.md` for user-visible behavior. Describe the example, security, visual and release impact in the PR. Those impact decisions require the author and reviewer to evaluate the change.

## Generated outputs

| Edit or update                                                                              | Regenerate                                             | Consumers                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `examples/`, `docs/README.template.md`, `docs/diagrams/`, `scripts/showcase.mjs`, rendering | `npm run docs`                                         | `README.md`, `docs/gallery.md`, `docs/gallery/`, `docs/assets/`, bundled examples |
| `src/draw/themes/*.json`                                                                    | `npm run docs`                                         | Theme definitions, gallery and theme previews                                     |
| `skills-src/excaliplant/`, CLI help, bundled examples                                       | `npm run docs`                                         | `skills/`, plugin skills and Gemini instructions                                  |
| Excalidraw typing snapshot                                                                  | `npm run spec:update`                                  | `skills-src/excalidraw-spec/` and skill references                                |
| `assets/fonts/Excalifont-Regular.ttf`                                                       | `node scripts/gen-font-metrics.mjs` and `npm run docs` | `src/layout/font_metrics.mjs` and rendered docs                                   |
| `docs/development/diagrams/*.puml`                                                          | `npm run docs`                                         | Editable `.excalidraw` and inline `.svg` previews beside their source             |
| `site/`, site bundler, examples and library                                                 | `npm run site`                                         | Untracked `_site/`, used by the browser smoke test and Pages                      |

Review the generated diff and include affected tracked artefacts. The release workflow produces `plugin-release` from the committed sources after npm publication. See [release troubleshooting](../releasing.md) for verifying the workflow after merge.
