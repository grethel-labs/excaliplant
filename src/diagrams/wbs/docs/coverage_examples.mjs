/** @module diagrams/wbs/docs/coverage_examples */
/** @public */
export const wbsCoverageExamples = [
  {
    name: "orgmode",
    source: `@startwbs
* Business Process Modelling WBS
** Launch the project
*** Complete Stakeholder Research
@endwbs`,
  },
  {
    name: "arithmetic",
    source: `@startwbs
+ New Job
++ Decide on Job Requirements
+++ Identity gaps
@endwbs`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines plus and star hierarchy styles with long work-package labels and uneven depth.",
    source: `@startwbs
left direction
* Diagram module quality gate
** Small focused fixtures
*** Parser acceptance examples
*** Renderer smoke SVGs
** Large integration fixtures
*** Edge labels, nested containers and dense sibling groups
*** Wild combinations that document deliberate design decisions
+ Dynamic documentation
++ Repo-derived file coverage diagram
++ Generated SVG gallery linked from README
+ Release readiness
++ Test every coverage example through renderPlantUml
+++ Keep generated docs in the build manifest
@endwbs`,
  },
];
