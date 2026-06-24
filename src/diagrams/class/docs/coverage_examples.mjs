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
  {
    id: "official-declarative-elements",
    title: "Official declarative element family",
    description:
      "Class-family declarations from the PlantUML reference, including reverse aliases and visibility prefixes.",
    source: `@startuml
hide empty members
abstract class "abstract class"
annotation annotation
class class
class class_stereo <<stereotype>>
entity entity
enum enum
interface interface
protocol protocol
struct struct
-class "private Class" as PrivateClass
class class2 as "It works this way too"
@enduml`,
  },
  {
    id: "official-class-relations",
    title: "Official class relations",
    description:
      "Undeclared class endpoints, composition, aggregation, dependencies, role labels and qualified associations.",
    source: `@startuml
Class01 <|-- Class02
Class03 *-- Class04
Class05 o-- Class06
Class07 .. Class08
Class09 -- Class10
Class11 <|.. Class12
Class13 --> Class14 : uses >
Class15 ..> Class16
Shop [customerId: long] ---> "customer\\n1" Customer
@enduml`,
  },
  {
    id: "official-members-json",
    title: "Official members and JSON display",
    description:
      "Colon member declarations, class body modifiers, member ports and JSON data in class diagrams.",
    source: `@startuml
Object <|-- ArrayList
Object : equals()
ArrayList : Object[] elementData
class Dummy {
  {static} String id
  {abstract} void methods()
  .. getters ..
  +getName()
}
class Class
object Object
json JSON {
  "fruit":"Apple",
  "size":"Large",
  "color": ["Red", "Green"]
}
Dummy::id --> JSON : serializes
@enduml`,
  },
]);
