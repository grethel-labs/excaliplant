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
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines terminals, non-terminals, alternatives, optional groups and repetitions in one grammar.",
    source: `@startebnf
title Coverage example grammar
diagram = start, { statement }, end;
start = "@start", ("uml" | "json" | "yaml" | "mindmap");
statement = element | connection | note | style;
element = identifier, [alias], [stereotype];
connection = identifier, arrow, identifier, [ ":" , label ];
label = ? long human readable text that must stay inside the rendered node ?;
style = "skinparam", identifier, value;
end = "@end";
@endebnf`,
  },
];
