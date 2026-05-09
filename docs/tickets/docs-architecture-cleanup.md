# Ticket: Docs-Architektur aufraeumen ohne Ticket-Ordner zu zerstoeren

## Ziel und Scope

Die Dokumentationsstruktur soll dieselbe Ownership-Logik wie die Source-Architektur bekommen. Diagrammtypische Dokuquellen, Beispiele und Szenarien gehoeren in das jeweilige Diagrammtyp-Modul. Root-Docs bauen daraus README, API, Guides und Generated Outputs zusammen.

Der temporaere Planungsordner `docs/tickets/` bleibt waehrend dieses Cleanups erhalten. Er wird nicht geloescht, verschoben, umbenannt oder in Generated Docs einsortiert.

## Zielstruktur

```text
docs/
  main/
    README.template.md.njk
    API.template.md.njk
  guides/
  reference/
  build/
    collectors/
    templates/
    manifest.mjs
  ressources/generated/
    modules/<kind>/
      puml/<feature>/*.puml
      excalidraw/<feature>/*.excalidraw
      svg/<feature>/*.svg
      png/<feature>/*.png
    self/
  tickets/
```

Modul-Dokuquellen liegen nicht hier, sondern im Modul:

```text
src/diagrams/<kind>/docs/
  index.template.md.njk
  partials/
  features/<feature>/
    scenarios/*.puml
    notes.md
  assets/
```

## Build- und Collector-Plan

- `ModuleDocsManifest` ist die Quelle fuer diagrammtypische Doku.
- `ModuleTestManifest` liefert die testbaren PUML-Szenarien und Fixtures.
- `self/output/manifest.json` liefert repo-eigene Self-Diagramme.
- Root-Docs bauen nur aus diesen Quellen zusammen.
- Keine zentrale `docs/scripts/<kind>-coverage-examples.mjs`-Liste ist Zielarchitektur.
- Generated Outputs werden ueber Build-Manifeste validiert, nicht manuell gepflegt.

## Migrationsplan

1. Bestehende README/API-Templates in einen klaren Main-Bereich verschieben oder den aktuellen Ort als Main-Bereich dokumentieren.
2. Diagrammtypische Coverage-Beispiele aus `docs/scripts` in `src/diagrams/<kind>/docs/features/` und `src/diagrams/<kind>/tests/scenarios/` ueberfuehren.
3. `build-docs` in Collector-Phasen schneiden: Modul-Doku, Self-Output, API, README, Build-Manifest.
4. Generated Outputs nach Modul/Feature spiegeln.
5. `docs/ressources/generated/` bewusst stabilisieren oder mit Kompatibilitaetsmigration nach `docs/resources/generated/` korrigieren.
6. `docs/tickets/` unangetastet lassen und nur seine Inhalte weiter als Planungsartefakte aktualisieren.

## Test- und Sicherheitsplan

- Build-Manifest prueft README/API, Self Outputs und modulgespiegelte Generated Outputs.
- Contract-Test bricht, wenn ein Modul-Doku-Manifest auf nicht vorhandene Templates/Szenarien zeigt.
- Contract-Test bricht, wenn ein Modul ohne Doku-/Testmanifest in Public-Doku aufgenommen wird.
- Security-Test stellt sicher, dass Docs-Generatoren keine untrusted PlantUML-Includes, Remote-Themes oder Dateisystempfade aus Nutzereingaben ausfuehren.
- Regressionstest stellt sicher, dass `docs/tickets/` beim Cleanup nicht verschoben oder geloescht wird.

## Architekturkompatibilitätsprüfung

Das Ticket ist kompatibel mit der bestehenden Build-Pipeline, weil README, API und generated resources bereits ueber Scripts gebaut werden. Es veraendert die Ownership: Root-Docs orchestrieren, Module liefern Inhalte, Self-System liefert Projekt-Diagramme.

## Validierungsloop pro Ticket

1. Einen Doku-Collector isolieren.
2. Eine Modul-Dokuquelle anbinden.
3. Generated Outputs fuer dieses Modul erzeugen.
4. Build-Manifest pruefen.
5. `docs/tickets/`-Existenz und Inhalt pruefen.
6. `npm run format:check`, `npm run build:docs` und `node docs/scripts/check-build-manifest.mjs` ausfuehren.

## Akzeptanzkriterien

- Diagrammtypische Dokuquellen liegen bei den Diagrammtyp-Modulen.
- Root-Docs enthalten keine hartcodierten Diagrammtyp-Featurelisten mehr.
- Generated Outputs sind nach Modul und Feature gespiegelt.
- Self-Diagramme werden aus `self/output/manifest.json` eingesammelt.
- `docs/tickets/` bleibt erhalten und wird nicht Teil der Generated-Doku.
