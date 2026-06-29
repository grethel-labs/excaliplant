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
];
