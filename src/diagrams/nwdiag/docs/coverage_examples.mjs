/** @module diagrams/nwdiag/docs/coverage_examples */
/** @public */
export const nwdiagCoverageExamples = [
  {
    name: "single-network",
    source: `@startnwdiag
nwdiag {
  network dmz {
    address = "210.x.x.x/24"
    web01 [address = "210.x.x.1"];
    web02 [address = "210.x.x.2"];
  }
}
@endnwdiag`,
  },
  {
    name: "multi-network",
    source: `@startnwdiag
nwdiag {
  network dmz {
    web01 [address = "210.x.x.1"];
  }
  network internal {
    web01 [address = "172.x.x.1"];
    db01;
  }
  web01 -- db01 : SQL
}
@endnwdiag`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines multiple networks, groups, node attributes and labelled cross-network links.",
    source: `@startnwdiag
nwdiag {
  network docs {
    address = "10.0.10.0/24"
    builder [address = "10.0.10.10", description = "docs build script"];
    gallery [address = "10.0.10.20", shape = "storage", description = "module SVG gallery"];
  }
  network tests {
    address = "10.0.20.0/24"
    runner [address = "10.0.20.10", description = "node:test coverage renderer"];
    fixtures [address = "10.0.20.30", description = "coverage_examples modules"];
  }
  group review {
    maintainer [description = "manual SVG review"];
  }
  fixtures -- runner : every example renders
  runner -- builder : shared coverage source data
  builder -- gallery : writes generated SVG and puml
  maintainer -- gallery : checks layout and label readability
}
@endnwdiag`,
  },
];
