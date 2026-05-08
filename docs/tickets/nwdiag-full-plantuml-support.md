# Ticket: Nwdiag-Diagramme mit vollständiger PlantUML-Unterstützung

## Ziel und Scope

Nwdiag-Diagramme sollen Networks, Nodes, Addresses, Groups, Peer/Internal Networks, Shapes, Sprites, Styles and common titles/legends unterstützen.

## Offizielle Quellen

- https://plantuml.com/de/nwdiag
- https://plantuml.com/de/deployment-diagram
- https://plantuml.com/de/style
- https://plantuml.com/de/openiconic

## Feature-Inventar mit PUML-Beispielen

### Networks, Nodes und Addresses

```plantuml
@startnwdiag
network dmz {
  address = "210.x.x.x/24"
  web01 [address = "210.x.x.1"]
  web02 [address = "210.x.x.2"]
}
network internal {
  web01
  db01 [address = "172.x.x.10"]
}
@endnwdiag
```

Akzeptieren: network blocks, address attributes, nodes across multiple networks, multiple addresses and jump lines.

### Groups und Extended Syntax

```plantuml
@startnwdiag
network net1 {
  group web {
    color = "#FFAAAA"
    description = "Web tier"
    web01
    web02
  }
}
@endnwdiag
```

Akzeptieren: groups inside/outside networks, multiple groups, color/description/shape on network/group.

### Shapes, Sprites, Icons und Layout

```plantuml
@startnwdiag
network nw {
  server [shape = cloud]
  db [shape = database]
  user [description = "<&person> user"]
}
@endnwdiag
```

Akzeptieren: deployment shapes as node shapes, sprites, OpenIconic, network width `full`, peer networks and internal networks.

### Common Text und Style

```plantuml
@startnwdiag
title Network map
legend
  Production
end legend
<style>
nwdiagDiagram { network { LineColor blue } }
</style>
network prod { app; db }
@endnwdiag
```

Akzeptieren: title/caption/header/footer/legend, shadowing and `nwdiagDiagram` style.

## Parser-Plan

- Dedicated nwdiag block parser with nested network/group contexts.
- Attribute parser for address/color/description/shape.
- Node references must merge repeated nodes across networks.

## Modell-Plan

- `NwdiagDiagram` with networks, groups, nodes, memberships and addresses.
- Node shapes reuse Deployment shape taxonomy.

## Layout-Plan

- Network rows/columns with nodes placed per network membership.
- Repeated nodes need jump/bridge rendering hints.

## Renderer-Plan

- Render networks as bands, groups as overlays and nodes as deployment shapes.
- Address labels and descriptions escaped in SVG.

## Modul-eigene Artefaktstruktur

Dieses Ticket plant ein eigenes `nwdiag`-Diagrammtyp-Modul unter `src/diagrams/nwdiag/`. Parser, Layout, Renderer, Security-Profil, Tests, Doku, Szenarien und modulnahe Assets gehoeren physisch in diesen Modulbereich.

`ModuleDocsManifest` und `ModuleTestManifest` verweisen auf diese Modulpfade, statt zentrale Docs-/Testlisten als Quelle der Wahrheit zu verwenden. Generated Review-Artefakte werden modulgespiegelt unter `docs/ressources/generated/modules/nwdiag/{puml,excalidraw,svg,png}/<feature>/` erzeugt. Root-Tests bleiben fuer Public API, Cross-Module-Verhalten, Security-wide Gates und Migration reserviert.

## Architekturkompatibilitätsprüfung

- Shares shape rendering with Deployment but needs a network/table layout model.

## Validierungsloop pro Ticket

1. Parse network/group/node membership examples.
2. Layout repeated nodes and peer networks deterministically.
3. Render shape and style examples.
4. Run standard gate.

## Akzeptanzkriterien

- Network membership, addresses, groups and repeated nodes are represented.
- Deployment shapes are reused consistently.
