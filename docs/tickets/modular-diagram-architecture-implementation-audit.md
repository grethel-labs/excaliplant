# Audit: Modular Diagram Architecture Follow-up

## Verdict

Der `src`-Refactor ist als Phase-1-Fundament umgesetzt: Diagrammtyp-Module
stehen unter `src/diagrams/`, Orchestrierung unter `src/main/`, allgemeine
Runtime unter `src/general/` und generische Helfer unter `src/util/`. Die alten
Top-Level-Source-Ordner sind entfernt, Package-Exports zeigen auf die neuen
Primaerdateien, und die letzte bekannte Gate-Runde war gruen.

Nicht abgeschlossen ist das groessere Zielbild: Module besitzen ihre Tests,
Doku, Szenarien und Generated-Review-Artefakte noch nicht physisch als eigene
Unterstruktur; Self-Diagramm-Generierung ist noch `docs/scripts`-zentriert; die
Docs-Architektur ist noch nicht sauber in Main-Templates, Modul-Dokuquellen,
Collectors und Outputs getrennt; einige diagrammtypische Restlogik lebt noch in
`src/general/`.

Kurz: Source-Modulstruktur ja. Vollstaendige modul-eigene Artefakt- und
Doku-/Self-Architektur noch offen.

## Validation Context

- Relevante Zielquelle: `docs/tickets/modular-diagram-architecture-foundation.md`.
- Source-Struktur: `src/diagrams/`, `src/main/`, `src/general/`, `src/util/`.
- Aktueller Self-Generator: `docs/scripts/self-diagrams.mjs`.
- Aktueller Docs-Build: `docs/scripts/build-docs.mjs`.
- Aktuelle Architekturtests: `tests/modular_architecture.test.mjs` und
  `tests/self_introspection.test.mjs`.
- Letzte bekannte Vollvalidierung: `npm run typecheck`, `npm test`,
  `npm run format:check`, `node docs/scripts/check-build-manifest.mjs` und
  `npm audit --omit=dev --audit-level=high` bestanden.

## Top Findings

1. `[OPEN]` Modulfachliche Tests liegen noch primaer in Root-Tests und nicht in
   `src/diagrams/<kind>/tests/` mit Modul-Testmanifesten.
2. `[OPEN]` Modul-Dokuquellen liegen noch nicht in `src/diagrams/<kind>/docs/`
   mit Haupttemplate, Feature-Szenarien, Partials und modulnahen Assets.
3. `[OPEN]` Generated Coverage-/Review-Artefakte sind noch nicht nach
   `docs/ressources/generated/modules/<kind>/...` gespiegelt.
4. `[OPEN]` Self-Generation ist noch kein eigenes Root-Subsystem mit
   Collectors, Tests, Templates und `output/manifest.json`.
5. `[OPEN]` Die Main-Doku-Pipeline sammelt noch nicht nur aus
   ModuleDocsManifest, ModuleTestManifest und Self-Output-Manifest.
6. `[PARTIAL]` `src/general/model/diagram.mjs` enthaelt weiterhin
   diagrammfamilien- und sequenznahe Modellklassen.
7. `[PARTIAL]` `src/general/layout/elk_layout.mjs` und
   `src/general/render/excalidraw.mjs` enthalten noch graph-/sequence-nahe
   Kompatibilitaetspfade, die langfristig in Modul- oder Shared-Graph-Bereiche
   gehoeren.
8. `[PARTIAL]` Class-spezifisches Sizing/Text-Wrapping lebt noch teilweise in
   allgemeinen Layout-/Style-Dateien.
9. `[OPEN]` Dependency-Resolver, versionierte Capabilities, StyleCascade,
   InlineText/RichTextSpan, ArrowBase/TextBase als echte Platform Services und
   vollstaendige SecurityProfile-Enforcement bleiben Folgearbeit.
10. `[OPEN]` Ticket-Harmonisierung ist nicht abgeschlossen: alle Diagrammtyp-
    Tickets muessen die neue modul-eigene Artefaktstruktur nennen.

## Required Follow-up Work

### A. Modul-eigene Tests und Szenarien

- Pro Diagrammtyp `src/diagrams/<kind>/tests/` einfuehren.
- Feature-Szenarien unter `tests/scenarios/<feature>/*.puml` speichern.
- Parser-, Layout-, Renderer-, Security-, Fuzz-/Corpus- und Golden-Fixtures aus
  Root-Tests in Modulbereiche verschieben, wenn sie fachlich nur einen
  Diagrammtyp betreffen.
- Root-Tests auf Public API, Cross-Module-Verhalten, Migration, Security-wide
  und Architektur-Contracts begrenzen.
- `ModuleTestManifest` so erweitern, dass es physische Testdateien,
  Szenarioordner, Fixtures und erwartete Outputs validierbar referenziert.

### B. Modul-eigene Dokumentation

- Pro Diagrammtyp `src/diagrams/<kind>/docs/` einfuehren.
- Je Modul ein Haupttemplate `index.template.md.njk` und optionale Partials
  pflegen.
- Feature-Doku unter `docs/features/<feature>/` strukturieren, inklusive
  `scenarios/*.puml`, `notes.md` und modulnahen Assets.
- Zentrale Coverage-Listen wie `docs/scripts/sequence-coverage-examples.mjs`
  langfristig durch Modul-Doku-/Testmanifeste ersetzen.
- Generated Review-Artefakte nach
  `docs/ressources/generated/modules/<kind>/{puml,excalidraw,svg,png}/<feature>/`
  schreiben.

### C. Root-eigenes Self-System

Zielstruktur:

```text
self/
  collectors/
  diagrams/
  templates/
  tests/
  output/
    manifest.json
    puml/
    excalidraw/
    svg/
    png/
```

- `docs/scripts/self-diagrams.mjs` in dieses System migrieren oder als duennen
  Adapter erhalten.
- Jeder sinnvolle Projektblick bekommt einen Collector: Modulgraph,
  Dependency-Graph, Parser-Plugins, Render-Callflow, Docs/Test/Asset-
  Ownership, SecurityProfile/Capabilities, Model-Familien und Package-Exports.
- `tests/self_introspection.test.mjs` in Self-System-Contract-Tests verschieben
  oder aus `self/tests/` importieren.
- `docs/scripts/build-docs.mjs` liest Self-Diagramme nur aus
  `self/output/manifest.json` ein.

### D. Docs-Architektur-Cleanup

- Main-Templates, API-Referenz, Guides, Build-Collectors und Generated Outputs
  klar trennen.
- Diagrammtypische Dokuquellen aus Root-Docs in Modulordner verschieben.
- `docs/ressources/generated/` als bestehenden Output-Pfad entweder bewusst
  stabilisieren oder mit Migrationsalias nach `docs/resources/generated/`
  korrigieren.
- `docs/tickets/` bleibt waehrend dieser Arbeiten erhalten und wird nicht
  geloescht, verschoben oder als Generated Docs behandelt.

### E. Restliche Code-Cleanup-Kandidaten

- Sequence-Modellklassen aus `src/general/model/diagram.mjs` nach
  `src/diagrams/sequence/model.mjs` pruefen.
- Graph-Modellfamilie nach `src/diagrams/shared/graph_model.mjs` pruefen.
- Graph-Layout nach `src/diagrams/shared/graph_layout.mjs` pruefen.
- Graph-Rendering nach `src/diagrams/shared/graph_render_excalidraw.mjs` oder
  passende Shared-Renderer-Struktur pruefen.
- Class-spezifische Sizing-/Wrapping-Adapter aus `src/general/layout/` und
  `src/general/style/` in das Class-Modul verschieben, wenn sie nicht wirklich
  diagrammuebergreifend sind.

## Compatibility Assessment

Die Folgearbeiten sind kompatibel mit der aktuellen Architektur, weil sie die
bestehende Modulgrenze verstaerken, ohne die PlantUML-Pipeline zu ersetzen. Die
Pipeline bleibt: Parse ueber Modul, Modell, Layout, Render, Excalidraw/SVG/PNG.
Geaendert wird die Ownership der begleitenden Artefakte: Doku, Tests, Szenarien,
Fixtures, Generated Outputs und Self-Collectors sollen dort liegen, wo die
fachliche Semantik lebt.

Das groesste Risiko ist nicht technischer Bruch, sondern Drift: wenn Root-Docs,
Root-Tests oder `docs/scripts` weiter diagrammtypische Sonderlisten pflegen,
werden neue Module nicht automatisch sichtbar und die Architektur wird wieder
zentralistisch. Deshalb muessen Manifest- und Collector-Tests Teil jedes
Umbau-Loops sein.

## Required Work To Claim Full Ticket Completion

1. Jedes bestehende Diagrammtyp-Modul besitzt `tests/`, `docs/` und bei Bedarf
   `assets/` als physische Unterordner.
2. Jedes bestehende Diagrammtyp-Modul deklariert physische Docs-/Tests-/Assets-
   Pfade in seinen Manifesten.
3. Modul-Generated-Outputs werden unter einem modulgespiegelten Output-Pfad
   erzeugt und durch ein Build-Manifest validiert.
4. Die Doku-Pipeline sammelt Modul-Doku und Self-Diagramme ueber Manifeste ein,
   nicht ueber hartcodierte Diagrammtyp-Listen.
5. `self/` existiert als Root-Subsystem mit Collectors, Tests und
   `output/manifest.json`.
6. Fuer jedes sinnvolle Architektur-Self-Diagramm gibt es einen Collector und
   einen Contract-Test.
7. `docs/tickets/` bleibt unveraendert erhalten, bis ein separates Ticket seine
   Migration oder Entfernung plant.
8. Alle Diagrammtyp-Tickets nennen Modulart, Layoutstrategie, SecurityProfile,
   DocsManifest, TestManifest, AssetManifest, Dependencies, modul-eigene
   Artefaktstruktur, Generated-Output-Pfade und Migration Impact.

## Final Assessment

Dieses Audit ersetzt den alten Implementierungsstand. Der naechste sinnvolle
Schritt ist kein weiterer Source-Ordner-Refactor, sondern die konsequente
Ownership der Begleitartefakte: Modul-Tests, Modul-Doku, Modul-Szenarien,
Self-System und Docs-Build werden so gekapselt, dass neue Diagrammtypen ohne
zentrale Sonderlisten sichtbar, testbar und dokumentierbar werden.
