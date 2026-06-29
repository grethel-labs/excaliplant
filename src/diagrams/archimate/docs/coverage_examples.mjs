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
];
