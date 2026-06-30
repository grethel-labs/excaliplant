/** @module diagrams/files/docs/coverage_examples */
/** @public */
export const filesCoverageExamples = [
  {
    name: "project-tree",
    source: `@startfiles
/.github
/src/example.py
/tests/example_test.py
/README.md
@endfiles`,
  },
  {
    name: "merged-paths",
    source: `@startfiles
/a/a1.txt
/b/b0.txt
/a/a2.txt
@endfiles`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines repeated folders, deep paths, generated documentation outputs and test fixtures.",
    source: `@startfiles
/src/diagrams/sequence/docs/coverage_examples.mjs
/src/diagrams/sequence/tests/sequence_components.test.mjs
/src/diagrams/component/docs/coverage_examples.mjs
/src/diagrams/component/tests/component_components.test.mjs
/src/diagrams/files/docs/coverage_examples.mjs
/docs/scripts/build-docs.mjs
/docs/scripts/build-module-coverage.mjs
/docs/module-coverage.md
/docs/ressources/module-coverage/files/svg/feature-combination.svg
/tests/module_coverage.test.mjs
/AGENTS.md
@endfiles`,
  },
];
