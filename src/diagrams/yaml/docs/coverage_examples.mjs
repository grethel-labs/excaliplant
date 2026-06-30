/** @module diagrams/yaml/docs/coverage_examples */
/** @public */
export const yamlCoverageExamples = [
  {
    name: "mapping-sequence",
    source: `@startyaml
fruit: Apple
size: Large
color:
  - Red
  - Green
@endyaml`,
  },
  {
    name: "unicode-keys",
    source: `@startyaml
@fruit: Apple
$size: Large
&color: Red
❤: Heart
‰: Per mille
@endyaml`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines nested mappings, sequences, booleans, nulls and long strings for data rendering.",
    source: `@startyaml
repository: grethel-labs/excaliplant
coverage:
  generatedDocs: true
  modules:
    - kind: sequence
      profile: reference-quality
      examples:
        - small
        - complex-fragments
        - styled-lifecycle
    - kind: files
      profile: repo-derived-dynamic
      examples:
        - project-tree
        - merged-paths
        - feature-combination
  reviewNotes: Long scalar values should remain readable in the generated SVG output.
  openRisk: null
@endyaml`,
  },
];
