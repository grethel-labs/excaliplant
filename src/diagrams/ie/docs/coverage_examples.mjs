/** @module diagrams/ie/docs/coverage_examples */
/** @public */
export const ieCoverageExamples = [
  {
    name: "crow-foot-relationships",
    source: `@startuml
Entität01 }|..|| Entität02
Entität03 }o..o| Entität04
Entität05 ||--o{ Entität06
Entität07 |o--|| Entität08
@enduml`,
  },
  {
    name: "entity-attributes",
    source: `@startuml
entity Entität01 {
  * identifizierendes_attribut
  --
  * vorgeschriebenes_attribut
  optionales_attribut
}
@enduml`,
  },
  {
    name: "feature-combination",
    title: "Feature combination",
    description:
      "Combines IE entities, attributes, dashed and solid crow-foot relationships and long labels.",
    source: `@startuml
entity Customer {
  * customer_id
  --
  * email
  support_tier
}
entity Order {
  * order_id
  --
  * placed_at
  status
}
entity Invoice {
  * invoice_id
  --
  total_amount
}
entity SupportTicket {
  * ticket_id
  --
  severity
}
Customer ||--o{ Order : places many orders over time
Order ||--|| Invoice : produces billing record
Customer }o..o{ SupportTicket : may open optional support cases with long label
SupportTicket }|..|| Order : can reference one order
@enduml`,
  },
];
