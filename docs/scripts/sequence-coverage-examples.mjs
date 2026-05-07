// PlantUML sequence-diagram coverage examples shared by tests and docs.

/**
 * Renderable PlantUML examples for the sequence-diagram feature coverage page.
 * @type {Array<{id:string,title:string,description:string,source:string}>}
 */
export const SEQUENCE_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "basics",
    title: "Basic messages",
    description:
      "Covers normal sync arrows, dashed replies, reverse-readable arrows, compact arrows without spaces, and multiline message labels.",
    source: `@startuml
title Basic sequence messages
participant Client
participant API
Client->API: request\\nwith wrapped label
API --> Client: response
Client <- API: reverse-readable reply
@enduml
`,
  },
  {
    id: "participants",
    title: "Participant declarations",
    description:
      "Covers explicit participant kinds, aliases, colors, stereotypes, and PlantUML order values.",
    source: `@startuml
title Participant declarations
participant Last order 30
participant Middle order 20
actor "External User" as User #LightBlue
boundary Boundary
control Control
entity Entity
database Database
collections Collection
queue Queue
participant First <<service>> #LightGreen order 10
User -> First: enters system
First -> Boundary: validate
Boundary -> Control: dispatch
Control -> Entity: load
Entity -> Database: query
Database --> Collection: rows
Collection --> Queue: enqueue
Queue --> Last: notify
@enduml
`,
  },
  {
    id: "arrow-variants",
    title: "Arrow variants and endpoints",
    description:
      "Covers open, dashed, bidirectional, circle, cross/lost, partial, colored, incoming/outgoing, and short boundary arrows.",
    source: `@startuml
title Arrow variants and endpoints
participant Alice as A
participant Bob as B
A -> B: filled head
A ->> B: open head
A -->> B: dashed open
A <-> B: bidirectional
A o->o B: circle endpoints
A x-> B: cross at start
A ->x B: lost at end
A -\\ B: partial lower head
A -/ B: partial upper head
A -[#red]> B: red arrow
[-> A: incoming from diagram edge
A ->]: outgoing to diagram edge
?-> B: short incoming
B ->?: short outgoing
@enduml
`,
  },
  {
    id: "notes",
    title: "Notes",
    description:
      "Covers side notes, over notes, colored notes, hnote/rnote variants, note across, and block notes.",
    source: `@startuml
title Notes and note variants
participant Alice
participant Bob
participant Carol
Alice -> Bob: hello
note left of Alice #aqua: side note
note over Alice, Bob #LightYellow: over two participants
hnote across: hnote across all participants
rnote over Carol
rectangle-style note
with multiple lines
endrnote
/ note over Bob: aligned-note syntax is accepted
Bob -> Carol: continue
@enduml
`,
  },
  {
    id: "fragments",
    title: "Combined fragments",
    description:
      "Covers opt, loop, alt/else, par/and, break, critical/option, group/option, nesting, operand labels, and uniform fragment margins.",
    source: `@startuml
title Combined fragments
participant Client
participant Service
participant Audit
Client -> Service: start
opt cache hit
  Service --> Client: cached result
end
loop retry up to 3 times
  Client -> Service: retry
end
alt success
  Service -> Audit: record success
else failure
  Service -> Audit: record failure
end
par primary
  Client -> Service: primary path
and secondary
  Service -> Audit: secondary path
end
break aborted
  Service --> Client: stop
end
critical commit
  Service -> Audit: commit
option rollback
  Audit --> Service: rollback
end
group custom label
  Service -> Audit: grouped
option alternative label
  Audit --> Service: alternative
end
@enduml
`,
  },
  {
    id: "timeline-decorations",
    title: "Timeline decorations",
    description:
      "Covers dividers, delays, explicit vertical spaces, and ref frames with the same top/bottom spacing rhythm as fragments.",
    source: `@startuml
title Timeline decorations
participant Alice
participant Bob
== Initialization ==
Alice -> Bob: request
... waiting for callback ...
Bob --> Alice: response
|||
ref over Alice, Bob: external contract
||45||
ref over Bob
multi-line reference
owned by Bob
end ref
== Done ==
Alice -> Bob: final message
@enduml
`,
  },
  {
    id: "lifecycle",
    title: "Lifecycle, activation, create, destroy, return",
    description:
      "Covers activate/deactivate/destroy, activation colors, create, shortcut ++/**/!! syntax, and return messages.",
    source: `@startuml
title Lifecycle and return
participant User
User -> Worker: start
activate Worker #LightBlue
Worker -> Worker ++ #DarkSalmon: nested work
return nested done
create control Job
Worker -> Job **: create job
Job --> Worker: ready
Worker -> Job !!: delete job
Worker --> User: done
deactivate Worker
@enduml
`,
  },
  {
    id: "autonumber-title-footbox-skinparam",
    title: "Autonumber, title, footbox, skinparam",
    description:
      "Covers autonumber start/increment, stop/resume, title rendering, hide footbox, and supported sequence color skinparams.",
    source: `@startuml
skinparam sequence {
  ArrowColor #123456
  ParticipantBackgroundColor #LightYellow
  ParticipantBorderColor #00aa00
  LifeLineBorderColor #0000ff
}
hide footbox
title Styled numbered flow
autonumber 10 5
participant Alice
participant Bob
Alice -> Bob: first numbered
autonumber stop
Bob -> Alice: unnumbered
autonumber resume
Alice --> Bob: numbered again
@enduml
`,
  },
  {
    id: "participant-boxes",
    title: "Participant boxes",
    description:
      "Covers PlantUML box/end box participant grouping with labels and background colors.",
    source: `@startuml
title Participant grouping boxes
box "Internal Service" #LightBlue
participant API
participant Worker
end box
box "External" #LightGreen
actor User
end box
User -> API: request
API -> Worker: delegate
Worker --> API: result
API --> User: response
@enduml
`,
  },
  {
    id: "combination-flow",
    title: "Combination: service flow",
    description:
      "End-to-end combination of participant boxes, arrows, activations, fragments, notes, refs, dividers, delays, and autonumber.",
    source: `@startuml
skinparam sequence ArrowColor #334155
title Combined service flow
autonumber
box "Application" #LightBlue
actor User
participant API
participant Worker
end box
database DB
== Request ==
User -> API ++: submit
note right of API #LightYellow: validation happens here
opt valid request
  API -> Worker ++: dispatch
  ref over Worker, DB: repository contract
  Worker -> DB: load
  ... db latency ...
  DB --> Worker: rows
  return worker done
else invalid request
  API --> User: validation error
end
API --> User --: response
@enduml
`,
  },
  {
    id: "combination-errors",
    title: "Combination: branching and cleanup",
    description:
      "Stress-style combination with nested fragments, lifecycle shortcuts, create/destroy, notes across, and external arrows.",
    source: `@startuml
title Combined branching and cleanup
participant Client
participant Gateway
participant Runtime
participant Audit
[-> Client: inbound signal
Client -> Gateway ++: call
alt normal path
  Gateway -> Runtime ++: execute
  hnote across: runtime section spans every lifeline
  loop every item
    Runtime -> Audit: audit item
  end
  return execution ok
else failed path
  Gateway -> Runtime **: create fallback
  Runtime -> Audit: failure audit
  Gateway -> Runtime !!: cleanup fallback
end
Gateway --> Client --: done
Client ->]: outbound signal
@enduml
`,
  },
]);

/**
 * PlantUML sequence-page coverage matrix. Status values are intentionally
 * conservative: "supported" means parser + renderer coverage exists here;
 * "partial" means the syntax is accepted/rendered with simplified semantics;
 * "tolerated" means the line is consumed or harmlessly ignored but not rendered
 * as a first-class visual feature yet.
 * @type {Array<{component:string,status:"supported"|"partial"|"tolerated"|"not yet",notes:string}>}
 */
export const SEQUENCE_SUPPORT_MATRIX = Object.freeze([
  {
    component: "Basic messages (->, -->, <-, <--)",
    status: "supported",
    notes: "Compact and spaced forms are parsed.",
  },
  {
    component: "Participant declarations and kinds",
    status: "supported",
    notes: "participant, actor, boundary, control, entity, database, collections, queue.",
  },
  {
    component: "Aliases, colors, stereotypes, order",
    status: "supported",
    notes: "Participant order is applied during layout.",
  },
  {
    component: "Multiline participant block ([ ... ])",
    status: "not yet",
    notes: "Not implemented as a dedicated participant-title block.",
  },
  {
    component: "Self messages",
    status: "supported",
    notes: "Rendered as loop arrows with wrapped labels.",
  },
  {
    component: "Message text alignment/response below arrow",
    status: "tolerated",
    notes: "Related skinparams are currently ignored.",
  },
  {
    component: "Actor style skinparam",
    status: "tolerated",
    notes: "Actor is rendered as a deterministic stick figure.",
  },
  {
    component: "Arrow variants and colors",
    status: "partial",
    notes:
      "Endpoint semantics are modeled; unsupported heads are approximated with closest Excalidraw heads.",
  },
  {
    component: "Autonumber",
    status: "partial",
    notes:
      "Start/increment/stop/resume supported; DecimalFormat/HTML number formatting is simplified.",
  },
  {
    component: "Title",
    status: "supported",
    notes: "Single-line title supported and rendered topmost.",
  },
  {
    component: "Header/footer/newpage",
    status: "not yet",
    notes: "Multi-page/header/footer rendering is outside the current single-canvas model.",
  },
  {
    component: "Combined fragments",
    status: "supported",
    notes: "opt, loop, alt/else, par/and, break, critical/option, group/option.",
  },
  {
    component: "Group secondary label and colored groups",
    status: "partial",
    notes: "Labels render as text; separate secondary label/color semantics are simplified.",
  },
  {
    component: "Partition/teoz",
    status: "not yet",
    notes: "Teoz parallel layout is not implemented.",
  },
  {
    component: "Notes",
    status: "supported",
    notes: "left/right/over/across, block notes, colors, hnote/rnote metadata.",
  },
  {
    component: "Creole/HTML markup",
    status: "partial",
    notes: "Text is rendered safely as plain text, not rich markup.",
  },
  {
    component: "Separators, refs, delays, spaces",
    status: "supported",
    notes: "Uniform timeline margins are applied.",
  },
  {
    component: "Activation/deactivation/destroy",
    status: "supported",
    notes: "Explicit and shortcut lifecycle markers render activation bars/destroy markers.",
  },
  {
    component: "Return",
    status: "supported",
    notes: "Return messages target the caller of the most recent activation.",
  },
  {
    component: "Create",
    status: "supported",
    notes: "create and ** lifecycle creation are modeled.",
  },
  {
    component: "Incoming/outgoing/short arrows",
    status: "supported",
    notes: "[/] and ? anchors are modeled as boundary endpoints.",
  },
  {
    component: "Anchors/duration/slanted/parallel teoz",
    status: "partial",
    notes:
      "Slant token is stored/rendered as endpoint y-offset; anchors/duration/parallel are not full teoz.",
  },
  {
    component: "Participant boxes",
    status: "supported",
    notes: "box/end box groups render behind participant heads.",
  },
  {
    component: "Hide footbox",
    status: "supported",
    notes: "hide footbox suppresses tail participant boxes.",
  },
  {
    component: "Sequence skinparams",
    status: "partial",
    notes: "Supported: arrow, participant background/border, lifeline color.",
  },
  { component: "Hide unlinked", status: "not yet", notes: "All declared participants are kept." },
  { component: "Mainframe", status: "not yet", notes: "No first-class mainframe element yet." },
  {
    component: "Solid lifeline style",
    status: "not yet",
    notes: "Current lifelines are dashed except through existing style color support.",
  },
]);
