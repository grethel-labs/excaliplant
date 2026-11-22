# The website: playground and gallery

<https://grethel-labs.github.io/excaliplant/> has two views:

- **Playground** (the start page, `#play`): write PlantUML on the left, see it rendered on the right, with the version of excaliplant the page was built from. Every render option is available, every example can be opened and edited, and the result can be exported or shared as a link.
- **Gallery** (`#gallery`): the pre-rendered examples with type tabs, arrows, keyboard and swipe navigation, downloads (`.svg`, `.excalidraw`, `.puml`) and an **Open in playground** button per example.

Everything runs in the browser. Nothing is uploaded, the page makes no network requests, and it uses no CDN and no third-party fonts.

## Layout of the source

```text
site/
  index.html            page skeleton (placeholders like {{version}} are filled by the build)
  styles.css            design tokens (light/dark) and layout
  app.mjs               entry: header, colour theme, routing between the two views
  router.mjs            hash routes (pure)
  boot.mjs              applies the saved colour theme before first paint
  worker.mjs            worker entry: the library plus the message protocol
  build.mjs             esbuild bundles (worker.js, app.js, boot.js, styles.css)
  playground/
    playground.mjs      the view: editor, options, live rendering, export, share
    editor.mjs          textarea + highlight layer + line numbers
    highlight.mjs       PlantUML tokenizer
    engine.mjs          page side of the worker: restarts, timeouts, fallback
    protocol.mjs        worker side: `createEngine().handle(message)` (pure, tested)
    options.mjs         option defaults, validation, mapping onto `render()`
    state.mjs           share links (URL hash) and localStorage
    examples.mjs        example index and search
    export.mjs          downloads, clipboard, PNG through a canvas
  gallery/gallery.mjs   the gallery view
scripts/site.mjs        builds everything into _site/
```

## Build and test locally

```sh
npm ci
npm run site                  # node scripts/site.mjs _site
python3 -m http.server -d _site   # or any static server; opening _site/index.html also works
node --test test/site*.test.mjs
```

`SITE_VERSION=1.2.3 npm run site` fixes the version shown in the header and skips the npm lookup (offline builds). Without it the build asks the npm registry for the latest published version, then falls back to the latest `v*` git tag, then shows `dev`. The header also names the commit the page was built from.

The output is static and uses relative URLs only, so it works under the GitHub Pages sub-path `/excaliplant/` and from `file://`:

```text
_site/index.html, app.js, worker.js, boot.js, styles.css
_site/d/<kind>/<name>.svg | .excalidraw | .puml     (unchanged gallery URLs)
```

`.github/workflows/pages.yml` runs `npm ci` and `node scripts/site.mjs _site` after every Release run and deploys the result.

## How rendering works

The library is bundled by esbuild into `worker.js` (about 1.8 MB, 575 KB gzip; ELK is most of it). It reuses the browser shims of the Obsidian plugin (`integrations/obsidian/shims`) for the font file and the native PNG rasteriser; `src/` is not modified.

- Rendering happens in a **Web Worker**, so ELK never blocks the page. On start the worker lays out a tiny graph diagram as a warm-up; the page shows "Loading engine…" until the first result.
- Edits are **debounced** (150 ms). Each request has a number; results that arrive for an older request are dropped, and the worker skips the output of requests that were already superseded.
- A render that takes longer than **20 s** is abandoned: the worker is terminated and a new one is started.
- Input is limited to **200 KB**, and the library limits are tightened in the page (`PLAYGROUND_LIMITS` in `site/playground/protocol.mjs`).
- Where a browser refuses workers (Chrome on `file://`), the page loads `worker.js` as a normal script and renders on the main thread. It works, but long renders block the UI. The page marks this with `data-engine="page"` on `<html>`.
- The worker returns the SVG after the library's sanitiser (`sanitizeSvg`); the page shows it as an `<img>` from a `blob:` URL, never through `innerHTML`.
- PNG export draws the SVG on a canvas in the browser (not resvg) and is limited to 16 megapixels (iOS Safari's canvas limit); larger requests are scaled down and the page says so.

## Options

| Control                      | `render()` / export option                                                    |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Theme                        | `theme`; **Auto** passes nothing on a light page and `dark` on a dark page    |
| Clean strokes                | `sketch: false`                                                               |
| Seed                         | `seed` (empty: library default)                                               |
| Background                   | `toSvg({ background })`: theme default, `transparent` or a colour (SVG + PNG) |
| Strict                       | `strict`                                                                      |
| Page (only with `newpage`)   | `page` (0-based)                                                              |
| Block (only with 2+ blocks)  | `block` (index of the `@start…@end` block)                                    |
| Diagram type                 | `kind` (force a module instead of detection)                                  |
| Defines (`NAME=value` lines) | `defines`, like the CLI's `-D`                                                |
| `%filename()`                | `filename`                                                                    |
| `%date()`                    | `date` (UTC midnight of the chosen day)                                       |
| PNG width / scale            | width in pixels, or scale relative to the SVG size (default 2)                |

`include` is not offered: a web page has no file system, so `!include` of files cannot work (bundled `<C4/…>` and `<archimate/…>` libraries do). `limits` are fixed by the page. The mapping is a pure function (`toRenderOptions` in `site/playground/options.mjs`) and is covered by `test/site.test.mjs`.

With **Auto**, a `!theme` line in the source is honoured on a light page and overridden by `dark` on a dark page; pick an explicit theme to prevent that.

## Share links

`Share` copies `<page>#p=<payload>`:

```text
payload = "z" + base64url(deflate-raw(utf8(json)))     CompressionStream
        | "r" + base64url(utf8(json))                  fallback without compression
json    = {"v":1,"s":"<PlantUML source>","o":{<options that differ from the defaults>}}
```

The hash is never sent to a server. Links are limited to 16,000 characters (the page offers `.puml` download instead for larger documents); links up to 64,000 characters are accepted. When reading, the decompressed size is capped, the version and types are checked and every option is validated again, so a hostile link cannot do more than a hostile text typed into the editor. A damaged link shows a message and falls back to your last document.

### Plain-text links

`<page>#src=<percent-encoded PlantUML text>` opens the playground with that text and default options. It exists for places that cannot run the CLI (the agent skill tells a language model to write such a link when it cannot execute commands): the text is plain `encodeURIComponent` output, so a person or a model can write it by hand, without compression or Base64.

```text
https://grethel-labs.github.io/excaliplant/#src=%40startuml%0AAlice%20-%3E%20Bob%20%3A%20hi%0A%40enduml
```

Space is `%20`, a line break `%0A`, `@` is `%40`, `>` is `%3E`, `:` is `%3A`, `+` is `%2B`, `#` is `%23`, `%` is `%25`. Values over 64,000 characters, malformed escapes and text with a NUL byte are refused with the message "That link could not be read". As with `#p=`, the hash is never sent to a server.

The share hash takes precedence over `localStorage`; after loading it the address becomes `#play`, so a reload does not discard your later edits. Text and options are stored in `localStorage` (always inside `try/catch`; the page works without it). The colour theme is stored separately.

## Export

- **Download SVG / PNG / .excalidraw / .puml**, **Copy SVG**.
- **Copy for Excalidraw** copies the elements in Excalidraw's clipboard format (`excalidraw/clipboard`); paste into excalidraw.com with Ctrl/Cmd+V. For a full scene use **Download .excalidraw** and drop the file onto excalidraw.com.

## Security

The text typed into the editor is untrusted input, like everything the library renders.

- CSP (`<meta>` in `site/index.html`): `default-src 'self'`; `script-src 'self'`; `style-src 'self'`; `img-src 'self' data: blob:`; `worker-src 'self' blob:`; `connect-src 'none'`; `object-src`, `base-uri` and `form-action` are `'none'`. No inline scripts, no inline styles, no `unsafe-eval`.
- The page has no `fetch`/XHR/WebSocket calls; a test checks that the built files contain no external URL except links to GitHub, npm and the docs, and that nothing is marked `unsafe-inline`.
- The preview is an `<img>` from the sanitised SVG, so SVG links (`[[https://…]]`) are not clickable there; the downloaded SVG keeps them.
- The editor builds its highlight layer with DOM nodes and `textContent`; there is no `innerHTML` anywhere in the page.

## Editor

The editor is a plain `<textarea>` over a transparent-text highlight layer plus a line-number gutter (about 6 KB of code), not CodeMirror. A CodeMirror 6 build with line numbers, history, keymaps and highlighting measured 289 KB (96 KB gzip) before any PlantUML grammar, about five times the page code of the whole site, and it replaces the native text field with its own selection and IME handling. The textarea keeps native selection, undo, accessibility and mobile keyboards. Highlighting is skipped above 60 KB of text. Keys: Tab/Shift+Tab indent, Enter keeps the indent, Ctrl/Cmd+/ comments lines, Ctrl/Cmd+Enter renders, Esc then Tab leaves the field.

## Limits

- On `file://` Chrome does not start workers, so the page renders on the main thread there (see above); over `http(s)` the worker is always used.
- Very large or pathological diagrams hit the 20 s timeout; the worker restarts and the last good preview stays visible (dimmed).
- No `!include` of files, no remote includes, no `%getenv()` data.
- Preview and PNG show the SVG as an image: no text selection in the preview and no clickable links.
- The `dark` diagram theme is the library's; diagrams that set explicit light colours (for example `box #f1f3f5`) keep them.
