/** @module diagrams/mindmap/docs/coverage_examples */
/** @public */
export const mindmapCoverageExamples = [
  {
    name: "orgmode",
    source: `@startmindmap
* Debian
** Ubuntu
*** Linux Mint
*** Kubuntu
@endmindmap`,
  },
  {
    name: "markdown",
    source: `@startmindmap
# root node
## first level
### second level
@endmindmap`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines markdown hierarchy, long node labels, branch balancing directives and mixed depth.",
    source: `@startmindmap
right side
# excaliplant coverage strategy
## parser plugins
### small examples per syntax rule
### strict edge case fixtures with comments and quoted labels
## layout validation
### long labels that force wrapping inside generated SVG output
### sibling branches that should keep readable separation
## documentation
### generated module coverage gallery
### repo-derived examples that change with the source tree
left side
## release confidence
### local gates
### rendered artifacts reviewed by humans and tests
@endmindmap`,
  },
];
