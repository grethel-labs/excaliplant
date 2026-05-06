# Third-party notices

This package bundles or depends on the following third-party works.

---

## Excalifont (Latin subset, woff2 + TrueType)

- Path: [`assets/fonts/Excalifont-Regular.woff2`](assets/fonts/Excalifont-Regular.woff2)
- Path: [`assets/fonts/Excalifont-Regular.ttf`](assets/fonts/Excalifont-Regular.ttf)
- Upstream: <https://github.com/excalidraw/excalidraw>
- License: SIL Open Font License 1.1 (OFL-1.1)
- Reproduction of the OFL notice is bundled alongside the binary at
  [`assets/fonts/LICENSE.txt`](assets/fonts/LICENSE.txt).

The woff2 file is embedded into exported SVG documents as a `data:` URL.
The TrueType copy is loaded by `@resvg/resvg-js` for PNG rasterisation,
because resvg's `fontFiles` loader does not load woff2 files.

---

## Runtime dependencies

| Package           | License | Purpose                           |
| ----------------- | ------- | --------------------------------- |
| `elkjs`           | EPL-2.0 | Layered + orthogonal graph layout |
| `@resvg/resvg-js` | MPL-2.0 | SVG → PNG rasterisation           |
| `roughjs`         | MIT     | Hand-drawn stroke generation      |

Run `npm ls --omit=dev` for the resolved versions in your install.
