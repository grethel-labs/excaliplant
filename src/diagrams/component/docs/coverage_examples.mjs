/**
 * Component-diagram coverage examples owned by the component module.
 * @module diagrams/component/docs/coverage_examples
 */

/**
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 * @public
 */
export const COMPONENT_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "basics",
    title: "Basic components and interfaces",
    description:
      "Bracket components, keyword components, lollipop shorthand, queue and artifact declarations.",
    source: `@startuml
[SPA] as spa
component "API Gateway" as api
() "HTTP" as HTTP
queue "Jobs" as jobs
artifact "Client SDK" as sdk
spa --> api : calls
api ..> HTTP : exposes
api --> jobs : publishes
sdk --> api : imports
@enduml`,
  },
  {
    id: "containers",
    title: "Containers and direction",
    description: "Package, node, frame, folder and global graph direction hints.",
    source: `@startuml
left to right direction
package "Frontend" as frontend {
  [SPA] as spa
}
node "Runtime" as runtime {
  component "API" as api
  database Cache
}
frame "External" as external {
  cloud CDN
}
spa --> api : calls
api -[#blue,dashed]-> Cache : reads
api -right-> CDN : fetches
@enduml`,
  },
  {
    id: "ports",
    title: "Ports and component endpoint references",
    description: "portin/portout declarations plus Component::port endpoint references.",
    source: `@startuml
component "API Gateway" as api
[SPA] as spa
queue "Events" as bus
portin api::http
portout api::events
spa --> api::http : calls
api::events -[#blue,dashed]-> bus : publishes
@enduml`,
  },
  {
    id: "notes-on-link",
    title: "Notes on component links",
    description: "Component note-on-link blocks are rendered as safe note boxes.",
    source: `@startuml
component "API" as api
database Cache
api --> Cache : reads
note on link
  retry policy with [[https://example.invalid docs]]
end note
note right of api : public entry point
@enduml`,
  },
  {
    id: "presentation-hidden",
    title: "Presentation metadata and hidden edges",
    description:
      "Caption/header/footer/legend/mainframe/allowmixing commands parse, and hidden arrows do not render visible edges.",
    source: `@startuml
title Component landscape
caption Runtime view
header Internal
footer Confidential
mainframe Component frame
allowmixing
legend
  Hidden edge keeps layout intent only.
end legend
component "API" as api
database Cache
api -[hidden]-> Cache
api --> Cache : reads
@enduml`,
  },
  {
    id: "official-components-relations",
    title: "Official components and basic relations",
    description:
      "Official bracket declarations, keyword declarations, multiline labels and optional interface endpoints.",
    source: `@startuml
[First component]
[Another component] as Comp2
component Comp3
component [Last\\ncomponent] as Comp4

DataAccess - [First component]
[First component] ..> HTTP : use
@enduml`,
  },
  {
    id: "official-json-ports",
    title: "Official JSON display and ports",
    description: "JSON data display plus port, portin and portout declarations.",
    source: `@startuml
allowmixing
component Component
() Interface
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
component C {
  port p1
  portin p2
  portout p3
  component c1
}
C --> p1
p1 --> c1
p3 --> Interface
@enduml`,
  },
]);
