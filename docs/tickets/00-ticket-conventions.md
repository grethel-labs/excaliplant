# Ticket-Konventionen für vollständige PlantUML-Unterstützung

Dieses Dokument ist die gemeinsame Schablone für alle Tickets in `docs/tickets/`. Es beschreibt die gleichbleibenden Erwartungen, damit Component-, Class- und alle weiteren PlantUML-Diagrammtypen nach demselben System erneuert werden.

## Gemeinsame Ziele

- Vollständige PlantUML-Syntax pro Diagrammtyp erfassen, inklusive offizieller Randfälle, globaler Befehle und repräsentativer Beispiele.
- Die bestehende Pipeline respektieren: `parsePlantUml` erkennt Syntax, Modellklassen beschreiben Struktur, Layout schreibt Geometrie, Renderer erzeugen Excalidraw/SVG/PNG.
- Parser-Features als fokussierte Plugins planen, nicht als diagrammspezifische Sonderlogik im generischen Parser-Engine-Code.
- Gemeinsame Sprachelemente wie Style, Skinparam, Creole, Farben, Links, Sprites, Themes, Preprocessing und Subdiagramme einheitlich behandeln.
- Jede Erweiterung deterministisch, testbar und sicher gegen untrusted input halten.

## Offizielle Quellen

- `AGENTS.md` für die Repository-Architekturregeln.
- Offizielle PlantUML-Sprachseiten, die in den jeweiligen Einzeltickets verlinkt sind.
- Bestehende Sequenz-Coverage-Dateien als lokales Muster für Beispiele, Tests und generierte Dokumentation.

## Feature-Inventar mit PlantUML-Beispielen

Diese Meta-Datei definiert keine eigene PlantUML-Syntax. Die Feature-Inventare stehen in den Einzeltickets; sie müssen jeweils mindestens repräsentative `plantuml`-Codeblöcke für Parser-, Layout-, Renderer-, Style- und Security-relevante Featuregruppen enthalten.

## Einheitliche Ticketstruktur

Jedes Ticket soll diese Abschnitte enthalten:

1. Ziel und Scope.
2. Offizielle Quellen.
3. Feature-Inventar mit PlantUML-Beispielen.
4. Parser-Plan.
5. Modell-Plan.
6. Layout-Plan.
7. Renderer-Plan für Excalidraw, SVG und PNG.
8. Modul-eigene Artefaktstruktur.
9. Dokumentations- und Beispielplan.
10. Test- und Sicherheitsplan.
11. Architekturkompatibilitätsprüfung.
12. Validierungsloop pro Ticket.
13. Akzeptanzkriterien.

## Gemeinsame Architekturregeln

- Parser: neue Syntax in `src/diagrams/<kind>/plugins/` kapseln und im Parser-Vertrag des jeweiligen Diagramm-Moduls registrieren; `src/main/parser.mjs` orchestriert nur die Modulwahl.
- Parser-Helfer: vorhandene Utilities wie `stripComment`, `stripQuotes`, `explodeBraces`, `unescapeLabel`, `slug` und `classifyArrow` wiederverwenden oder bewusst erweitern.
- Modell: keine PlantUML-Regexe, keine SVG-/Excalidraw-Felder und keine Layoutentscheidungen in Modellklassen speichern.
- Layout: Diagrammtypen mit Box/Connection-Struktur bevorzugt über ELK abbilden; zeit-, baum- oder tabellenartige Diagramme erhalten eigene deterministische Layoutmodule.
- Rendering: Renderer interpretieren nur Modell und Style-Tokens; sie sollen keine PlantUML-Syntax nachparsen.
- Style: `<style>` ist der Zielpfad; `skinparam` bleibt als Kompatibilitätsschicht erhalten und wird in dieselben Style-Tokens übersetzt.
- Text: Creole/HTML-Creole, Links, Unicode, OpenIconic und Sprites müssen an einer gemeinsamen Text-/Inline-Asset-Schicht hängen.
- Sicherheit: SVG-Ausgabe muss Text und Attribute escapen; externe Includes, Remote-Themes und Bilder dürfen nicht heimlich Netzwerk- oder Dateisystemzugriffe aus Parser/Renderer auslösen.
- Determinismus: IDs, Layout-Reihenfolge, Render-Elemente und Beispielartefakte müssen stabil bleiben.

## Modul-eigene Artefaktstruktur

Ein Diagrammtyp-Modul soll Tests, Doku, Beispiele, Fixtures und modulnahe Assets nicht nur in Manifesten referenzieren, sondern physisch in seinem Modulbereich besitzen. Die Manifeste bleiben der Index, aber die Quelle der Wahrheit liegt beim Modul.

Zielstruktur pro Diagrammtyp:

```text
src/diagrams/<kind>/
	module.mjs
	parser.mjs
	layout.mjs
	render.mjs
	plugins/
	tests/
		unit.test.mjs
		integration.test.mjs
		security.test.mjs
		fixtures/
		scenarios/
			<feature>/
				basic.puml
				edge.puml
				security.puml
		expected/
	docs/
		index.template.md.njk
		partials/
		features/
			<feature>/
				scenarios/
					basic.puml
					edge.puml
				notes.md
		assets/
	assets/
```

Generierte Review- und Coverage-Ergebnisse liegen nicht als handgepflegte Quellen im Modul, sondern in einem abgeleiteten Output-Bereich mit derselben Modul-/Feature-Struktur, zum Beispiel:

```text
docs/ressources/generated/modules/<kind>/
	puml/<feature>/*.puml
	excalidraw/<feature>/*.excalidraw
	svg/<feature>/*.svg
	png/<feature>/*.png
```

Die Main-Doku-Pipeline sammelt diese Inhalte nur ueber `ModuleDocsManifest`, `ModuleTestManifest` und einen Build-Manifest-Collector ein. Sie darf keine diagrammtypische Featureliste hartcodieren. Root-nahe Tests unter `tests/` bleiben fuer cross-module, public API, security-wide und migration-wide Gates erlaubt, sollen aber modulfachliche Assertions aus den Modul-Testmanifests importieren oder delegieren.

Weitere modul-eigene Kandidaten, die Tickets pruefen sollen:

- Security-Corpus und Fuzz-Fixtures pro Diagrammtyp.
- Performance-/Stress-Fixtures pro Diagrammtyp.
- Renderer-Golden-Erwartungen pro Format.
- Docs-Partials und Featuretabellen pro Modul.
- Modulnahe Asset-Manifeste fuer Sprites, Icons, Fonts oder Beispielressourcen.
- Migration-Notizen, wenn ein Feature aus `src/general/` oder `tests/` in das Modul zurueckwandert.

## Self-Generation und Repo-Introspection

Self-Diagramme sollen als eigenes, abgekapseltes Root-System geplant werden, nicht als lose Sonderfunktionen in `docs/scripts/`. Ziel ist ein Root-Ordner wie:

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

Collector lesen DiagramModuleRegistry, PlatformServiceRegistry, Dependency-Graph, DocsManifests, TestManifests, AssetManifests, SecurityProfiles und Source-Introspection. Fuer jedes sinnvolle Architekturthema soll spaeter ein Self-Diagramm existieren: Modulgraph, Dependency-Graph, Parser-Plugins, Render-Callflow, Docs/Test/Asset-Verantwortung, Security-Capabilities, Model-Familien und Package-Exports. `docs` und README sammeln nur die Ergebnisse aus `self/output/manifest.json` ein.

## Docs-Architektur-Cleanup

Die Doku-Struktur soll langfristig ebenfalls klare Ownership haben:

- Modul-Dokuquellen liegen beim Modul unter `src/diagrams/<kind>/docs/`.
- Repo-weite Handbuchseiten, API-Templates und README-Templates liegen in einem klaren Docs-Main-Bereich.
- Generatoren/Collectors liegen in einem Build-/Pipeline-Bereich und enthalten keine Diagramm-Fachlogik.
- Generated Outputs liegen unter einem eindeutig benannten Output-Bereich und werden nur ueber Build-Manifeste validiert.
- Der temporaere Ticket-Ordner `docs/tickets/` bleibt waehrend der Planung erhalten und wird nicht in einen Docs-Cleanup verschoben, geloescht oder umbenannt.

## Gemeinsame Dokumentation

- Neue Coverage-Dokumente sollen dem Muster der Sequenz-Coverage folgen, aber die Quelle liegt im jeweiligen Modul: Feature-Szenarien, Tests und Doku-Beispiele werden dort gemeinsam gepflegt und von der Main-Pipeline eingesammelt.
- `README.md` nicht direkt bearbeiten; falls öffentliche Dokumentation betroffen ist, `docs/README.template.md.njk` ändern und `npm run build:docs` einplanen.
- Jedes Ticket soll mindestens eine kleine, eine mittlere und eine stressende Beispielgruppe definieren.
- Beispielnamen sollen diagrammübergreifend gleichmäßig sein: `basic`, `styling`, `links`, `notes`, `nested`, `mixed`, `security`.
- Jedes Ticket muss benennen, welche Dateien aus `tests/` oder `docs/scripts/` in modul-eigene `tests/`-, `docs/`- oder `assets/`-Unterordner wandern und welche Root-Dateien bewusst cross-module bleiben.

## Gemeinsamer Validierungsloop

Für jedes Ticket gilt nach der späteren Implementierung:

1. Parser-Golden-Tests mit repräsentativen PUML-Beispielen ergänzen.
2. Modellstruktur explizit testen, nicht nur „rendert irgendetwas“.
3. Excalidraw/SVG-Output auf deterministische, semantische Eigenschaften prüfen.
4. Sicherheitsfälle für escaping, Ressourcenlimits, ReDoS und externe Referenzen ergänzen.
5. Coverage-Dokumentation und generierte Beispiele aktualisieren.
6. Relevanten lokalen Gate ausführen: `npm test`, `npm run typecheck`, `npm run format:check`; bei öffentlichen Docs zusätzlich `npm run build:docs` oder `npm run build`.

## Architekturkompatibilitätsprüfung

Diese Konvention ist kompatibel mit der aktuellen Gesamtarchitektur, weil sie Diagrammtypen als eigene Module unter `src/diagrams/` behandelt: Parser-Plugins erkennen PlantUML im Modul, Modellklassen speichern Struktur unter `src/general/model/`, Layout berechnet Geometrie, Renderer erzeugen Ausgabeformate. `src/main/` orchestriert, `src/general/` stellt wiederverwendbare Runtime bereit, und `src/util/` enthaelt Low-Level-Helfer. Querschnittsfunktionen wie Style, Creole, Links, Farben, Sprites, Themes, Subdiagramme und Preprocessing werden als gemeinsame Infrastruktur geplant, damit die einzelnen Diagrammtypen keine konkurrierenden Sonderlösungen aufbauen.

## Validierungsloop

1. Nach jeder neuen Ticketdatei prüfen, ob Ziel, Quellen, Feature-Inventar, Architekturplan, Kompatibilitätsprüfung, Validierungsloop und Akzeptanzkriterien vorhanden sind.
2. Nach jedem Ticketbatch prüfen, ob globale Querschnittsfunktionen nicht in Einzeltickets widersprüchlich beschrieben werden.
3. Am Ende die Dateiliste und Pflichtabschnitte automatisiert kontrollieren.
4. Die finale Zusammenfassung muss nennen, welche Ticketgruppen angelegt wurden und welche Validierung gelaufen ist.

## Gemeinsame Akzeptanzkriterien

- Alle offiziellen Featuregruppen des jeweiligen Diagrammtyps sind im Ticket mit PUML-Beispiel oder bewusstem Nicht-Ziel dokumentiert.
- Das Ticket beschreibt eine modul-eigene Artefaktstruktur fuer Parser, Renderer, Tests, Doku, Beispiel-Szenarien, Generated-Outputs und Assets.
- Das geplante Modell passt zur bestehenden Pipeline, ohne Renderer oder Layout mit Parserwissen zu belasten.
- Style, Skinparam, Creole, Farben, Links und Preprocessing werden nicht pro Diagramm dupliziert, sondern über gemeinsame Infrastruktur geplant.
- Das Ticket beschreibt mindestens einen Sicherheitsfall und mindestens einen deterministischen Rendervergleich.
- Offene Risiken sind sichtbar markiert, insbesondere bei PlantUML-Funktionen, die externe Ressourcen, eingebettete Diagramme oder komplexe Grammatik nutzen.

## Akzeptanzkriterien

- Alle Ticketdateien folgen demselben Grundraster.
- Jedes Ticket benennt offizielle Quellen, repräsentative PUML-Beispiele, Architekturkompatibilität und einen Validierungsloop.
- Querschnittsfeatures werden in eigenen Tickets beschrieben und in Diagrammtyp-Tickets nur referenziert oder angebunden.
