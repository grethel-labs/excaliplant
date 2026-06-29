/** @module diagrams/gantt/docs/coverage_examples */
/** @public */
export const ganttCoverageExamples = [
  {
    name: "durations",
    source: `@startgantt\n[Prototype design] requires 15 days\n[Test prototype] requires 10 days\n@endgantt`,
  },
  {
    name: "dated-starts",
    source: `@startgantt\nProject starts 2020-07-01\n[Prototype design] requires 15 days\n[Prototype design] starts 2020-07-01\n@endgantt`,
  },
];
