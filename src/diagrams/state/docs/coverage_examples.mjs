/**
 * State diagram coverage examples.
 * @module diagrams/state/docs/coverage_examples
 */

/** @public */
export const STATE_COVERAGE_EXAMPLES = {
  "simple-states": `
@startuml
[*] --> State1
State1 : this is a string
State1 --> State2 : event / action
State2 --> [*]
hide empty description
@enduml
`,

  pseudostates: `
@startuml
state start1 <<start>>
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
@enduml
`,

  "composite-states": `
@startuml
state Active {
  [*] --> Idle
  Idle --> Configuring : EvConfig
  state Configuring {
    [*] --> NewValue
  }
}
Active --> [*]
@enduml
`,

  "concurrent-regions": `
@startuml
state Active {
  [*] -> NumLockOff
  NumLockOff --> NumLockOn
  --
  [*] -> CapsLockOff
  CapsLockOff --> CapsLockOn
}
@enduml
`,

  transitions: `
@startuml
State1 -[#red,dashed]-> State2
State2 x->o State3
State3 --> State4 : event [guard] / action
@enduml
`,

  notes: `
@startuml
state CurrentSite #pink {
  state HardwareSetup #lightblue
}
note right of CurrentSite : composite note
@enduml
`,
};
