/** @module diagrams/archimate/docs/coverage_examples */
/** @public */
export const archimateCoverageExamples = [
  {
    name: "elements",
    source: `@startuml
archimate #Technology "VPN Server" as vpnServerA <<technology-device>>
rectangle GO #lightgreen
rectangle STOP #red
@enduml`,
  },
  {
    name: "junctions",
    source: `@startuml
Junction_And JunctionAnd
Junction_Or JunctionOr
archimate #Technology "VPN Server" as vpnServerA <<technology-device>>
GO -up-> JunctionOr
STOP -down-> JunctionAnd
@enduml`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines ArchiMate elements, technology stereotypes, junctions, rectangles and labelled flows.",
    source: `@startuml
archimate #Business "Documentation Reader" as reader <<business-actor>>
archimate #Application "excaliplant API" as api <<application-component>>
archimate #Technology "SVG Renderer" as svgRenderer <<technology-service>>
archimate #Technology "Generated Docs Site" as docsSite <<technology-artifact>>
rectangle ManualReview #lightgreen
rectangle ReleaseBlocked #red
Junction_And CoverageGate
Junction_Or DecisionPoint
reader --> api : submits PlantUML example
api --> svgRenderer : parses, lays out and renders
svgRenderer --> CoverageGate : emits SVG artifact with long label
CoverageGate --> ManualReview : examples are readable
CoverageGate --> DecisionPoint : issues found
DecisionPoint --> ReleaseBlocked : overlap or clipped text
DecisionPoint --> docsSite : publish gallery
@enduml`,
  },
];
