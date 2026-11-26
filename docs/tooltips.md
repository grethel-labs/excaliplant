# Element tooltip specification

Element tooltips are available from excaliplant 1.14.0. A `@tooltip` directive
attaches plain-text help to a diagram element. Hover over the element in the
Playground to read its native browser tooltip.

## PlantUML input

```text
@tooltip (alias:<target> | element:<target>) "<text>"
```

Put directives before the first body line of a diagram or `newpage` page.
They apply to that page. A valid directive can open the preamble in raw formats
such as JSON and Ditaa. Other leading lines remain diagram payload.

- `alias:` targets a graph node or sequence participant by its PlantUML alias.
  It covers the shape and caption, including the opening and closing captions
  of a sequence participant when both are drawn. Double-quote aliases
  containing spaces.
- `element:` targets one Excalidraw primitive in any diagram family. Find
  its `id` in `result.excalidraw.elements` after rendering with the same
  seed, diagram block, page and drawing order. A connector and its caption
  have separate IDs and can carry different tooltip text.

`@tooltip`, `alias` and `element` are case-insensitive. Text is a JSON string
literal on one source line and must contain a non-whitespace character.
Use escapes such as `\"` for a quote and `\n` for a line break.
The render option `limits.maxTextLength` bounds the decoded string.

## Example

```plantuml
@startuml
@tooltip alias:storefront "Receives customer orders."
@tooltip alias:events "Queues order events for downstream services."
component "Storefront" as storefront
component "Order events" as events
storefront --> events : publishes orders
@enduml
```

Hover over **Storefront** or **Order events** to read the tooltip.
[Open the example in the Playground](https://grethel-labs.github.io/excaliplant/#play/component/element-tooltips)
or download the [PlantUML source](../examples/component/element-tooltips.puml).

## Precedence and diagnostics

A drawing primitive can have a tooltip and an [element hook](hooks.md). The
first tooltip wins when targets overlap. Excaliplant skips the entire later
tooltip and reports a diagnostic.

Invalid directives, missing targets and overlapping bindings produce warnings
by default. With `strict: true` they throw a `ParseError` with code
`INVALID_TOOLTIP` and the original 1-based source line. Text that exceeds
`limits.maxTextLength` throws a `LimitError`.

## Scene and SVG output

Every targeted primitive stores the decoded text in
`elements[].customData.excaliplantTooltip`. Validate it with the
`#/$defs/elementTooltip` definition in the [JSON Schema](hooks.schema.json).

SVG writes the tooltip as escaped text in a `<title>` child of the drawing
group. For a browser host, mount `result.toSvg({ interactive: true })` as
inline SVG to make the full shape a hover target. The browser shows the
native tooltip. Tooltips work independently of `bindHooks()` and emit no
hook events.

SVG downloads retain the tooltip text. Excalidraw downloads retain the
tooltip metadata for a compatible viewer. PNG shows the normal diagram.
