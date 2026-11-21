## File envelope

An `.excalidraw` file is one JSON object. excaliplant writes exactly these top-level keys:

| Key        | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| `type`     | `"excalidraw"`                                                                   |
| `version`  | `2`                                                                              |
| `source`   | URL of the producing application (`https://github.com/grethel-labs/excaliplant`) |
| `elements` | Array of elements, drawn in array order (later elements are on top)              |
| `appState` | Editor state; excaliplant sets `viewBackgroundColor` and `gridSize` (`null`)     |
| `files`    | Binary files for `image` elements; always `{}` for excaliplant output            |

## Editing rules

- Every element needs a unique `id`. When you add elements, copy a neighbour of the same type and change `id`, geometry and text; this keeps all required fields present.
- `x`/`y` are the top-left corner of the bounding box in scene coordinates. For `line` and `arrow` the `points` are relative to `x`/`y`, the first point is `[0, 0]`, and `width`/`height` are the extent of the points.
- Text is a free-standing `text` element: set `text` and `originalText` to the same string, `containerId` to `null`, and keep `width`/`height` roughly equal to the rendered size (`lineHeight` times `fontSize` per line).
- Arrows connect shapes through `startBinding`/`endBinding` (`{ "elementId", "focus", "gap" }`). Keep both sides in sync: the target shape lists the arrow in `boundElements` as `{ "id": "<arrow id>", "type": "arrow" }`. Deleting a shape means deleting or unbinding its arrows.
- Elements that belong together share an entry in `groupIds`; frames reference their children with `frameId`.
- Colours are `#rrggbb` (or `#rgb`, `#rrggbbaa`) strings or `"transparent"`.
- Do not hand-edit numbers such as `seed`, `version` and `versionNonce` unless you need a specific wobble; the editor regenerates them.
- excaliplant does not write the fractional `index` field; the editor derives the stacking order from the array order when it opens the file.
- Validate by opening the file at https://excalidraw.com (drag and drop) or re-render from PlantUML.

## How excaliplant uses the format

- Shapes are `rectangle`, `ellipse` and `diamond`; connectors are `line` and `arrow`; labels are separate `text` elements using font family `5` (Excalifont) or `8` (Comic Shanns, monospace).
- Rich text styling that Excalidraw lacks (bold, italic) is stored in `customData` of the text element as `{ "bold": boolean, "italic": boolean }`.
- Ids, `seed` and `versionNonce` come from a seeded generator, so the same PlantUML source always yields the same file.
- `roundness` is `null` (sharp), `{ "type": 3 }` (rounded rectangle corners) or `{ "type": 2 }` (smoothed curves).
- Arrowheads that Excalidraw does not know (cross, plus, socket, half arrows, zero/one markers) are drawn as extra line and ellipse elements next to the arrow.

## Type aliases used in the tables

- `Radians` is a number (rotation in radians; excaliplant always writes `0`).
- `LocalPoint` is a pair `[x, y]` relative to the element's `x`/`y`.
- `GroupId`, `FractionalIndex` and `FileId` are strings.
- `ExcalidrawGenericElement["id"]` is an element id string.
- `FontFamilyValues`, `TextAlign` and `VerticalAlign` take the values listed under Enumerations.
