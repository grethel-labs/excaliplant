# Listings and public directories

Everything excaliplant ships (skill, plugins, MCP server, editor extensions, Markdown plugins) is built from this repository. This page covers the places where users can find it, what is already set up, and the steps only a maintainer can do.

Sources are the vendors' own documentation, read in November 2026. Where a page was silent, or where a step could not be tried from here, it says so. Portals change; if a button or field differs, the portal's own validation messages win.

## Already done

| Channel                       | What                                                                                | How users get it                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| npm                           | package with CLI, MCP server and the `markdown-it` / `remark` plugins               | `npm i @grethel-labs/excaliplant`, `npx @grethel-labs/excaliplant …`                                                |
| GitHub release                | `.vsix`, skill, plugin and rules archives, `SHA256SUMS`                             | download from the release page                                                                                      |
| Claude Code (own marketplace) | `.claude-plugin/marketplace.json` → `integrations/claude-plugin`                    | `/plugin marketplace add grethel-labs/excaliplant`                                                                  |
| Codex (own marketplace)       | `.agents/plugins/marketplace.json` → `integrations/codex-plugin`                    | `codex plugin marketplace add grethel-labs/excaliplant`                                                             |
| Gemini CLI                    | `gemini-extension.json` in the repository root, GitHub topic `gemini-cli-extension` | `gemini extensions install https://github.com/grethel-labs/excaliplant`; listed in the gallery by the daily crawler |
| skills.sh / `npx skills`      | skill in `skills/excaliplant/`                                                      | `npx skills add grethel-labs/excaliplant`                                                                           |
| MCP registry                  | `server.json`, published by the release workflow                                    | registry entry `io.github.grethel-labs/excaliplant`                                                                 |
| VS Code Marketplace           | extension, published by the release workflow (OIDC)                                 | search "excaliplant"                                                                                                |
| GitHub Actions                | `action.yml` with branding                                                          | `uses: grethel-labs/excaliplant@v1.2.0` (there is no moving `v1` tag)                                               |

`npx skills add . --list` finds exactly one skill in this repository, and `claude plugin validate` passes for the plugin and the marketplace. `codex plugin marketplace add` accepts the repository and lists the marketplace; installing the plugin from the Codex app was not tried.

## Versioned plugin branch

Releases never write to `main`, so the plugin files committed there carry no real version: the skill copies have `version: "{{version}}"` and neither `plugin.json` has a `version`. The Claude directory follows one branch or tag, re-checks it on every new commit and, when a `version` is set, wants it raised with each release. Each release therefore adds one commit to a generated branch.

- **Branch `plugin-release`.** Only what the directories need: `.claude-plugin/marketplace.json`, `integrations/claude-plugin/**` (with `plugin.json` carrying the release `version`, README, LICENSE, icon and the skill with its version filled in), `.agents/plugins/marketplace.json`, `integrations/codex-plugin/**` (same) and a short `README.md`. No workflow files and no other repository content, so `GITHUB_TOKEN` may push it.
- **One commit per release.** The release workflow job `plugin-release` runs after npm publishing (a failure there does not undo the release). The commit message names the version and the source commit on `main`; its parent is the previous tip, so the push is always a fast-forward and never forced. The first release creates the branch (without parent). Nothing is committed when the content is unchanged.
- **Tag `plugin-release-vX.Y.Z`** on that commit (not matched by the `v*` tags that the version computation reads). Re-running the job is harmless: an existing tag means nothing happens.
- **Generated, do not edit.** The source is `main`; `node scripts/plugin-ref.mjs --version X.Y.Z --out <dir>` writes the same files locally and `scripts/publish-plugin-branch.sh` makes the commit.

To point the Claude directory at it, set **Branch or tag** to `plugin-release` in the portal (submission step 2 below, or the listing's source settings) once the first release after this change has created the branch; the plugin path stays `integrations/claude-plugin`. Codex users can add the branch as a marketplace source (`codex plugin marketplace add grethel-labs/excaliplant --ref plugin-release`).

## Claude: the public plugin directory

Source: <https://claude.com/docs/directory/publish>, <https://claude.com/docs/plugins/submit> and the linked pre-submission checklist.

What the directory is: a listing shared by claude.ai, the Claude desktop and mobile apps, Cowork and Claude Code. A plugin is installed from **Customize → Plugins → Discover**, or in Claude Code with `/plugin directory` (Claude Code 2.1.287 or later) or `claude plugin install`. The documentation does not mention the name `claude-plugins-official`; do not rely on it.

### Before you start

- You need a **Pro, Max, Ultra, Team or Enterprise** account. Free accounts cannot submit. On Team and Enterprise an Owner submits; on Enterprise an Owner can grant the _Directory_ permission to other members.
- Connect your **GitHub account in claude.ai**. The portal checks that it can push to the repository (that is how it sets up update notifications).
- The repository must be **public** before the listing goes live.
- The first organization that submits a folder holds that listing, and one submission per repository and folder is allowed. At most 10 submissions per organization per 24 hours.

### What is prepared in `integrations/claude-plugin`

The checklist's requirements, as far as they can be checked locally (`claude plugin validate integrations/claude-plugin` passes; `test/skills.test.mjs` guards the rest):

- `.claude-plugin/plugin.json` with `name`, `description`, `author`, `license`; the name is lowercase with hyphens and not a reserved word.
- `README.md` with more than 40 words (outside code blocks) that discloses what the plugin runs.
- `LICENSE` in the plugin folder, kept equal to the repository's.
- A square 512 px `icon.png` in `.claude-plugin/`. The listing takes the icon **once**, the first time the plugin is saved or submitted in the portal, and later changes do not replace it. Check it (`node scripts/gen-plugin-icons.mjs` regenerates it) before the first save.
- No hooks, no agents and no MCP launcher. The directory blocks `npx` launchers that are not pinned to an exact version, and a committed file cannot know the release; so the MCP server is only added to the release archive `excaliplant-claude-plugin-<version>.zip`, pinned to that version. Everything else in the folder is text or PNG, well under the size limits (files under 256 KiB, at most 512 files, no symlinks).
- No `version` in `plugin.json` on `main` (a committed file cannot know the release). The branch `plugin-release` (see above) carries the same plugin with the release version, raised by every release; prefer it as the tracked branch.

### Steps

1. Open <https://claude.ai/directory/manage> and choose **Submit new** → **Plugin bundle** (the other choice is _MCP connector_).
2. **Source:** Repository `grethel-labs/excaliplant`, **Plugin path** `integrations/claude-plugin`, **Branch or tag** `plugin-release` (the versioned release branch; it exists after the first release that includes the `plugin-release` job. Empty would follow `main`, whose plugin has no version). Click **Validate**, fix every finding marked _Blocks_, then **Re-validate**.
3. **Listing details** are read from `plugin.json` and the README; check name and short description.
4. **Data handling:** answer the questions (the plugin stores nothing and sends nothing; the CLI it invokes is fetched from npm and runs locally; not intended for people under 18 is your call).
5. **Compliance:** a contact email and all four acknowledgements.
6. **Review and submit:** keep **GitHub push webhook** for updates (needs admin on the repository), decide about _Auto-publish passing versions_, then **Submit for review**.

### What happens next

- Every version gets automated validation and a security scan; a person reviews a new listing before it goes live. Review time is not fixed. Statuses run Draft → Scanning → In review → Approved → **Published** (only Published is installable).
- Later commits to the tracked branch are picked up, checked and published (by a reviewer unless you enabled auto-publish).
- You cannot change the repository or folder after submitting. Questions: `directory@anthropic.com`.

### Not covered by the documentation

Categories, screenshots and a privacy-policy URL are not mentioned on the pages I read; the portal will ask if it needs them. The Software Directory Policy and Terms were not read; read them before you submit. The MCP server is a local stdio server, so it is not a candidate for the separate _MCP connector_ type (that is for remote servers).

## Codex and ChatGPT: the public plugin directory

Source: <https://developers.openai.com/codex/submit-plugins>, <https://developers.openai.com/codex/plugins/build> and <https://developers.openai.com/plugins/build/plugins>.

### What works without OpenAI

`codex plugin marketplace add grethel-labs/excaliplant` reads `.agents/plugins/marketplace.json`, which points at `integrations/codex-plugin` (a `plugin.json` plus the skill). Installing and enabling plugins happens in the Codex / ChatGPT desktop app; the documentation names no CLI command for installing. Without the plugin, `excaliplant skills install --tool codex` copies the skill to `.agents/skills`.

### Public submission

The portal is <https://platform.openai.com/plugins> (**Upload new or existing plugin**). What the documentation requires:

1. **Role and identity:** an organization owner, or a member with the _Apps Management Write_ role, and a completed individual or business verification in the organization settings.
2. **Package:** upload the ZIP `excaliplant-codex-plugin-<version>.zip` from the GitHub release (skills only: `plugin.json`, `skills/excaliplant/`, README, LICENSE). Use _Create plugin → Skills only_.
3. **Fix findings** in the _Metadata & Skills_ panel, use _Upload plugin to fix issues_ to re-upload, then submit for review with the policy attestations. Feedback arrives by email; appeal by replying. After approval you choose when to press _Publish plugin_.
4. Updates need a new ZIP (new package version with its own checks); publishing replaces the previous version.

Open points to expect in the validation messages, because the documentation lists them for the Codex format but not exactly for the portable one we ship: `logo` and `composerIcon` (PNG/JPEG/WebP/SVG, square, at least 48×48, under `./assets/`; `integrations/codex-plugin/assets/icon.png` is a 512 px icon you can use for both), the `interface` listing fields (display name and short description up to 30 characters, long description, developer name), and public HTTPS URLs for website, support, privacy policy and terms.

### The MCP server cannot go in

A plugin that starts a local stdio server (`npx … excaliplant-mcp`) is "desktop only", and local MCP submissions are "limited to approved partners": you would have to send your organization ID to an OpenAI representative and wait for allowlisting. Public MCP servers must be remote HTTPS endpoints. So submit the **skills-only** plugin, and let users add the MCP server themselves (`codex mcp add excaliplant -- npx -y -p @grethel-labs/excaliplant excaliplant-mcp`). The documentation does not say whether `npx` fetching a package at runtime would be accepted even for an approved partner.

## Gemini CLI

Nothing to submit: the gallery at <https://geminicli.com/extensions> indexes public repositories with the GitHub topic `gemini-cli-extension` once a day, if the validation passes. The manifest `gemini-extension.json` must sit in the repository (or release archive) root, which it does. Google does not vet third-party extensions.

## skills.sh and `npx skills`

There is no submission. The leaderboard at <https://skills.sh> is built from anonymous install telemetry of `npx skills add`, so a skill shows up once people install it. Share `npx skills add grethel-labs/excaliplant`. The CLI's own repository (<https://github.com/vercel-labs/skills>) documents discovery in detail; what we checked is that it finds one skill here.

## Markdown ecosystems

There is no single marketplace for Markdown extensions. What exists, and where excaliplant stands:

| Place                                                                                                                                                         | Official?                                                                                                    | What it takes                                                                                                                                                                                                                        | Status                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| VS Code Marketplace, Open VSX                                                                                                                                 | yes                                                                                                          | extension (VS Code uses `markdown-it` plugins)                                                                                                                                                                                       | done, see [`docs/vscode.md`](vscode.md)                    |
| unified / remark ([plugin list](https://github.com/remarkjs/remark/blob/HEAD/doc/plugins.md), [explore](https://unifiedjs.com/explore/keyword/remark-plugin)) | list in the remark repository                                                                                | keyword `remark-plugin` on npm (set); a pull request adds an entry to `doc/plugins.md`, as earlier PRs did                                                                                                                           | keyword done; the PR is yours to open                      |
| markdown-it                                                                                                                                                   | no official directory; [npm keyword search](https://www.npmjs.com/browse/keyword/markdown-it-plugin)         | keyword `markdown-it-plugin` (set)                                                                                                                                                                                                   | done                                                       |
| Docusaurus                                                                                                                                                    | community page ([Awesome Resources](https://docusaurus.io/community/resources)), documented via a discussion | works as a remark plugin; MDX only in `file` mode (see [`docs/markdown.md`](markdown.md))                                                                                                                                            | open a discussion if you want a listing                    |
| Astro                                                                                                                                                         | [integrations library](https://astro.build/integrations/) with a "Submit integration" link                   | needs an Astro integration package; excaliplant's remark plugin works inside Astro but is not packaged as an integration                                                                                                             | not built                                                  |
| Eleventy                                                                                                                                                      | [community plugins page](https://www.11ty.dev/docs/plugins/community/) with "Add your own!"                  | needs an Eleventy plugin                                                                                                                                                                                                             | not built                                                  |
| Joplin                                                                                                                                                        | yes: official plugin repository, fed from npm (package name starts with `joplin-plugin-`)                    | a Joplin plugin                                                                                                                                                                                                                      | not built                                                  |
| Zed                                                                                                                                                           | yes: pull request to the extensions repository                                                               | a Rust/WASM extension                                                                                                                                                                                                                | not built                                                  |
| Obsidian community plugins                                                                                                                                    | yes                                                                                                          | see [`docs/obsidian.md`](obsidian.md)                                                                                                                                                                                                | built, publishing disabled                                 |
| GitHub Marketplace (Actions)                                                                                                                                  | yes                                                                                                          | a release of the repository with `action.yml` (has `name`, `description`, branding); the box _Publish this Action to the GitHub Marketplace_ is ticked when drafting a release and needs an owner who accepted the Marketplace terms | not done; the release workflow creates releases without it |

Not researched: JetBrains Marketplace, Logseq, Raycast, MkDocs (the MkDocs catalog lists Python plugins). For the GitHub Marketplace, the box has to be ticked on a release created in the web UI (or edited afterwards); I did not verify whether releases created by `gh` can be listed.
