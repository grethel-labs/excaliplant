# Ticket: ER/Chen-Diagramme mit vollständiger PlantUML-Unterstützung

## Ziel und Scope

Chen-Entity-Relationship-Diagramme (`@startchen`) sollen Entities, Attributes, Relationships, Cardinalities, Weak Entities and Specialization constructs unterstützen.

## Offizielle Quellen

- https://plantuml.com/de/er-diagram
- https://plantuml.com/de/style
- https://plantuml.com/de/color

## Feature-Inventar mit PUML-Beispielen

### Entities, Relationships und Attributes

```plantuml
@startchen
entity CUSTOMER
relationship ORDERED
entity ORDER
CUSTOMER -1- ORDERED
ORDERED -N- ORDER
attribute customer_name
CUSTOMER - customer_name
@endchen
```

Akzeptieren: entity rectangles, relationship diamonds, attributes as ovals and relationship links.

### Key, Derived, Multivalued und Composite Attributes

```plantuml
@startchen
entity PERSON
attribute "person id" as id <<key>>
attribute age <<derived>>
attribute phone <<multi>>
attribute address {
  street
  city
}
PERSON - id
PERSON - age
PERSON - phone
PERSON - address
@endchen
```

Akzeptieren: typed/key/derived/multivalued attributes, composite attribute blocks and aliases.

### Cardinalities, Weak Entities und Identifying Relationships

```plantuml
@startchen
entity DEPENDENT <<weak>>
relationship SUPPORTS <<identifying>>
entity EMPLOYEE
EMPLOYEE -1- SUPPORTS
SUPPORTS =N= DEPENDENT
@endchen
```

Akzeptieren: cardinalities/ranges, weak entity double borders, identifying relationship double diamonds/lines.

### Specialization und Categories

```plantuml
@startchen
entity PERSON
entity EMPLOYEE
entity CUSTOMER
PERSON -> EMPLOYEE
PERSON -> CUSTOMER
@endchen
```

Akzeptieren: subclasses, categories, unions if documented syntax is encountered.

## Parser-Plan

- Separate `chen` parser mode with entity, attribute, relationship and cardinality plugins.
- Preserve source order and aliases for layout.
- Normalize Chen links into `Connection` plus ER-specific endpoint/cardinality metadata.

## Modell-Plan

- `ChenDiagram` can reuse `Diagram` if `Box.kind` covers entity, relationship, attribute and composite attribute.
- Weak/derived/multivalue flags stored as metadata.

## Layout-Plan

- ELK is acceptable but attribute clustering around owner may need custom constraints.
- Composite attributes render as nested mini-graphs or grouped ovals.

## Renderer-Plan

- Entities rectangles, relationships diamonds, attributes ovals, weak/double borders, derived dashed outlines.
- SVG output escapes all labels.

## Modul-eigene Artefaktstruktur

Dieses Ticket plant ein eigenes `er-chen`-Diagrammtyp-Modul unter `src/diagrams/er-chen/`. Parser, Layout, Renderer, Security-Profil, Tests, Doku, Szenarien und modulnahe Assets gehoeren physisch in diesen Modulbereich.

`ModuleDocsManifest` und `ModuleTestManifest` verweisen auf diese Modulpfade, statt zentrale Docs-/Testlisten als Quelle der Wahrheit zu verwenden. Generated Review-Artefakte werden modulgespiegelt unter `docs/ressources/generated/modules/er-chen/{puml,excalidraw,svg,png}/<feature>/` erzeugt. Root-Tests bleiben fuer Public API, Cross-Module-Verhalten, Security-wide Gates und Migration reserviert.

## Architekturkompatibilitätsprüfung

- Mostly compatible with graph pipeline, but attribute placement may need ER-specific layout hints.

## Validierungsloop pro Ticket

1. Parse official Chen examples into entity/relationship/attribute model.
2. Render cardinality and weak/identifying visual distinctions.
3. Add security tests for labels and aliases.
4. Run standard test/typecheck/format gate.

## Akzeptanzkriterien

- Entities, relationships, attributes and cardinalities render correctly.
- Weak/identifying and derived/multivalue semantics are visible.
