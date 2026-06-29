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
];
