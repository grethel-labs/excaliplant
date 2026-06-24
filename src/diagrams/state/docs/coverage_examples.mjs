/**
 * State-diagram coverage examples owned by the state module.
 * @module diagrams/state/docs/coverage_examples
 */

/**
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 * @public
 */
export const STATE_COVERAGE_EXAMPLES = Object.freeze([
  {
    id: "official-simple-transitions",
    title: "Simple states and descriptions",
    description:
      "Start/end pseudostates, state descriptions and basic transitions from the PlantUML state reference.",
    source: `@startuml
[*] --> State1
State1 --> [*]
State1 : this is a string
State1 : this is another string
State1 -> State2
State2 --> [*]
@enduml`,
  },
  {
    id: "official-composite-state",
    title: "Composite states",
    description:
      "Nested state blocks, scale directives and inner transitions inside a composite state.",
    source: `@startuml
scale 350 width
[*] --> NotShooting
state NotShooting {
  [*] --> Idle
  Idle --> Configuring : EvConfig
  Configuring --> Idle : EvConfig
}
@enduml`,
  },
  {
    id: "pseudostates",
    title: "Pseudostates",
    description:
      "Choice, fork, join and shallow/deep history pseudostates declared through PlantUML stereotypes.",
    source: `@startuml
state choice1 <<choice>>
state fork1 <<fork>>
state join1 <<join>>
state h <<history>>
state hd <<history*>>
[*] --> choice1
choice1 --> fork1 : yes
fork1 --> StateA
fork1 --> StateB
StateA --> join1
StateB --> join1
join1 --> [*]
@enduml`,
  },
  {
    id: "concurrent-regions",
    title: "Concurrent regions",
    description: "Orthogonal region separators inside composite states remain strict-parseable.",
    source: `@startuml
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn
  --
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn
}
@enduml`,
  },
  {
    id: "notes-json-style",
    title: "Notes, JSON and colours",
    description:
      "State colours, nested declarations, safe notes and JSON display blocks mixed with transitions.",
    source: `@startuml
state CurrentSite #pink {
  state HardwareSetup #lightblue
}
note right of CurrentSite : composite <b>note</b>
json JSON {
  "fruit":"Apple",
  "size":"Large"
}
CurrentSite --> JSON : exports
@enduml`,
  },
]);
