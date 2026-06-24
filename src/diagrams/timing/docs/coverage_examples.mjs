/**
 * Timing-diagram coverage examples owned by the timing module.
 * @module diagrams/timing/docs/coverage_examples
 */

/**
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 * @public
 */
export const TIMING_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "official-web-browser",
    title: "Concise and robust participants",
    description: "Official concise/robust example with absolute time markers and state changes.",
    source: `@startuml
robust "Web Browser" as WB
concise "Web User" as WU
@0
WU is Idle
WB is Idle
@100
WU is Waiting
WB is Processing
@300
WB is Waiting
@enduml`,
  },
  {
    id: "official-clock-binary",
    title: "Clock and binary signals",
    description: "Clock declaration, binary participant and high/low state changes.",
    source: `@startuml
clock clk with period 1
binary "Enable" as EN
@0
EN is low
@5
EN is high
@10
EN is low
@enduml`,
  },
  {
    id: "messages-constraints-notes",
    title: "Messages, constraints and notes",
    description:
      "Participant-oriented events, cross-row messages, duration constraints and row notes.",
    source: `@startuml
robust "Client" as C
robust "Server" as S
@0
C is Idle
S is Idle
@50
C is Waiting
C -> S : request
@100 <-> @200 : SLA
note top of C : retries are safe
@200
S is Done
@enduml`,
  },
  {
    id: "analog-highlight",
    title: "Analog and highlight",
    description: "Analog-style numeric values with a highlighted timing interval.",
    source: `@startuml
analog "Load" between 0 and 100 as L
@0
L is 10
@5
L is 90
@10
L is 30
highlight 2 to 8 #Gold : spike
@enduml`,
  },
]);
