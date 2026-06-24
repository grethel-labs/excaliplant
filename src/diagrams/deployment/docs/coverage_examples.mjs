// PlantUML deployment-diagram coverage examples shared by tests and docs.

/**
 * Renderable PlantUML examples for the deployment-diagram feature coverage page.
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 */
export const DEPLOYMENT_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "basic-node",
    title: "Basic node declaration",
    description: "Covers simple node declaration with alias.",
    source: `@startuml
node "Server" as srv
@enduml`,
  },
  {
    id: "nested-containers",
    title: "Nested containers",
    description: "Covers nested deployment containers like node, cloud, frame.",
    source: `@startuml
node "Kubernetes" {
  cloud "Namespace" {
    frame "Pod" {
      [API]
    }
  }
}
@enduml`,
  },
  {
    id: "all-shapes",
    title: "All deployment shapes",
    description: "Covers all 23 deployment-specific shapes.",
    source: `@startuml
actor User
agent Monitor
artifact "app.jar"
cloud AWS
database DB
file "config.yml"
folder "/src"
node Server
queue Queue
@enduml`,
  },
  {
    id: "ports",
    title: "Port declarations",
    description: "Covers port declarations and references with Node::port syntax.",
    source: `@startuml
node Server
[Proxy]
Server --> Proxy
@enduml`,
  },
  {
    id: "arrow-styles",
    title: "Arrow styles",
    description: "Covers various arrow styles including styled arrows.",
    source: `@startuml
node A
node B
A --> B
A ..> B
A --* B
A -[#red,dashed]-> B : styled
@enduml`,
  },
  {
    id: "json-mixing",
    title: "JSON mixing",
    description: "Covers mixing deployment elements with JSON data structures (allowmixing).",
    source: `@startuml
allowmixing
node Runtime
[Metadata] : "region: eu-central-1"
Runtime --> Metadata
@enduml`,
  },
  {
    id: "official-elements",
    title: "Official deployment elements",
    description:
      "Official deployment element declarations across actor, agent, artifact, cloud, database, folder, frame, node, package, queue, rectangle, stack and storage.",
    source: `@startuml
actor actor
agent agent
artifact artifact
cloud cloud
component component
database database
folder folder
frame frame
node node
package package
queue queue
rectangle rectangle
stack stack
storage storage
@enduml`,
  },
  {
    id: "official-long-descriptions",
    title: "Official long descriptions",
    description: "Bracketed long descriptions for deployment elements.",
    source: `@startuml
folder folder [
This is a <b>folder
----
You can use separator
====
of different kind
]

node node [
This is a <b>node
----
You can use separator
]
@enduml`,
  },
  {
    id: "official-json",
    title: "Official JSON display",
    description: "JSON data display mixed with deployment elements.",
    source: `@startuml
allowmixing
node Runtime
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
Runtime --> JSON
@enduml`,
  },
]);
