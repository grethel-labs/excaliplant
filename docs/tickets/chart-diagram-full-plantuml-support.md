# Ticket: Chart-Diagramme mit vollständiger PlantUML-Unterstützung

## Ziel und Scope

Chart-Diagramme (`@startchart`) sollen bar, line, area, scatter, stacked/grouped bars, axes, labels, legends, grids, annotations and styles support. This requires a chart-specific data/layout/render path.

## Offizielle Quellen

- https://plantuml.com/en/chart-diagram
- https://plantuml.com/de/color
- https://plantuml.com/de/style

## Feature-Inventar mit PUML-Beispielen

### Series und Chart Types

```plantuml
@startchart
bar "Sales" as sales
sales: Jan = 10
sales: Feb = 15
line "Trend" as trend
trend: Jan = 8
trend: Feb = 17
@endchart
```

Akzeptieren: bar, line, area, scatter, coordinate-pair notation and series names.

### Grouped, Stacked und Horizontal Bars

```plantuml
@startchart
bar "Q1" as q1
bar "Q2" as q2
q1: A = 10
q2: A = 14
stacked true
horizontal true
@endchart
```

Akzeptieren: grouped/stacked bars, horizontal orientation and negative values.

### Axes, Ticks, Grid und Legend

```plantuml
@startchart
h-axis "Month"
v-axis "Revenue"
v2-axis "Margin"
legend right
grid true
bar "Sales" as s #SkyBlue
s: Jan = 10
@endchart
```

Akzeptieren: h-axis/v-axis/v2-axis, numeric/categorical axes, ticks, spacing, labels, legend positions and grid.

### Annotations und Style

```plantuml
@startchart
<style>
chartDiagram { axis { LineColor #444 } }
</style>
annotation "Launch" at Jan
bar "Sales" as s
s: Jan = 10 : label
@endchart
```

Akzeptieren: data labels, label positioning, series colors and style blocks.

## Parser-Plan

- Dedicated chart parser producing series, points, axes and annotations.
- Numeric parsing must be locale-independent.

## Modell-Plan

- `ChartDiagram` with series, axes, scales, legend and annotations.

## Layout-Plan

- Chart layout with plot area, axes, ticks and legend constraints.

## Renderer-Plan

- Render bars/lines/areas/scatter points and axis labels in Excalidraw/SVG.

## Modul-eigene Artefaktstruktur

Dieses Ticket plant ein eigenes `chart`-Diagrammtyp-Modul unter `src/diagrams/chart/`. Parser, Layout, Renderer, Security-Profil, Tests, Doku, Szenarien und modulnahe Assets gehoeren physisch in diesen Modulbereich.

`ModuleDocsManifest` und `ModuleTestManifest` verweisen auf diese Modulpfade, statt zentrale Docs-/Testlisten als Quelle der Wahrheit zu verwenden. Generated Review-Artefakte werden modulgespiegelt unter `docs/ressources/generated/modules/chart/{puml,excalidraw,svg,png}/<feature>/` erzeugt. Root-Tests bleiben fuer Public API, Cross-Module-Verhalten, Security-wide Gates und Migration reserviert.

## Architekturkompatibilitätsprüfung

- New chart model/layout required; shared style/color/text still applies.

## Validierungsloop pro Ticket

1. Parser tests for chart types and axes.
2. Render tests for grouped/stacked/horizontal data.
3. Security tests for labels/annotations.
4. Run standard gate.

## Akzeptanzkriterien

- Core chart types and axes render deterministically.
- Data labels and legends do not overlap in regression examples.
