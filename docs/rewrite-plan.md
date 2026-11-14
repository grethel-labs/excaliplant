# Rewrite-Plan: excaliplant 1.0 („clean rewrite“)

Stand: 2026-11-14 · Ausgangsbasis: `main` @ `1f6fe08` (v0.19.5, ~32k LOC, 25 Module)

## 1. Ausgangslage – was wir behalten, was wir verwerfen

### Ideen, die bleiben

| Idee                                                                                      | Bewertung                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------ | ------------------------------------------ |
| Pipeline `PlantUML → Modell → Layout → Excalidraw-JSON → SVG/PNG`                         | Kern des Produkts, bleibt                                   |
| Excalidraw-JSON als „Single Source of Truth“; SVG wird _aus_ dem JSON gerendert (roughjs) | Bleibt – was man in Excalidraw sieht, steht auch im SVG/PNG |
| ELK für Graph-Layouts, eigene deterministische Layouts für Sequenz/Timing/Gantt           | Bleibt                                                      |
| Excalifont eingebettet (woff2 im SVG, TTF für resvg)                                      | Bleibt                                                      |
| Deterministische IDs/Seeds (Hash über Quelle)                                             | Bleibt                                                      |
| Harte Ressourcenlimits, Escaping, keine FS-Zugriffe im Parser                             | Bleibt, wird zentralisiert                                  |
| Beispiele dienen gleichzeitig als Tests und Doku                                          | Bleibt, wird radikal vereinfacht (`.puml`-Dateien)          |
| Release über PR-Label `release:major                                                      | minor                                                       | patch` | Bleibt als Konzept, Umsetzung komplett neu |

### Probleme, die verschwinden

- **Über-Abstraktion:** 9 Basisklassen pro Modul (`Assets`, `Docs`, `Security`, `Tests`, …),
  ~10 Dateien pro Diagrammtyp, davon viele leer/boilerplate.
- **Excalidraw-Renderer mit 2 750 Zeilen**, in dem Diagrammwissen und Format vermischt sind.
- **Falsche Ausgaben** (z. B. Composite-States gehen verloren, Kanten starten im Leeren).
- **Release-Automatik** mit Bot-SSH-Key, Amend-Force-Pushes auf PRs, Auto-Rebase,
  Merge-Drivern, generierten Dateien mit Versionsnummer → fragil und schwer nachvollziehbar.
- Kein Preprocessor, keine echte Activity-Unterstützung, Creole nur „degradiert“.

## 2. Zielarchitektur

```text
PlantUML-Text
  └─ core/source        @start…@end-Blöcke, newpage, Block-Kommentare, Zeilenfortsetzung
      └─ core/preprocess !define, $vars, !if/!while/!foreach, !procedure/!function, !include (Resolver)
          └─ registry.detect  → Diagramm-Modul (kind)
              └─ module.parse   Zeilen → Modell (diagrammspezifisch, mit gemeinsamen Common-Commands)
                  └─ module.layout  Modell → Geometrie (ELK | Tree | eigene Engines)
                      └─ module.draw    Geometrie → Canvas (Excalidraw-Elemente)
                          └─ render/    excalidraw | svg (roughjs) | png (resvg)
```

### Verzeichnisstruktur

```text
bin/excaliplant.mjs            CLI (nur I/O + Optionen)
src/
  index.mjs                    öffentliche API
  api.mjs                      render(), renderAll(), RenderResult
  core/
    source.mjs                 Block-Extraktion, Kommentare, Fortsetzungen
    preprocess/                Preprocessor + sicherer Ausdrucks-Evaluator + Builtins
    registry.mjs               DiagramRegistry (register, detect, list)
    pipeline.mjs               Orchestrierung parse → layout → draw
    limits.mjs                 alle Ressourcenlimits an einer Stelle
    diagnostics.mjs            Warnungen/Fehler mit Zeilennummern
    errors.mjs                 ExcaliplantError, ParseError
    hash.mjs                   stableHash32, seeded RNG
  syntax/                      gemeinsame PlantUML-Sprache
    reader.mjs                 LineReader (Cursor, Lookahead, Block-Lesen, Zeilennummern)
    text.mjs                   Quotes, Kommentare, Splitter, Escapes
    color.mjs                  Farbnamen, #hex, Gradients, Farbspezifikation `#back;line:red;text:blue`
    creole.mjs                 Creole/HTML-Markup → RichText (Bold/Italic/Code/Listen/Tabellen …)
    arrows.mjs                 Pfeil-Grammatik für Graph-Diagramme (Köpfe, Linienstil, Richtung, [#color,dashed])
    commons.mjs                title/caption/header/footer/legend/mainframe/skinparam/<style>/hide/show/scale/direction
    skin.mjs                   skinparam + <style> → Theme-Overrides
  model/
    graph.mjs                  gemeinsames Graph-Modell (Node, Edge, Group, Note)
  layout/
    measure.mjs                Textmessung mit echten Excalifont-Metriken (generiert aus TTF)
    elk.mjs                    Graph → ELK (Hierarchie, Labels, Ports) → Positionen + Routen
    tree.mjs                   Tidy-Tree (Mindmap beidseitig, WBS, Files)
    geometry.mjs               Punkte, Rechteck-Schnitt, Polylinien
  draw/
    canvas.mjs                 Canvas-Builder → Excalidraw-Elemente (rect, ellipse, diamond, line, arrow, text, group)
    shapes.mjs                 Shape-Bibliothek (component, node, database, cloud, actor, folder, queue, …)
    theme.mjs                  Themes (sketch, plain, dark, blueprint …) + Auflösung
    frame.mjs                  title/header/footer/legend/caption/mainframe um den Diagramm-Body
  render/
    excalidraw.mjs             Dokument finalisieren + validieren
    svg.mjs                    Excalidraw → SVG (roughjs, sketch/clean)
    png.mjs                    SVG → PNG (resvg)
    font.mjs                   Font-Einbettung
  diagrams/
    index.mjs                  BUILTIN_DIAGRAMS
    graph/                     gemeinsamer Toolkit für Graph-Diagramme (Parser-Regeln + Draw)
    <kind>/                    pro Diagrammtyp: index.mjs (+ parser/layout/draw bei Bedarf)
examples/<kind>/*.puml         Beispiele = Testfixtures = Doku-Galerie
scripts/docs.mjs               rendert Galerie + README (mit --check für CI)
test/                          node:test Suites
```

### Modulvertrag (ein Objekt statt Klassenhierarchie)

```js
export default defineDiagram({
  kind: "class",                 // stabiler Name
  title: "Class diagram",
  start: "uml",                  // @startuml-Familie oder eigenes @startjson etc.
  detect: (lines) => score,      // nur für @startuml-Familie: 0…1
  parse: (lines, ctx) => model,
  layout: async (model, ctx) => laid,
  draw: (laid, canvas, ctx) => void,
});
```

Kein Diagramm-Modul kennt Excalidraw-Felder, SVG oder PNG – es zeichnet nur über den Canvas.

## 3. PlantUML-Abdeckung (Ziel)

### Querschnitt (für alle Diagramme)

- **Preprocessor:** `!define`/`!undef`, `!$var = …`, `%builtins` (`%strlen`, `%upper`, `%substr`,
  `%string`, `%intval`, `%true/%false`, `%not`, `%newline`, `%date` deterministisch …),
  `!if/!elseif/!else/!endif`, `!ifdef/!ifndef`, `!while`, `!foreach`, `!procedure`, `!function`,
  `!return`, `!log`, `!assert`, `!include`/`!includesub` nur über expliziten Resolver,
  `!theme` (gebündelte Themes), `!pragma`.
- **Commons:** `title`, `caption`, `header`, `footer`, `legend … endlegend`, `mainframe`,
  `skinparam` (Block + Einzeilig), `<style>`-Blöcke (Teilmenge), `scale`, `hide/show`,
  `left to right direction`, `top to bottom direction`.
- **Creole:** `**bold**`, `//italic//`, `""mono""`, `--strike--`, `__under__`, `~~wave~~`,
  Überschriften, Listen, Tabellen, Trennlinien, `<b>`, `<i>`, `<color>`, `<size>`, `<u>`,
  `\n`, Unicode `<U+XXXX>`, `<&icon>`/`<$sprite>` als Platzhalter-Glyphen.
- **Farben:** alle HTML-Farbnamen, `#RGB`, `#RRGGBB`, `#RRGGBBAA`, Gradients `#a/b`, `#a|b`
  (→ erste Farbe), Spezifikation `#back;line:red;line.dashed;text:blue`.

### Diagrammtypen

| Typ                                          | Start                        | Layout                                  |
| -------------------------------------------- | ---------------------------- | --------------------------------------- |
| Sequenz                                      | `@startuml`                  | eigene Tabellen-Engine                  |
| Use Case                                     | `@startuml`                  | ELK                                     |
| Klasse                                       | `@startuml`                  | ELK                                     |
| Objekt (inkl. `map`)                         | `@startuml`                  | ELK                                     |
| Aktivität (neue Syntax + Swimlanes)          | `@startuml`                  | strukturierte Block-Engine              |
| Aktivität (Legacy `(*) -->`)                 | `@startuml`                  | ELK                                     |
| Komponente                                   | `@startuml`                  | ELK                                     |
| Deployment                                   | `@startuml`                  | ELK                                     |
| Zustand (Composite, Regionen, Pseudo-States) | `@startuml`                  | ELK (hierarchisch)                      |
| Timing                                       | `@startuml`                  | eigene Zeitachsen-Engine                |
| ArchiMate                                    | `@startuml`                  | ELK                                     |
| ER Chen                                      | `@startchen`                 | ELK                                     |
| ER IE (Crow's Foot)                          | `@startuml`                  | ELK                                     |
| JSON                                         | `@startjson`                 | ELK (Tabellen-Knoten)                   |
| YAML                                         | `@startyaml`                 | ELK (Tabellen-Knoten)                   |
| Netzwerk (nwdiag)                            | `@startnwdiag`               | eigene Bus-Engine                       |
| Salt (Wireframes)                            | `@startsalt`                 | Grid-Engine                             |
| Gantt                                        | `@startgantt`                | Kalender-Engine                         |
| Chronologie                                  | `@startchronology`           | Zeitachse                               |
| MindMap                                      | `@startmindmap`              | Tree (beidseitig)                       |
| WBS                                          | `@startwbs`                  | Tree (Org-Chart)                        |
| EBNF                                         | `@startebnf`                 | Railroad-Engine                         |
| Regex                                        | `@startregex`                | Railroad-Engine                         |
| Mathe (AsciiMath/LaTeX)                      | `@startmath` / `@startlatex` | Box-Layout (Brüche, Hoch/Tief, Wurzeln) |
| Ditaa                                        | `@startditaa`                | ASCII-Grid-Erkennung                    |
| Files                                        | `@startfiles`                | Tree                                    |
| Chart                                        | `@startchart`                | Achsen-Engine                           |
| DOT (Graphviz)                               | `@startdot`                  | ELK                                     |
| Creole                                       | `@startcreole`               | Text-Block                              |

## 4. Rendering

- Canvas erzeugt Excalidraw-Elemente (Excalidraw v2 Schema, `fontFamily: 5` = Excalifont).
- Gruppen (`groupIds`) halten Shapes + Labels zusammen, Pfeile mit `startBinding/endBinding`.
- Optionen: `theme` (`sketch` Default, `plain`, `dark`, `blueprint`), `sketch: boolean`
  (Rauigkeit an/aus), `seed`, `background`, `padding`, `width` (PNG/Canvas).
- SVG: roughjs-Pfade, Font als woff2-Data-URL, alle Texte/Attribute escaped.
- PNG: resvg mit gebündelter TTF, Breite auf `[16, 16000]` begrenzt.

## 5. Öffentliche API

```js
import { render, renderAll, parse, listDiagramTypes } from "@grethel-labs/excaliplant";

const result = await render(source, { theme: "sketch" });
result.kind; // "sequence"
result.excalidraw; // Excalidraw-Dokument
result.toSvg(); // string
result.toPng({ width: 1600 }); // Buffer
result.diagnostics; // Warnungen mit Zeilennummern

// Kompatibilität mit 0.x
const svg = await renderPlantUml(source).toSvg();
```

Subpath-Exports: `./svg`, `./png`, `./registry`, `./preprocess`.

CLI: `excaliplant in.puml -o out.svg|.png|.excalidraw [--theme] [--no-sketch] [--width] [--all] [--include-dir]`,
`stdin`, `--list-types`.

## 6. Sicherheit

- Eine Datei `core/limits.mjs`: Eingabegröße, Zeilen, Preprocessor-Schritte/Rekursion/Ausgabegröße,
  Knoten/Kanten, Textlänge, PNG/Canvas-Breite.
- Keine `eval`/`Function`; Preprocessor-Ausdrücke über eigenen Parser.
- `Map`/`Object.create(null)` für angreiferkontrollierte Schlüssel.
- Regexe ohne verschachtelte Quantoren; Scanner statt Regex für Quotes/Klammern.
- `!include` nur über übergebenen Resolver; CLI erlaubt nur Dateien unterhalb `--include-dir`.
- Eigene Security-Testsuite (XSS in SVG, ReDoS-Zeitbudgets, Prototype-Pollution, Limits).

## 7. Tests & Doku

- `examples/<kind>/*.puml` – jede Datei wird in `test/examples.test.mjs` geparst, gelayoutet,
  in alle Formate gerendert und strukturell geprüft (Elementanzahl, keine NaN, Bounds, Texte vorhanden).
- Fokussierte Unit-Tests: Preprocessor, Creole, Farben, Pfeile, je Diagrammtyp Parser-Verträge.
- `npm run docs` erzeugt `docs/gallery/**/*.svg|png`, `docs/gallery.md` und `README.md`
  (aus `docs/README.template.md`), `npm run docs:check` prüft auf Drift (CI).
- README: Hero-Screenshots, Quickstart, Beispiele (Quelle + Bild nebeneinander), Feature-Matrix, CLI, API.

## 8. GitHub Actions – neuer Release-Fluss

```text
PR ──► ci.yml (format, typecheck, docs:check, audit, Tests 3 OS × Node 20/22/24, pack-smoke)
   └─► pr-labels.yml (genau ein release:* Label; Ableitung aus Branch-Token; Default patch)
merge ──► release.yml
            1. Label des gemergten PRs lesen (release:none → kein Release)
            2. nächste Version aus letztem v*-Tag + Bump berechnen
            3. volles Gate, npm version --no-git-tag-version (nur im Runner)
            4. npm pack + Smoke-Install
            5. npm publish --provenance (NPM_TOKEN oder Trusted Publishing/OIDC)
            6. GitHub Release + Tag auf dem Merge-Commit, Artefakte (tgz, Galerie)
workflow_dispatch ──► release.yml mit manuellem Bump
```

- **Keine** Bot-Commits, kein SSH-Key, keine Force-Pushes, kein Auto-Rebase, keine Merge-Driver.
- Version im Repo: `0.0.0-development`; die Wahrheit sind die `v*`-Tags (wie semantic-release).
- Generierte Doku enthält keine Versionsnummer → kein Drift durch Releases.
- Dependabot bleibt (npm + Actions, gruppiert, wöchentlich).

## 9. Umsetzungsreihenfolge

1. **Fundament:** Branch, altes Repo leeren, `package.json`, tsconfig, Prettier.
2. **Core:** source, preprocess, limits, diagnostics, hash, registry, pipeline.
3. **Syntax:** reader, text, color, creole, arrows, commons, skin.
4. **Zeichnen & Rendern:** Font-Metriken generieren, measure, canvas, shapes, theme, frame,
   excalidraw/svg/png.
5. **Graph-Familie:** graph-Modell, ELK-Layout, Graph-Draw; dann class, object, component,
   deployment, usecase, state, archimate, ie, chen, legacy-activity, dot.
6. **Eigene Engines:** sequence, activity, timing, gantt, chronology.
7. **Bäume & Daten:** mindmap, wbs, files, json, yaml.
8. **Spezial:** nwdiag, salt, ebnf, regex, math, ditaa, chart, creole.
9. **API & CLI.**
10. **Beispiele, Tests, visuelle Kontrolle** (jedes Beispiel als PNG ansehen).
11. **Doku-Generator + README** mit Screenshots.
12. **Workflows, AGENTS.md & Adapter, CHANGELOG, SECURITY**, PR öffnen.

## 10. Definition of Done

- `npm test`, `npm run typecheck`, `npm run format:check`, `npm run docs:check`,
  `npm audit --omit=dev --audit-level=high` grün.
- Jedes Beispiel rendert ohne Warnung in Excalidraw/SVG/PNG und wurde visuell geprüft.
- README mit echten, generierten Screenshots.
- Release-Workflow dokumentiert; Veröffentlichung erst nach Review/Merge des PRs.
