/** @module diagrams/chen/docs/coverage_examples */
/** @public */
export const chenCoverageExamples = [
  {
    name: "basic-relationship",
    source: `@startchen
entity Person {
}
entity Location {
}
relationship Birthplace {
}
Person -N- Birthplace
Birthplace -1- Location
@endchen`,
  },
  {
    name: "direction",
    source: `@startchen
left to right direction
entity Person {
}
entity Location {
}
relationship Birthplace {
}
Person -N- Birthplace
Birthplace -1- Location
@endchen`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description: "Combines Chen entities, relationships, keys, attributes and cardinality labels.",
    source: `@startchen
left to right direction
entity Module {
  documented
}
entity Example {
  rendered
}
entity Test {
  automated
}
relationship Covers {
}
relationship Validates {
}
key ModuleName {
}
attribute ExampleSource {
}
derived_attribute SvgArtifact {
}
multi_valued_attribute EdgeCases {
}
Module -1- Covers : owns coverage examples
Covers -N- Example : includes small and complex cases
Example -N- Validates : rendered through pipeline
Validates -N- Test : asserted by module coverage test
Module - ModuleName
Example - ExampleSource
Example - SvgArtifact
Example - EdgeCases
@endchen`,
  },
];
