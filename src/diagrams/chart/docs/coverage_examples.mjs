/** @module diagrams/chart/docs/coverage_examples */
/** @public */
export const chartCoverageExamples = [
  {
    name: "single-bar",
    source: `@startchart\nh-axis [Q1, Q2]\nv-axis 0 --> 100\nbar "Sales" [45, 62] #3498db\n@endchart`,
  },
  {
    name: "grouped",
    source: `@startchart\nh-axis [Q1, Q2]\nstackMode grouped\nbar "Revenue" [45, 62]\nbar "Profit" [35, 48]\n@endchart`,
  },
];
