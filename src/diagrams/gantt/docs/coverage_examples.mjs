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
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines project starts, explicit dates, milestones, dependencies and long dependency labels.",
    source: `@startgantt
Project starts 2026-01-05
-- Repository release train --
[Audit current diagram modules] requires 4 days
[Audit current diagram modules] starts 2026-01-05
[Add small coverage examples] requires 5 days
[Add large combination examples] requires 6 days
[Render SVG documentation gallery] requires 3 days
[Release validation checkpoint] happens 2026-01-23
[Audit current diagram modules] then [Add small coverage examples] : parser fixtures are stable
[Add small coverage examples] then [Add large combination examples] : broaden edge cases
[Add large combination examples] then [Render SVG documentation gallery] : verify overlap, label fit and layout decisions
[Render SVG documentation gallery] then [Release validation checkpoint] : generated docs reviewed
@endgantt`,
  },
];
