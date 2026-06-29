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
];
