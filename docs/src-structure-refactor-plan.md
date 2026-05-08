# Source Structure Refactor Plan

## Goal

Make diagram modules the primary source structure. The base diagram module must
be the template every concrete diagram module mirrors. General reusable runtime
code should be separate from main orchestration and low-level utilities.

## Target Structure

```text
src/
  diagrams/
    base/
      artifacts.mjs
      assets.mjs
      dependencies.mjs
      docs.mjs
      index.mjs
      layout.mjs
      module.mjs
      parser.mjs
      renderer.mjs
      security.mjs
      tests.mjs
    class/
      assets.mjs
      docs.mjs
      layout.mjs
      module.mjs
      parser.mjs
      render.mjs
      security.mjs
      style.mjs
      tests.mjs
      docs/
        index.template.md.njk
        features/
      tests/
        scenarios/
        fixtures/
        expected/
    component/
      assets.mjs
      docs.mjs
      layout.mjs
      module.mjs
      parser.mjs
      render.mjs
      security.mjs
      tests.mjs
      docs/
        index.template.md.njk
        features/
      tests/
        scenarios/
        fixtures/
        expected/
    sequence/
      assets.mjs
      context.mjs
      docs.mjs
      layout.mjs
      layout_engine.mjs
      module.mjs
      parser.mjs
      render.mjs
      render_excalidraw.mjs
      security.mjs
      spacing.mjs
      tests.mjs
      plugins/
      docs/
        index.template.md.njk
        features/
      tests/
        scenarios/
        fixtures/
        expected/
    shared/
      graph_context.mjs
      graph_parser.mjs
      graph_runtime.mjs
      graph_plugins/
    index.mjs
  main/
    builtin.mjs
    dependencies.mjs
    introspection.mjs
    metadata.mjs
    parser.mjs
    pipeline.mjs
    registry.mjs
  general/
    layout/
    model/
    platform/
    render/
    style/
  util/
    parser_engine.mjs
    plantuml_utils.mjs
self/
  collectors/
  diagrams/
  templates/
  tests/
  output/
    manifest.json
    puml/
    excalidraw/
    svg/
    png/
docs/
  main/
  build/
  guides/
  reference/
  ressources/generated/modules/<kind>/
  tickets/
```

The module `docs/` and `tests/` folders are source-of-truth folders, not just
manifest labels. The generated SVG/Excalidraw/PNG review outputs mirror the
module and feature path under `docs/ressources/generated/modules/<kind>/...`.
The root-level `self/` system owns repository self diagrams and writes a
manifest that the docs build consumes.

Legacy source folders are removed. Public package subpath aliases remain stable
through `package.json` exports that point directly to primary files:

```text
./parser/plantuml -> ./src/main/parser.mjs
./parser/engine   -> ./src/util/parser_engine.mjs
./layout          -> ./src/general/layout/elk_layout.mjs
./render/*        -> ./src/general/render/*.mjs
./modules/*       -> ./src/main or ./src/diagrams targets
./platform/*      -> ./src/general/platform/*.mjs
./model           -> ./src/general/model/diagram.mjs
./style           -> ./src/general/style/style.mjs
```

## Implementation Loop

Each step follows this loop:

1. Apply the smallest mechanical change.
2. Run a targeted validation command.
3. Fix only issues caused by that step.
4. Update tests or docs when the architecture contract changed.
5. Continue only after the step is green.

## Fine-Grained Steps

### 1. Create the plan and baseline

- Add this plan file.
- Capture current structure and imports.
- Baseline validation: `npm run typecheck`.
- Feedback criterion: current code is understood before moving files.

### 2. Promote diagram modules

- Move `src/modules/base/` to `src/diagrams/base/`.
- Move `src/modules/diagrams/{sequence,class,component,shared}/` to `src/diagrams/`.
- Add `src/diagrams/index.mjs` as the primary built-in diagram module collection.
- Feedback criterion: every concrete diagram module imports base facets from `../base/`.

### 3. Add main orchestration

- Move main registry/orchestration files from `src/modules/` to `src/main/`:
  `builtin`, `dependencies`, `introspection`, `metadata`, `pipeline`, `registry`.
- Move the real `parsePlantUml` implementation to `src/main/parser.mjs`.
- Feedback criterion: orchestration imports diagrams from `../diagrams/` and general services from `../general/`.

### 4. Add general runtime area

- Move input-agnostic runtime folders to `src/general/`:
  `layout`, `model`, `platform`, `render`, `style`.
- Remove old root folders after `package.json` exports point to the new primary files.
- Feedback criterion: diagram modules no longer import from old root runtime folders.

### 5. Add util area

- Move generic parser engine/helpers to `src/util/parser_engine.mjs` and
  `src/util/plantuml_utils.mjs`.
- Delete the old parser entry files after public exports point directly to `src/util/`.
- Feedback criterion: main parser and diagram plugins use `src/util/` imports.

### 6. Preserve public aliases without legacy files

- Keep `package.json` public subpath names stable where useful, but point them
  directly at `src/diagrams`, `src/main`, `src/general`, and `src/util`.
- Delete legacy top-level source folders: `src/modules`, `src/parser`,
  `src/layout`, `src/render`, `src/model`, `src/platform`, and `src/style`.
- Feedback criterion: architecture tests fail if a legacy source folder returns.

### 7. Enforce base-derived internal classes

- Verify every concrete parser/layout/renderer/docs/tests/security/assets class
  extends its matching base class.
- Add or update regression tests for this inheritance contract.
- Feedback criterion: tests fail if a module uses plain objects instead of base facets.

### 8. Update generated self diagrams and docs

- Ensure introspection reports `src/diagrams/` artifact roots.
- Rebuild docs so module diagrams reflect the new source layout.
- Feedback criterion: build manifest matches generated artifacts.

### 9. Full validation gate

- `npm run format`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run format:check`
- `node docs/scripts/check-build-manifest.mjs`
- `npm audit --omit=dev --audit-level=high`
- Feedback criterion: all commands pass, or any remaining failure is documented with exact cause.

### 10. Move module-owned tests and docs into module folders

- Add physical `src/diagrams/<kind>/tests/` and `src/diagrams/<kind>/docs/`
  folders for each existing diagram module.
- Move diagram-specific parser/layout/render/security scenarios from root tests
  into the owning module when they are not cross-module contracts.
- Move diagram-specific coverage examples and docs templates into the owning
  module.
- Make `ModuleDocsManifest` and `ModuleTestManifest` point to those physical
  folders and validate them in architecture tests.
- Feedback criterion: deleting a module docs/tests folder fails the module
  contract tests, while root tests remain focused on cross-module behavior.

### 11. Extract the Self-generation subsystem

- Create root `self/` with collectors, diagram definitions, templates, tests and
  `output/manifest.json`.
- Move current `docs/scripts/self-diagrams.mjs` behavior into `self/` or turn it
  into a thin compatibility adapter.
- Add collectors for every useful project self diagram: modules, dependencies,
  parser plugins, render callflow, docs/tests/assets ownership, security
  capabilities, model families and package exports.
- Make `docs/scripts/build-docs.mjs` consume self diagrams from
  `self/output/manifest.json` instead of owning their definitions.
- Feedback criterion: a newly registered diagram module appears in Self output
  without changing Docs scripts.

### 12. Clean up docs architecture without touching tickets

- Separate root docs into main templates, guides/reference pages, build
  collectors and generated outputs.
- Move diagram-specific docs content into `src/diagrams/<kind>/docs/`.
- Keep `docs/tickets/` intact as a temporary planning folder; do not delete,
  move or fold it into generated docs during this cleanup.
- Decide whether `docs/ressources/generated/` remains the stable output path or
  gets a compatibility migration to `docs/resources/generated/`.
- Feedback criterion: docs build reads module docs and self outputs by manifest,
  and `docs/tickets/` survives unchanged.

## Compatibility Policy

- Public package subpaths may keep their old names, but must not require legacy
  source files.
- Old implementation folders are deleted, not kept as wrappers.
- New implementation should prefer `src/diagrams`, `src/main`, `src/general`, and `src/util`.
- No unrelated renderer/parser behavior changes are part of this refactor.
- Module-owned docs/tests migration is structural; behavior changes still require
  dedicated parser/layout/renderer tickets and regression tests.
- `docs/tickets/` is ignored and temporary, but it must not be destroyed by docs
  architecture cleanup work.

## Feedback Log

- Baseline typecheck passed before the move.
- Legacy folders were removed and typecheck passed afterwards.
- Shared parser helpers were extracted for title parsing and block-line collection.
- Focused tests passed: `npm run typecheck` and `node --test tests/edge_cases.test.mjs tests/modular_architecture.test.mjs`.
- Follow-up target added: module-owned docs/tests folders, root `self/` system,
  generated module output mirrors and docs architecture cleanup.
