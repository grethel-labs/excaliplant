/** @module diagrams/regex/docs/coverage_examples */
/** @public */
export const regexCoverageExamples = [
  {
    name: "literals-and-classes",
    source: `@startregex
title Regex literals and classes
\\d\\w\\s|[0-9]\\Qfoo\\E
@endregex`,
  },
  {
    name: "groups-and-repetition",
    source: `@startregex
title Regex groups and repetition
^(ab?)+|(?<word>\\p{L}{1,3})$
@endregex`,
  },
];
