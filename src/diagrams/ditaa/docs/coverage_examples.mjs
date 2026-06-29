/** @module diagrams/ditaa/docs/coverage_examples */
/** @public */
export const ditaaCoverageExamples = [
  { name: "ascii-canvas", source: `@startditaa\n+---+\n| A |\n+---+\n@endditaa` },
  {
    name: "inline-options",
    source: `@startuml\nditaa(--no-shadows, scale=0.7)\n+---+\n| A |\n+---+\n@enduml`,
  },
];
