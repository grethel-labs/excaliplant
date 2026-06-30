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
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines axes, options, bars, lines, areas, scatter series, colours and uneven value ranges.",
    source: `@startchart
title "Coverage health across modules"
h-axis [parser, model, layout, svg, docs]
v-axis 0 --> 100
legend right
grid true
annotation "Complex examples include overlap and label-fit decisions"
stackMode grouped
bar "Small fixtures" [90, 80, 75, 70, 85] #2c7fb8
line "Wild combinations" [40, 55, 65, 78, 92] #f03b20
area "Generated docs" [20, 35, 55, 80, 95] #31a354
scatter "Manual review points" [15, 60, 45, 88, 73] #756bb1
@endchart`,
  },
];
