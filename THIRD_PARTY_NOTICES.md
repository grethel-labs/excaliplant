# Third-party notices

This package bundles or depends on the following third-party works.

---

## Excalifont (Latin subset, woff2)

- Path: [`assets/fonts/Excalifont-Regular.woff2`](assets/fonts/Excalifont-Regular.woff2)
- Upstream: <https://github.com/excalidraw/excalidraw>
- License: SIL Open Font License 1.1 (OFL-1.1)
- Reproduction of the OFL notice is bundled alongside the binary at
  [`assets/fonts/LICENSE.txt`](assets/fonts/LICENSE.txt).

The font is embedded into exported SVG / PNG documents as a `data:`
URL so they render with the same hand-drawn Excalidraw look in any
context (GitHub README rendering, sandboxed `<img>` hosts, …).

---

## Runtime dependencies

| Package           | License | Purpose                           |
| ----------------- | ------- | --------------------------------- |
| `elkjs`           | EPL-2.0 | Layered + orthogonal graph layout |
| `@resvg/resvg-js` | MPL-2.0 | SVG → PNG rasterisation           |
| `roughjs`         | MIT     | Hand-drawn stroke generation      |

Run `npm ls --omit=dev` for the resolved versions in your install.
