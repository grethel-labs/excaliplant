/** @module diagrams/math/docs/coverage_examples */
/** @public */
export const mathCoverageExamples = [
  {
    name: "standalone-asciimath",
    source: `@startmath
f(t)=(a_0)/2 + sum_(n=1)^oo a_n cos((n pi t)/L)
@endmath`,
  },
  {
    name: "standalone-latex",
    source: `@startlatex
\\sum_{i=0}^{n-1} (a_i + b_i^2)
@endlatex`,
  },
];
