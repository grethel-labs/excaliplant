# Repository instructions for editing agents

This is the shared entry point for Codex, Claude Code, Gemini, Copilot, Cursor, Windsurf, Cline and Roo. Their instruction files point here.

When implementing an existing issue, follow the [ticket workflow](.agents/skills/excaliplant-ticket-workflow/SKILL.md) from planning through review and delivery.

## Work in this order

1. Reproduce the change through the closest public entry point or example. Trace it to the owning layer.
2. Read the relevant development skill below. Read the [guardrails](docs/development/guardrails.md) for the CI contracts and the [guidelines](docs/development/guidelines.md) for review decisions.
3. Change the owning layer, cover the behavior, regenerate affected outputs from their sources, and run the local gate. Follow the review guidance for diagrams, security, and release notes.

## Choose a development skill

| Change                                                                 | Skill                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Source blocks, macros, diagnostics, detection, shared PlantUML grammar | [Source and syntax](.agents/skills/excaliplant-source-and-syntax/SKILL.md)    |
| A diagram family, parser, layout, or connector                         | [Diagram modules](.agents/skills/excaliplant-diagram-modules/SKILL.md)        |
| Canvas, SVG/PNG, fonts, themes, ELK performance                        | [Rendering and themes](.agents/skills/excaliplant-render-and-themes/SKILL.md) |
| CLI or Markdown conversion and plugins                                 | [CLI and Markdown](.agents/skills/excaliplant-cli-and-markdown/SKILL.md)      |
| MCP protocol, tools, limits, transports, workers                       | [MCP server](.agents/skills/excaliplant-mcp-server/SKILL.md)                  |
| Pages playground and gallery, VS Code, Obsidian                        | [Site and editors](.agents/skills/excaliplant-site-and-editors/SKILL.md)      |
| Element hook directives, metadata, browser events, or compatibility    | [Hook specification](.agents/skills/excaliplant-hooks-spec/SKILL.md)          |
| Generated docs, shipped skills, package/plugin builds, releases        | [Docs and release](.agents/skills/excaliplant-docs-and-release/SKILL.md)      |

The skills above guide repository changes. The user-facing `excaliplant` skill has its source in `skills-src/excaliplant/` and is distributed with the package and plugins.

## Write GitHub and Git messages

- [GitHub issues](.agents/skills/excaliplant-github-issues/SKILL.md) for bug reports and proposals.
- [Pull request descriptions](.agents/skills/excaliplant-pull-requests/SKILL.md) for changes and their verification.
- [Commit messages](.agents/skills/excaliplant-commit-messages/SKILL.md) for a Git commit's subject and optional body.

## Follow the pipeline

```text
PlantUML → source → preprocess → registry → parse → layout → draw → Excalidraw → SVG → PNG
```

- `src/index.mjs` and `src/api.mjs` expose the public API. `src/core/` owns source blocks, limits, preprocessing, diagnostics and orchestration. Shared PlantUML syntax lives in `src/syntax/`.
- Diagram modules define detection, parsing, layout and drawing. Parsers produce models with `createMeta()`. Layout computes geometry and may measure text. Draw code passes geometry and theme roles to `Canvas`, which creates Excalidraw elements. The format renderers consume the scene.
- Host adapters own I/O and options. The rendering pipeline handles untrusted input. Use bounds from `DEFAULT_LIMITS`, pass includes through the caller's resolver, and preserve sanitized output and deterministic seeded rendering.
- The [architecture](docs/architecture.md) describes the runtime in detail. The [system overview](docs/development/overview.md) shows the runtime, adapters, CI and release in editable diagrams.

## Validate and open a PR

```sh
npm run guardrails
npm run check
npm audit --omit=dev --audit-level=high
```

`npm run guardrails` is the fast standalone architecture check and also runs in `npm test`. Format with Prettier and document public API contracts in JSDoc. Use `npm run docs` for changed generated outputs. For site or worker changes, also run `npm run site` and `npm run site:smoke`.

Branch from current `main` and open the PR into `main` with one supported release label. Keep the committed package version at `0.0.0-development`. The [release guide](docs/releasing.md) covers automated publishing and post-merge verification.
