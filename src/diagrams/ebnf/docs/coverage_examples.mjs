/** @module diagrams/ebnf/docs/coverage_examples */
/** @public */
export const ebnfCoverageExamples = [
  {
    name: "binary-digit",
    source: `@startebnf
binaryDigit = "0" | "1";
@endebnf`,
  },
  {
    name: "all-elements",
    source: `@startebnf
title EBNF elements
litteral = "a";
special = ? a ?;
optional = [a];
zero_or_more = {a};
group = (a | b), c;
@endebnf`,
  },
];
