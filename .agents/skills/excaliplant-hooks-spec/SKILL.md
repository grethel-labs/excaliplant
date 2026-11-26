---
name: excaliplant-hooks-spec
description: Keep the public element hook and tooltip specification, JSON Schema and usage examples aligned with excaliplant's PlantUML directives, scene metadata and browser behavior.
---

# Element hook contract

Start with the [element hook specification](../../../docs/hooks.md) or
[element tooltip specification](../../../docs/tooltips.md) and the shared
[JSON Schema](../../../docs/hooks.schema.json). Reproduce the behavior through
`render()`, `toSvg({ interactive: true })` and the browser helpers. Compare the
observed behavior with the last released contract before documenting a change.

| Contract area                                                  | Owning code                                                                                                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Preamble, selectors, property names, diagnostics               | [hook parser](../../../src/syntax/hooks.mjs), [style parsing](../../../src/syntax/skin.mjs), [pipeline](../../../src/core/pipeline.mjs) |
| Grouping, scene fields, theme defaults                         | [Canvas](../../../src/draw/canvas.mjs), [base theme](../../../src/draw/themes/base.json)                                                |
| Visual states, pointer and keyboard events, listener lifecycle | [SVG renderer](../../../src/render/svg.mjs), [browser helpers](../../../src/browser/hooks.mjs)                                          |

Update the affected spec sections, schema and README example in the same change
as observable behavior. Use `id`, `classes` and the exported event payload in
consumer examples. Keep SVG marker details and the spelling of scene grouping
tokens outside the public contract. Treat discrepancies that break existing
consumers as regressions unless the change intentionally revises the contract.
Check the [release guide](../../../docs/releasing.md) for intentional API changes.

Exercise the specification example in [hook tests](../../../test/hooks.test.mjs).
For listener or visual behavior, run the [real browser test](../../../test/hooks-browser.test.mjs)
with `EXCALIPLANT_HOOKS_BROWSER_TEST=1`. Verify scene metadata and serialized
event details against the schema when changing their fields. Run `npm run docs`
after editing the [README template](../../../docs/README.template.md) and
`npm run docs:check` to verify generated output.

For tooltip changes, verify `customData.excaliplantTooltip` against the schema's
`elementTooltip` definition and confirm the Playground preview with and without
hooks through `npm run site` and `npm run site:smoke`.
