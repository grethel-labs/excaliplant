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
]);
