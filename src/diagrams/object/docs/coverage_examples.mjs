/**
 * Object-diagram coverage examples owned by the object module.
 * @module diagrams/object/docs/coverage_examples
 */

/**
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 * @public
 */
export const OBJECT_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "objects-fields",
    title: "Objects and fields",
    description: "Object declarations, aliases, body fields and colon field syntax.",
    source: `@startobject
object user {
  name = "Dummy"
  id = 123
}
object "Session Token" as session
session : value = "abc"
user --> session : owns
@endobject`,
  },
  {
    id: "maps-anchors",
    title: "Maps and row anchors",
    description: "Map rows, row anchors and class-like relationships between objects.",
    source: `@startobject
map CapitalCity {
  UK => London
  USA => Washington
}
object Traveler
Traveler --> CapitalCity::UK : visits
@endobject`,
  },
  {
    id: "diamond-relationships",
    title: "Diamonds and relationships",
    description: "Object diagrams share class-style relationship operators and diamonds.",
    source: `@startobject
object Order
object LineItem
diamond Aggregation
Order *-- LineItem : contains
Order --> Aggregation
@endobject`,
  },
  {
    id: "official-definition-relations",
    title: "Official object definitions and relations",
    description:
      "Object declarations, aliases, undeclared relationship endpoints, multiplicities and labels.",
    source: `@startuml
object firstObject
object "My Second Object" as o2
object Object01
object Object02
object Object03
object Object04

Object01 <|-- Object02
Object03 *-- Object04
Object05 o-- "4" Object06
Object07 .. Object08 : some labels
@enduml`,
  },
  {
    id: "official-associated-objects",
    title: "Associated objects",
    description: "Diamond association object pattern from the PlantUML object reference.",
    source: `@startuml
object o1
object o2
diamond dia
object o3
o1 --> dia
o2 --> dia
dia --> o3
@enduml`,
  },
  {
    id: "official-map-table",
    title: "Map table and associative arrays",
    description: "Map aliases, associative rows, row-to-object links and Map::row references.",
    source: `@startuml
object London
object Washington
object Berlin
object NewYork
map "Map **Country => CapitalCity**" as CapitalCity {
  UK *-> London
  USA *--> Washington
  Germany *---> Berlin
}
NewYork --> CapitalCity::USA
@enduml`,
  },
  {
    id: "official-pert-json",
    title: "PERT maps and JSON display",
    description: "PERT-style empty maps, directional object links and JSON display blocks.",
    source: `@startuml
left to right direction
title PERT: Project Name
map Kick.Off {
}
map task.1 {
  Start => End
}
map task.2 {
  Start => End
}
Kick.Off --> task.1 : Label 1
Kick.Off --> task.2 : Label 2
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
@enduml`,
  },
]);
