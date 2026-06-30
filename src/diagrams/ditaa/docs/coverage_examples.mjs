/** @module diagrams/ditaa/docs/coverage_examples */
/** @public */
export const ditaaCoverageExamples = [
  { name: "ascii-canvas", source: `@startditaa\n+---+\n| A |\n+---+\n@endditaa` },
  {
    name: "inline-options",
    source: `@startuml\nditaa(--no-shadows, scale=0.7)\n+---+\n| A |\n+---+\n@enduml`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines inline options, dense ASCII layout, labels and arrow-like connectors in one rendered box.",
    source: `@startuml
ditaa(--no-shadows, scale=0.8)
+-------------------+       +-----------------------+
| Parser examples   | ----> | Shared coverage data  |
| small fixtures    |       | small + wild cases    |
+-------------------+       +-----------+-----------+
                                        |
                                        v
+-------------------+       +-----------------------+
| SVG gallery       | <---- | module_coverage.test  |
| generated docs    |       | render every example  |
+-------------------+       +-----------------------+
@enduml`,
  },
];
