# Element hook specification

This contract describes the hooks introduced in excaliplant 1.11.0. It covers
PlantUML input, Excalidraw scene metadata and the inline SVG browser API. The
machine-readable [JSON Schema](hooks.schema.json) defines `sceneHook` and
`hookEventDetail` for consumers that validate JSON. Use the schema root for
scene metadata and `hooks.schema.json#/$defs/hookEventDetail` for serialized
event details. It uses [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12).

Use an author-supplied hook ID or class as an application identifier. Treat
additional metadata and event fields as extensible. Incompatible changes to
this contract follow excaliplant's [major release policy](releasing.md).

## PlantUML input

```text
@hook [#id] (alias:<target> | element:<target>) [.class ...]
@hook (#id | .class) (hover | click) <property> <value>
```

- Put the directives before the first diagram body line, or in the preamble
  of a `newpage` page. Bindings and styles apply to that page. In raw formats
  such as JSON and Ditaa, a line matching the binding grammar opens the
  preamble. Other leading lines are treated as diagram payload.
- A binding requires an ID, at least one class, or both. IDs are unique within a
  page. A class can be shared by several bindings. Names are case-sensitive,
  match `[A-Za-z_][A-Za-z0-9_-]{0,63}` and are stored without `#` or `.`.
  A binding accepts up to 32 distinct classes. Repeated classes are deduplicated
  in first-occurrence order. The `#` is optional on ID directives in PlantUML.
- `alias:` selects a graph node or a sequence participant by its PlantUML
  identifier, including the drawing primitives that make up its shape and
  caption. Sequence bindings include both the head and the footbox when drawn.
  Double-quote an alias containing spaces.
- `element:` selects one `elements[].id` in the rendered scene, including in
  diagram families with no alias support. To look up that ID, render with the
  same seed, diagram block, page and drawing order. Scene IDs can change when
  these inputs or rendering geometry change.
- A drawing primitive can have one binding. When targets overlap, the first
  binding takes precedence and the entire later binding is skipped. Missing
  targets and overlaps are diagnosed at render time. Invalid parsed directives,
  duplicate IDs and style references to undeclared IDs or classes also produce diagnostics. With
  `strict: true`, hook diagnostics throw a `ParseError` with `code` set to
  `INVALID_HOOK` and the original 1-based source line. In other modes, valid
  bindings and style declarations remain usable after warnings.

```plantuml
@startuml
@hook #orders alias:orders .service .navigation
@hook alias:payments .service
@hook .service hover FontColor navy
@hook #orders click BackgroundColor gold
component "Orders" as orders
component "Payments" as payments
orders --> payments
@enduml
```

## Styles and precedence

`@hook`, `alias` and `element`, the state keywords, and property names are
case-insensitive. A colon between a property and value is optional. Colours use
excaliplant's normal PlantUML colour syntax and are normalized to hex or
`transparent`.

| PlantUML property                               | Scene field   | Effect                                                                  |
| ----------------------------------------------- | ------------- | ----------------------------------------------------------------------- |
| `BackgroundColor`                               | `fill`        | Shape fill                                                              |
| `LineColor`, `BorderColor`, `Color`             | `stroke`      | Shape outline or connector colour                                       |
| `FontColor`                                     | `text`        | Text colour                                                             |
| `FontSize`                                      | `fontSize`    | Font size clamped to 6–72                                               |
| `LineThickness`, `BorderThickness`, `Thickness` | `strokeWidth` | Line width clamped to 0.5–12                                            |
| `LineStyle`, `BorderStyle`                      | `strokeStyle` | `solid`, `dashed` or `dotted`                                           |
| `RoundCorner`                                   | `rounded`     | A positive value rounds rectangle corners. Zero selects square corners. |

For each state, the renderer starts with the element's normal appearance and
overlays the corresponding theme role, `roles.hook-hover.*` or
`roles.hook-click.*`. Class styles overlay those defaults in binding order.
ID-specific styles overlay class styles. A later declaration of the same
property for a given ID or class and state takes precedence.

In the live view, a selected hook displays the click style. An unselected hook
displays its hover style while hovered, then its normal appearance on exit.
The existing diagram layout and pointer hit geometry remain fixed during
state changes. A larger font in an interaction state can extend past its
original label bounds.

## Excalidraw scene metadata

The `RenderResult.excalidraw` document and `.excalidraw` export expose this
object at `elements[].customData.excaliplantHook` on each targeted primitive.

| Field     | Meaning                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `id`      | Optional author-supplied hook ID.                                                   |
| `classes` | Optional nonempty list of author-supplied classes in binding order.                 |
| `name`    | Opaque grouping token shared by the primitives of one binding in the current scene. |
| `hover`   | Resolved style overrides for hover.                                                 |
| `click`   | Resolved style overrides for selection.                                             |

Other fields in `customData` remain available. A host that uses Excalidraw
directly implements pointer input and state rendering through its own viewer.

## Browser API

Render a document with `result.toSvg({ interactive: true })`, mount the markup
as inline SVG, then import the helpers from `@grethel-labs/excaliplant/hooks`.
Use the exported helpers and event payload as the public API. SVG element
structure and interaction markers are renderer implementation details.

| Function                          | Contract                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bindHooks(svg)`                  | Enables pointer and keyboard interaction on the SVG and returns a cleanup function. Calling it twice on the same bound SVG returns the same cleanup. Cleanup unbinds events and restores the normal styles. |
| `onHook(svg, selector, listener)` | Subscribes to one author `#id` or `.class` and returns an unsubscribe function. The listener receives the custom DOM event. Call its unsubscribe independently of the SVG binding cleanup.                  |

Each interaction sends a DOM `CustomEvent` named `excaliplant:hook` with
`bubbles: true` and `cancelable: false`. Listeners receive the updated visual
state. The payload is `event.detail`.
Both helpers require a live inline SVG root. `onHook()` throws a `TypeError`
for a selector outside the `#id` and `.class` forms above.

```ts
type HookEventDetail = {
  id: string | undefined;
  classes: string[];
  type: "hover" | "click";
  active: boolean;
  elementId: string;
};
```

- `id` is `undefined` for a class-only binding. JSON serialization omits that
  field. `classes` is an empty array for an ID-only binding.
- `type: "hover"` reports pointer entry (`active: true`) and exit
  (`active: false`). Movement between parts of one hook stays within the same
  hover state. Touch pointers can activate a hook by tapping it.
- `type: "click"` reports selection (`active: true`) and deselection
  (`active: false`). Each hook has independent selection state. Enter and Space
  activate a focused hook. Ordinary SVG hyperlinks retain their navigation.
- `elementId` is the Excalidraw primitive ID that received the interaction. On
  a compound element the outline and caption can report different primitive
  IDs with the same hook ID and classes.

```js
import { bindHooks, onHook } from "@grethel-labs/excaliplant/hooks";

const cleanUp = bindHooks(svg);
const stopOrders = onHook(svg, "#orders", ({ detail }) => {
  if (detail.type === "click" && detail.active) openOrders();
});
const stopServices = onHook(svg, ".service", ({ detail }) => {
  if (detail.type === "hover") setServiceHoverIndicator(detail.active);
});
```

The host supplies its own actions. PlantUML supplies identifiers and styles as
data. The default SVG output, SVG displayed as an image, and PNG provide static
renderings. Excalidraw exports carry the hook metadata for a compatible host.
