/** @module diagrams/chronology/docs/coverage_examples */
/** @public */
export const chronologyCoverageExamples = [
  {
    name: "milestones",
    source: `@startchronology
[A: Release candidate] happens on 2024-01-15 01:08:12
[B] happens on 2024-02-01
[A] -> [B]
@endchronology`,
  },
  {
    name: "ranges",
    source: `@startchronology
starts 2024-01-01
[Implementation] lasts from 2024-01-02 to 2024-01-31
@endchronology`,
  },
];
