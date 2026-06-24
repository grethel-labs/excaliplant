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
];
