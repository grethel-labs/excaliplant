# Ticket: Root-eigenes Self-Generation-System

## Ziel und Scope

Die Self-Diagramm-Generierung soll aus `docs/scripts` in ein eigenes Root-Subsystem wandern. Dieses System erzeugt repo-eigene Architekturdiagramme dynamisch aus Registry, Manifests, Source-Introspection und Build-Metadaten. `docs` sammelt nur noch die fertigen Self-Outputs ein.

Nicht-Ziel: neue PlantUML-Feature-Unterstützung. Dieses Ticket betrifft nur die Projekt-Selbstbeschreibung.

## Zielstruktur

```text
self/
  collectors/
    modules.mjs
    dependencies.mjs
    parser_plugins.mjs
    render_flow.mjs
    docs_tests_assets.mjs
    security_capabilities.mjs
    model_families.mjs
    package_exports.mjs
    file_tree.mjs
  diagrams/
    modules.mjs
    dependencies.mjs
    parser_plugins.mjs
    render_flow.mjs
    docs_tests_assets.mjs
    security_capabilities.mjs
    model_families.mjs
    package_exports.mjs
    file_tree.mjs
  templates/
  tests/
    collectors.test.mjs
    output_manifest.test.mjs
    dynamic_visibility.test.mjs
    security.test.mjs
  output/
    manifest.json
    puml/
    excalidraw/
    svg/
    png/
```

## Collector-Plan

- `modules`: liest DiagramModuleRegistry, PlatformServiceRegistry und Modulmanifeste.
- `dependencies`: liest deklarierte ModuleDependencies und Platform-Service-Abhaengigkeiten.
- `parser_plugins`: liest `module.parserPlugins()` und Plugin-Namen dynamisch.
- `render_flow`: beschreibt Hauptpipeline und Module-Failure-Boundaries aus Orchestrierungsmetadaten.
- `docs_tests_assets`: liest DocsManifests, TestManifests und AssetManifests.
- `security_capabilities`: liest SecurityProfiles, Capabilities und deny-by-default Regeln.
- `model_families`: liest Base/Familienmodule und Modelladapter.
- `package_exports`: liest `package.json` exports und ordnet sie Architekturbereichen zu.
- `file_tree`: erzeugt ein Projektstruktur-Self-Diagramm, spaeter vorzugsweise als Files-Diagramm.

## Output-Manifest

`self/output/manifest.json` beschreibt alle erzeugten Artefakte:

```json
{
  "version": 1,
  "diagrams": [
    {
      "id": "modules",
      "kind": "component",
      "title": "Module structure",
      "puml": "self/output/puml/modules.puml",
      "excalidraw": "self/output/excalidraw/modules.excalidraw",
      "svg": "self/output/svg/modules.svg",
      "png": "self/output/png/modules.png",
      "sourceCollector": "self/collectors/modules.mjs"
    }
  ]
}
```

Docs-Build und README/API-Templates lesen dieses Manifest. Sie kennen keine Self-Diagramm-Speziallogik.

## Migration

1. Bestehende Funktionen aus `docs/scripts/self-diagrams.mjs` in `self/collectors` und `self/diagrams` aufteilen.
2. `docs/scripts/self-diagrams.mjs` zu einem duennen Adapter machen oder entfernen, nachdem `build-docs` umgestellt ist.
3. `tests/self_introspection.test.mjs` in `self/tests/` verschieben oder daraus importieren.
4. `docs/scripts/build-docs.mjs` so anpassen, dass es Self-Outputs aus `self/output/manifest.json` einsammelt.
5. Build-Manifest um die neuen Self-Ausgabepfade erweitern.

## Test- und Sicherheitsplan

- Contract-Test: jedes registrierte Modul erscheint im Self-Modulgraph.
- Contract-Test: jedes DocsManifest/TestManifest/AssetManifest erscheint im Docs/Test/Asset-Self-Diagramm.
- Contract-Test: neue Module erfordern keine manuelle Generatorliste.
- Security-Test: Collectors lesen nur repo-kontrollierte Metadaten und keine untrusted PlantUML-Includes.
- Determinismus-Test: gleicher Repo-Stand erzeugt gleiche Self-PUML und gleiche Render-Artefakte.

## Architekturkompatibilitätsprüfung

Das Ticket ist kompatibel mit der bestehenden Doku-Pipeline, weil Self-Diagramme bereits generiert werden. Die Ownership wandert nur aus `docs/scripts` in ein eigenes Root-System. `docs` bleibt Consumer und nicht Owner.

## Validierungsloop pro Ticket

1. Einen Collector migrieren.
2. Self-Output fuer diesen Collector erzeugen.
3. Contract-Test fuer dynamische Sichtbarkeit ergaenzen.
4. Docs-Build gegen `self/output/manifest.json` laufen lassen.
5. `npm run format:check`, `npm test` und bei Docs-Aenderungen `npm run build:docs` ausfuehren.

## Akzeptanzkriterien

- `self/` existiert mit Collectors, Diagrammen, Tests und Output-Manifest.
- `docs/scripts/build-docs.mjs` besitzt keine hartcodierte Self-Diagramm-Liste mehr.
- Neue Diagrammtyp-Module erscheinen ohne Generatoranpassung in Self-Diagrammen.
- Fuer jedes sinnvolle Architekturthema gibt es einen Collector oder ein dokumentiertes Nicht-Ziel.
