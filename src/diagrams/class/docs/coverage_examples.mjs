/**
 * Class-diagram coverage examples owned by the class module.
 * @module diagrams/class/docs/coverage_examples
 */

/**
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 * @public
 */
export const CLASS_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "basics",
    title: "Basic classes and compartments",
    description: "Classes, attributes, operations and compartment separators.",
    source: `@startuml
class Account {
  +id: UUID
  +name: string
  --
  +save(): void
  +load(id: UUID): Account
}
@enduml`,
  },
  {
    id: "namespace-generics",
    title: "Namespace, generics and class-family keywords",
    description:
      "Namespace containers, abstract shorthand, generics, record, annotation and data-oriented class keywords.",
    source: `@startuml
namespace "Billing" as billing {
  abstract Repository<T>
  interface Serializable
  enum Status {
    ACTIVE
    DISABLED
  }
  record Money {
    +amount: Decimal
  }
  annotation Auditable
  dataclass Invoice
}
Repository <|-- Invoice
Serializable <|.. Invoice
@enduml`,
  },
  {
    id: "relationships",
    title: "Relationships and styled arrows",
    description:
      "Inheritance, realization, composition, multiplicities, labels, direction hints and styled arrows.",
    source: `@startuml
class Order
class LineItem
interface Serializable
Order "1" *-- "many" LineItem : contains
Order -[#blue,dashed]-> Serializable : serializes
LineItem -up-> Order : belongs to
@enduml`,
  },
  {
    id: "notes-on-link",
    title: "Notes on elements and links",
    description: "Member-target notes and note-on-link blocks are parsed as safe note boxes.",
    source: `@startuml
class Order {
  +fromJson(text: string): Order
}
class LineItem
Order "1" *-- "many" LineItem : contains
note on link
  contains order lines
end note
note right of Order::fromJson : parses safely
hide empty members
@enduml`,
  },
  {
    id: "association-filters",
    title: "Association classes and filters",
    description: "Association-class shorthand and remove/hide/show commands stay strict-parseable.",
    source: `@startuml
class Student
class Course
class Obsolete
(Student, Course) .. Enrollment : attends
remove Obsolete
hide empty members
show empty members
@enduml`,
  },
]);
