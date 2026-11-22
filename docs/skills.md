# Agent skill

excaliplant ships an [Agent Skill](https://agentskills.io/specification) that teaches AI coding tools when and how to draw diagrams with it: write PlantUML, call the CLI, read the warnings, fix and re-render. The skill is built with every release, contains the current Excalidraw file format reference and installs with one command.

```sh
npx -y @grethel-labs/excaliplant skills install --tool all
```

## Install

### Universal installer

`excaliplant skills install` copies the skill that is bundled in the npm package to the folder each tool reads.

```sh
npx -y @grethel-labs/excaliplant skills list
npx -y @grethel-labs/excaliplant skills install --tool claude            # this project
npx -y @grethel-labs/excaliplant skills install --tool codex --scope user # your home directory
npx -y @grethel-labs/excaliplant skills install --tool all --dry-run
npx -y @grethel-labs/excaliplant skills install --tool rules             # rule files for tools without skills
npx -y @grethel-labs/excaliplant skills install --dir ~/my-skills        # any folder
```

| Option                         | Meaning                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `--tool <id[,id]\|all\|rules>` | Target tools. `all` is every tool with skill support, `rules` the rule-file tools. Required. |
| `--scope project\|user`        | Below the current directory (default) or the home directory.                                 |
| `--dir <path>`                 | Install below this folder instead of the tool's own location (single tool only).             |
| `--force`                      | Overwrite an existing installation. Without it nothing existing is touched (exit code 1).    |
| `--dry-run`                    | Print the files that would be written.                                                       |

Everything is written below `<target>/excaliplant/` (or the single rule file); the installer refuses any path that would leave that folder.

| `--tool`               | Project scope                                      | User scope                       | Kind  |
| ---------------------- | -------------------------------------------------- | -------------------------------- | ----- |
| `claude`               | `.claude/skills/excaliplant/`                      | `~/.claude/skills/excaliplant/`  | skill |
| `agents`               | `.agents/skills/excaliplant/`                      | `~/.agents/skills/excaliplant/`  | skill |
| `codex`                | `.agents/skills/excaliplant/`                      | `~/.agents/skills/excaliplant/`  | skill |
| `gemini`               | `.gemini/skills/excaliplant/`                      | `~/.gemini/skills/excaliplant/`  | skill |
| `opencode`             | `.opencode/skills/excaliplant/`                    | `~/.config/opencode/skills/...`  | skill |
| `cursor`               | `.cursor/skills/excaliplant/`                      | `~/.cursor/skills/excaliplant/`  | skill |
| `copilot`              | `.github/skills/excaliplant/`                      | `~/.copilot/skills/excaliplant/` | skill |
| `antigravity`          | `.agents/skills/excaliplant/`                      | `~/.gemini/config/skills/...`    | skill |
| `cursor-rules`         | `.cursor/rules/excaliplant.mdc`                    | none                             | rule  |
| `windsurf`             | `.windsurf/rules/excaliplant.md`                   | none                             | rule  |
| `cline`                | `.clinerules/excaliplant.md`                       | `~/Documents/Cline/Rules/...`    | rule  |
| `roo`                  | `.roo/rules/excaliplant.md`                        | `~/.roo/rules/excaliplant.md`    | rule  |
| `copilot-instructions` | `.github/instructions/excaliplant.instructions.md` | none                             | rule  |

The paths come from each tool's documentation (see [sources](#sources-and-open-questions)); they are data in [`src/skills/targets.mjs`](../src/skills/targets.mjs).

### Claude Code (plugin)

```text
/plugin marketplace add grethel-labs/excaliplant
/plugin install excaliplant@grethel-labs
```

On Claude Code 2.1.275 or later one step is enough: `/plugin install excaliplant --marketplace grethel-labs/excaliplant`. The plugin ([`integrations/claude-plugin/`](../integrations/claude-plugin)) contains the skill and registers the MCP server `npx -y -p @grethel-labs/excaliplant excaliplant-mcp`. The skill is then available as `/excaliplant:excaliplant` and loads automatically for diagram requests. Without the plugin, `skills install --tool claude` is enough.

### Gemini CLI (extension)

```sh
gemini extensions install https://github.com/grethel-labs/excaliplant
```

Gemini requires `gemini-extension.json` in the repository root, so it lives there ([`gemini-extension.json`](../gemini-extension.json)). The extension's skills come from the root `skills/` folder, its context from [`integrations/gemini-extension/GEMINI.md`](../integrations/gemini-extension/GEMINI.md), and it registers the MCP server. Each release also attaches `excaliplant-gemini-extension-<version>.zip` with the same layout (manifest at the archive root).

### Claude.ai and Claude Desktop

Download `excaliplant-skill-<version>.zip` from the [GitHub release](https://github.com/grethel-labs/excaliplant/releases), then upload it under Customize > Skills (code execution must be enabled). The zip contains the skill folder `excaliplant/` as its root, as required. Custom skills do not sync between claude.ai, Claude Code and the API. According to Anthropic's documentation, skills on claude.ai can have restricted network access depending on user and admin settings. `npx` has to download the package, so the CLI may not work there (untested).

### Without code execution

When a surface cannot run `npx` (a chat without code execution, or a sandbox without access to npm), the skill tells the model to show the PlantUML in a code block and to add a link to the live editor with the text in the URL: `https://grethel-labs.github.io/excaliplant/#src=<percent-encoded PlantUML>` (see "Plain-text links" in [`site.md`](site.md)). The part after `#` is never sent to a server; the editor renders it live and exports SVG, PNG and `.excalidraw`.

### ChatGPT

OpenAI's help center describes [Skills in ChatGPT](https://help.openai.com/en/articles/20001066-skills-in-chatgpt) following the same SKILL.md format, and the API documentation states that a skill is uploaded as a zip with a single top-level folder (limits: 50 MB, 500 files). The release zip `excaliplant-skill-<version>.zip` has exactly that shape and its files are marked readable, which a community report names as a requirement. We have not tested an upload in ChatGPT, and ChatGPT's code sandbox may not have network access for `npx`. If the skill does not work there, use one of these fallbacks:

- Custom GPT or project instructions: paste [`skills/excaliplant/assets/rules.md`](../skills/excaliplant/assets/rules.md) into the instructions. The GPT can then write correct PlantUML for you to render locally, but it cannot run the CLI itself.
- The [MCP server](#mcp-server) is a local stdio server; we have not verified how (or whether) ChatGPT can connect to it.

### Codex, opencode, Cursor, Copilot, Antigravity

All of them read the same skill folder format. `skills install --tool <id>` writes it to the right place. The shared `.agents/skills/` folder (tool `agents`) is read by Codex, Cursor, Copilot, Gemini CLI, opencode and Antigravity according to their documentation, so one project-level install covers them. `excaliplant-agents-skills-<version>.zip` unpacks to `.agents/skills/excaliplant/` in a project or in your home directory.

### Rule files: Windsurf, Cline, Roo, Cursor rules, Copilot instructions

These tools use plain rule files. `skills install --tool rules` writes a short variant of the skill (`assets/rules.md`) wrapped in each tool's frontmatter. `excaliplant-rules-<version>.zip` contains the same files at their project paths. Cursor, Copilot and Gemini CLI also read skills, so prefer the skill install for them.

### Ollama and other plain model runners

Ollama has no skill concept and does not run commands, so the model can only write PlantUML for you. Put the guidance into a Modelfile ([syntax](https://docs.ollama.com/modelfile)) and render the result yourself:

```text
FROM llama3.2
SYSTEM """
You write PlantUML. Answer with exactly one @startuml ... @enduml block (or the
dedicated start keyword such as @startmindmap), start with a title, keep labels
short and do not use Mermaid. The user renders it with:
npx -y @grethel-labs/excaliplant diagram.puml -o diagram.svg
"""
```

Build and run it with `ollama create plantuml-helper -f Modelfile` and `ollama run plantuml-helper`. Agents that run on top of Ollama models (opencode, Cline, Roo and similar) can use the skill or rule files above, or the MCP server, with whatever model they are configured for.

### MCP server

`npx -y -p @grethel-labs/excaliplant excaliplant-mcp` starts the MCP server that ships in the same package. The Claude Code plugin and the Gemini extension register it automatically. The skill tells the model to prefer MCP tools when they are connected and to fall back to the CLI otherwise.

## What is in the skill

```text
skills/excaliplant/
  SKILL.md                    trigger description, workflow, rules (short)
  references/cli.md           every CLI option (generated from --help)
  references/syntax.md        tested PlantUML cheat sheet
  references/diagram-types.md all diagram kinds with start keywords
  references/examples.md      index of the bundled examples
  references/excalidraw-spec.md  the Excalidraw JSON format (see below)
  assets/examples/*.puml      one tested example per diagram type
  assets/rules.md             the short variant used for rule files
skills/manifest.json          file list for `skills install`
```

`SKILL.md` stays below 120 lines and loads on demand; the details are read only when needed (progressive disclosure, as the specification recommends). The frontmatter uses only `name`, `description`, `license`, `compatibility` and `metadata`, the fields accepted everywhere, including claude.ai uploads, and a description of at most 200 characters, the strictest limit any documented consumer states.

## How it is built

- Source: [`skills-src/`](../skills-src). Generator: [`scripts/skills.mjs`](../scripts/skills.mjs). Output: `skills/` (shipped in the npm package), a copy inside `integrations/claude-plugin/skills/` and `integrations/gemini-extension/GEMINI.md`. All of it is committed and marked "generated - do not edit".
- `node scripts/skills.mjs` writes, `node scripts/skills.mjs --check` fails on drift (CI), `node scripts/skills.mjs --pack <dir>` builds the release artefacts.
- Deterministic: no network, no clock. CLI reference, diagram types, themes, examples and the Excalidraw reference come from the code and the committed snapshot. Formatting uses the repository's Prettier configuration.
- The package version is the placeholder `{{version}}` (only in the `metadata` of `SKILL.md`). `skills install` fills it from the installed package; `--pack` fills it from `EXCALIPLANT_VERSION` (falling back to `package.json`).

### Release artefacts

`EXCALIPLANT_VERSION=1.2.3 node scripts/skills.mjs --pack dist-skills` writes:

| File                                   | Purpose                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `excaliplant-skill-<v>.zip`            | Claude.ai, Claude Desktop, ChatGPT and any "upload a skill" dialog |
| `excaliplant-agents-skills-<v>.zip`    | Unpacks to `.agents/skills/excaliplant/`                           |
| `excaliplant-claude-plugin-<v>.zip`    | Claude Code plugin (with `plugin.json` version and `.mcp.json`)    |
| `excaliplant-gemini-extension-<v>.zip` | Gemini CLI extension with the manifest at the archive root         |
| `excaliplant-rules-<v>.zip`            | Rule files for Cursor, Windsurf, Cline, Roo and Copilot            |
| `SHA256SUMS`                           | Checksums                                                          |

The ZIP files are byte-reproducible: sorted entries, fixed timestamp, fixed permissions (files 0644), entries stored without compression so the result does not depend on the zlib version. Archives are written by a small built-in ZIP writer ([`scripts/skills-archive.mjs`](../scripts/skills-archive.mjs)); no `zip` binary is needed.

## Keeping the Excalidraw reference current

The skill's `references/excalidraw-spec.md` is generated from a committed snapshot of the element typings published by Excalidraw: `skills-src/excalidraw-spec/element-types.d.ts.txt` (the verbatim `types.d.ts` of `@excalidraw/element`) and `meta.json` (package, version, source URL, SHA-256, fetch date). Two small hand-maintained files add what the typings do not spell out (`constants.json`: font ids, alignment values, roundness ids; `notes.md`: editing rules).

Why a snapshot and not a `devDependency`: `@excalidraw/element` is published only under commit-hash pre-release versions (for example `0.18.0-f0063e113`), which Dependabot cannot order reliably; the full `@excalidraw/excalidraw` package is 46 MB with React peer dependencies. A snapshot keeps the install footprint of the main package and the build offline and deterministic.

Refresh it with:

```sh
node scripts/update-excalidraw-spec.mjs        # fetch latest typings (needs network)
node scripts/skills.mjs                        # regenerate the reference
node scripts/update-excalidraw-spec.mjs --check  # exit 1 when npm has a newer version
```

`test/skills.test.mjs` renders one example per diagram type and checks that every element only uses element types, fields and enumeration values that exist in the snapshot, so a spec change that breaks excaliplant's output (or output that drifts from the spec) fails CI. A scheduled workflow can run the update script weekly and open a pull request when `--check` fails.

## Sources and open questions

Verified against documentation (links), or by running the tool, on 2026-11-16:

| Tool                 | Source                                                                                                                                                                                                                       | Status                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Skills format  | [agentskills.io/specification](https://agentskills.io/specification)                                                                                                                                                         | name/description required, folders `scripts/`, `references/`, `assets/`                                                                                                                |
| Claude Code skills   | [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills)                                                                                                                                                     | `~/.claude/skills`, `.claude/skills`; docs do not mention `.agents/skills`                                                                                                             |
| Claude Code plugin   | [plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference)                                                                 | `claude plugin validate` passes; marketplace add and install tested locally                                                                                                            |
| Claude.ai upload     | [help center](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)                                                                                                                                   | Zip root = skill folder. Help center says description max 200 chars (API docs: 1024); we keep 200. Not uploaded in a real account                                                      |
| Gemini CLI extension | [extensions reference](https://geminicli.com/docs/extensions/reference/), [releasing](https://geminicli.com/docs/extensions/releasing/)                                                                                      | Manifest must be in the repo root. `gemini extensions validate` and `link` tested with Gemini CLI 0.68.0 (skill, context file and MCP server were listed). GitHub install flow not run |
| Gemini CLI skills    | [geminicli.com/docs/cli/skills](https://geminicli.com/docs/cli/skills/)                                                                                                                                                      | `.gemini/skills`, `.agents/skills`, user variants                                                                                                                                      |
| Codex                | [Codex skills](https://learn.chatgpt.com/docs/build-skills)                                                                                                                                                                  | `.agents/skills` (repo), `$HOME/.agents/skills` (user); `~/.codex/skills` is not listed there                                                                                          |
| opencode             | [opencode.ai/docs/skills](https://opencode.ai/docs/skills/)                                                                                                                                                                  | `.opencode/skills`, `~/.config/opencode/skills`, also `.claude` and `.agents`                                                                                                          |
| Cursor               | [cursor.com/docs/context/skills](https://cursor.com/docs/context/skills)                                                                                                                                                     | `.cursor/skills`, `.agents/skills`, user variants. The `.mdc` rule format is taken from this repository's existing Cursor rule, not re-verified                                        |
| GitHub Copilot       | [about agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions) | `.github/skills`, `~/.copilot/skills`; `applyTo` frontmatter for `.instructions.md`                                                                                                    |
| Antigravity          | [antigravity.google/docs/skills](https://antigravity.google/docs/skills)                                                                                                                                                     | `.agents/skills`, `~/.gemini/config/skills` (legacy `~/.gemini/antigravity/skills`)                                                                                                    |
| Windsurf             | [docs.devin.ai Cascade memories](https://docs.devin.ai/desktop/cascade/memories)                                                                                                                                             | `.windsurf/rules/*.md`, `trigger: model_decision`; the page does not name a `description` field, it is included as commonly used                                                       |
| Cline                | [docs.cline.bot rules](https://docs.cline.bot/customization/cline-rules)                                                                                                                                                     | `.clinerules/` or `.cline/rules/`, global `~/Documents/Cline/Rules`; no skill support documented                                                                                       |
| Roo Code             | [custom instructions](https://roocodeinc.github.io/Roo-Code/features/custom-instructions)                                                                                                                                    | `.roo/rules/`, `~/.roo/rules/`                                                                                                                                                         |
| ChatGPT              | [help center](https://help.openai.com/en/articles/20001066-skills-in-chatgpt) (not readable by our tooling), [API guide](https://developers.openai.com/api/docs/guides/tools-skills)                                         | Upload flow only known second-hand; untested                                                                                                                                           |
| Ollama               | [Modelfile](https://docs.ollama.com/modelfile)                                                                                                                                                                               | `SYSTEM """..."""`; no skill or MCP-client support was found in the docs                                                                                                               |

Not verified: skills inside claude.ai or ChatGPT sandboxes with restricted networking, the Gemini CLI install from a GitHub URL (it works with the same manifest at the repository root and falls back to the source archive of the latest release), and whether Windsurf, Cline and Roo have skill support. The Gemini CLI documentation notes that Antigravity CLI replaces Gemini CLI on 2026-06-18; both are covered, but the Gemini paths may change.

To get the skill and plugins into the public Claude and Codex directories, the Gemini CLI gallery and other listings, see [`publishing.md`](publishing.md).
