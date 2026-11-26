# VS Code extension

The extension in [`integrations/vscode/`](../integrations/vscode) draws PlantUML in VS Code with the same renderer as the library: hand-drawn diagrams in the Markdown preview, a live side preview for `.puml` files, and export to Excalidraw or SVG. It runs locally, needs no Java or server, makes no network requests and sends no telemetry.

## Features

- **Markdown preview**: `plantuml`, `puml` and `uml` fences (attributes as in [Markdown](markdown.md)) are rendered in the built-in preview.
- **Show Diagram Preview** and **Show PlantUML Source** switch between a saved PlantUML file's source editor and its live preview in the current editor group. The preview renders unsaved edits from the same document.
- **Open Preview to the Side** opens a separate live preview for editing and viewing together.
- **Render to Excalidraw (.excalidraw)** and **Render to SVG**: for a `.puml` file or the Markdown block under the cursor.
- **Replace diagrams in Markdown with SVG files**: `renderMarkdown` in `file` mode; writes `assets/<hash>.svg` and keeps the source in a comment (the route for GitHub).
- Language `plantuml` for `.puml`, `.plantuml`, `.pu` and `.iuml` with basic highlighting. It does not claim `.wsd` and uses its own grammar scope, so it coexists with other PlantUML extensions.

Not included: PNG export (resvg is a native module and cannot be shipped in a platform-independent `.vsix`; use the CLI) and notebook Markdown cells (they render in a separate webview that cannot load extension-host plugins).

## How the preview works

markdown-it renders synchronously, excaliplant does not. The extension installs the [markdown-it plugin](markdown.md#markdown-it) with one shared cache: a hit returns the SVG, a miss returns a placeholder, renders in the background and calls `markdown.preview.refresh` when done. While you type, changed Markdown documents are pre-rendered into the cache (debounced), so the preview is usually complete on the first refresh.

## Settings

| Setting                          | Default  | Meaning                                                                                   |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `excaliplant.theme`              | `auto`   | A theme name, or `auto`: `dark` in dark/high-contrast VS Code themes, else `sketch`.      |
| `excaliplant.clean`              | `false`  | Clean strokes.                                                                            |
| `excaliplant.markdown.enabled`   | `true`   | Render fences in the Markdown preview.                                                    |
| `excaliplant.markdown.assetsDir` | `assets` | Asset folder of _Replace diagrams in Markdown_; must stay inside the workspace.           |
| `excaliplant.includeDir`         | empty    | Folder `!include` may read from; empty disables `!include`.                               |
| `excaliplant.limits`             | `{}`     | Render limit overrides (`maxElements`, `maxInputBytes`, …), at most 32 times the default. |
| `excaliplant.warmup`             | `true`   | Load the layout engine in the background (see [Startup](#startup)).                       |

## Startup

Class, component, state and other graph diagrams are laid out with ELK, which is loaded on first use: about 1 s for the first graph diagram of a session, then about 80 ms. To keep that off your first real diagram, the extension calls `warmup()` in the background, once per window, about 250 ms after it sees a PlantUML file or a Markdown document with a `plantuml`/`puml`/`uml` fence (already open at activation, opened later, or typed in). It is fire and forget: activation and rendering never wait for it, a failure is ignored, and it needs no files and no network. Turn it off with `"excaliplant.warmup": false`; switching it on again warms up for the open documents.

## Security

Diagram text is untrusted input.

- **Workspace Trust**: `capabilities.untrustedWorkspaces.supported` is `limited`. Rendering works everywhere, but `excaliplant.includeDir`, `excaliplant.limits` and `excaliplant.markdown.assetsDir` are restricted settings (VS Code ignores workspace values in restricted mode), and the extension itself drops include and limit overrides when the workspace is not trusted. A repository you just cloned therefore cannot make the extension read files or relax limits.
- **`!include`** is off by default. With `includeDir` set, only regular files below that folder are read; symbolic links leaving it, URLs and `..` are refused; the size limit applies per file. Included files are watched, and diagrams re-render when they change.
- PlantUML previews use webviews with `enableScripts: false`, `localResourceRoots: []` and a CSP of `default-src 'none'; img-src data:; style-src 'nonce-…'`. The sanitised SVG is shown as a `data:` image, where it cannot run script or load anything.
- **Markdown preview**: the SVG is rebuilt from an allow-list (see [Markdown](markdown.md#limits-and-safety)) before it enters the preview, and the preview applies its own CSP.
- **Commands** write only where you choose (save dialog) or, for _Replace diagrams_, below the workspace folder.

## Build and package

The extension is built from this repository; `esbuild` bundles the library sources into `dist/extension.js`, so the `.vsix` needs no `node_modules`. The tooling (`esbuild`, `@vscode/vsce`, `ovsx`) is a devDependency of `integrations/vscode` with its own lockfile and is not part of the npm package.

```sh
npm ci                                   # repository root (renderer dependencies)
npm ci --prefix integrations/vscode      # build tooling
npm run build --prefix integrations/vscode      # dist/extension.js only
node scripts/build-vscode.mjs --version 1.4.0   # dist/excaliplant-1.4.0.vsix (prints the path)
```

`scripts/build-vscode.mjs` stages the files in a temporary directory, sets the version there (the checked-in `package.json` keeps `0.0.0`), copies `LICENSE`, `THIRD_PARTY_NOTICES.md` and the Excalifont licence from the repository root, and runs `vsce package --no-dependencies`. The font and the package version are inlined into the bundle; the PNG rasteriser is replaced by a stub. `node scripts/build-vscode.mjs --icon` regenerates `icon.png` from a diagram rendered by excaliplant.

### Publish

Publishing runs in the `vscode` job of `.github/workflows/release.yml`. Both registries support **trusted publishing (OIDC)**, so no token has to be stored (Azure DevOps global PATs are retired on 2026-12-01):

| Registry            | One-time setup                                                                                                                                                           | Repository setting                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| VS Code Marketplace | Create the publisher `grethel-labs`, then _Trusted Publishing_ → _Create_ with owner `grethel-labs`, repository `excaliplant`, workflow `release.yml`, empty environment | variable `PUBLISH_VSCODE_MARKETPLACE=true` |
| Open VSX            | Create the namespace, publish the first version with a token, then _Settings → Trusted Publishers_ with the same values                                                  | variable `PUBLISH_OPEN_VSX=true`           |

A stored `VSCE_PAT` / `OVSX_PAT` secret still works and takes precedence. Locally: `VSCE_PAT=… npm run publish:vsce --prefix integrations/vscode`. The publisher is `grethel-labs` (field `publisher` in `integrations/vscode/package.json`); the Open VSX namespace must exist (`ovsx create-namespace`). The `.vsix` has to be built first, in the same job.

### Tests

`npm test` runs `test/vscode.test.mjs` (mock `vscode` API and a mini markdown-it, no editor needed) and `test/vscode_build.test.mjs` (bundle and `.vsix` checks). The build tests are skipped when `esbuild` is not installed in `integrations/vscode`.
