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
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines a title with a multiline formula and descriptive variables that force text wrapping.",
    source: `@startmath
title Coverage score formula
coverage_score =
  (small_examples + large_examples + rendered_svg_checks) /
  max(1, supported_features + documented_design_decisions)
@endmath`,
  },
];
