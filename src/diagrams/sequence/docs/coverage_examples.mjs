// PlantUML sequence-diagram coverage examples shared by tests and docs.

/**
 * Renderable PlantUML examples for the sequence-diagram feature coverage page.
 * @type {readonly {id:string,title:string,description:string,source:string}[]}
 */
export const SEQUENCE_COMPONENT_EXAMPLES = Object.freeze([
  {
    id: "basics",
    title: "Basic messages",
    description:
      "Covers normal sync arrows, dashed replies, reverse-readable arrows, compact arrows without spaces, multiline message labels, and safe plain-text markup.",
    source: `@startuml
title Basic sequence messages
participant Client
participant API
Client->API: **request** <b>as plain text</b>\\nwith wrapped label
API --> Client: response
Client <- API: reverse-readable reply
@enduml
`,
  },
  {
    id: "participants",
    title: "Participant declarations",
    description:
      "Covers explicit participant kinds, aliases, colors, stereotypes, PlantUML order values, and multiline participant blocks.",
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
participant "Catalog Service" as Catalog #LightYellow order 15 [
=Catalog
Service
]
User -> First: enters system
First -> Catalog: route by catalog
Catalog -> Boundary: validate
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
A -(12)> B: slanted arrow
A "source endpoint label with useful wrapping" -> "target endpoint label with useful wrapping" B: central label uses arrowhead-safe width budgeting
[-> A: incoming from diagram edge
A ->]: outgoing to diagram edge
?-> B: short incoming
B ->?: short outgoing
& A -> B: parallel teoz-style message is accepted with simplified geometry
@enduml
`,
  },
  {
    id: "label-wrapping",
    title: "Arrow label wrapping",
    description:
      "Covers dynamic wrapping for long message labels and endpoint labels using arrow length minus arrowhead size as the available width.",
    source: `@startuml
title Arrow label wrapping
participant A
participant B
A -> B: a very long request label / with punctuation, useful-breakpoints, and enough words to wrap before it reaches the arrow tips
B "reply source endpoint label with punctuation / fallback" --> "reply target endpoint label with punctuation / fallback" A: a similarly long response label that must push all following items down
== After wrapped labels ==
A -> B: compact follow-up
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
group custom label [secondary label] #LightBlue
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
      "Covers formatted autonumber start/increment, stop/resume, title rendering, hide footbox, and supported sequence presentation skinparams.",
    source: `@startuml
skinparam sequence {
  ArrowColor #123456
  MessageFontColor #123456
  MessageAlign right
  ResponseMessageBelowArrow true
  ParticipantBackgroundColor #LightYellow
  ParticipantBorderColor #00aa00
  ParticipantFontColor #004400
  LifeLineBorderColor #0000ff
  NoteBackgroundColor #LightYellow
  NoteBorderColor #red
  NoteFontColor #blue
  GroupBackgroundColor #LightGreen
  GroupBorderColor #green
  GroupFontColor #purple
  DividerBorderColor #red
  ActivationBackgroundColor #LightBlue
  ActorStyle box
}
hide footbox
title Styled numbered flow
autonumber 10 5 "<b>[000]"
actor Alice
participant Bob
== Styled Divider ==
Alice -> Bob ++: first numbered
note right of Bob: styled note
autonumber stop
Bob -> Alice: unnumbered
autonumber resume
group styled group [secondary label]
Alice --> Bob --: numbered again
end
@enduml
`,
  },
  {
    id: "global-presentation",
    title: "Header, footer, mainframe, newpage, hide unlinked",
    description:
      "Covers global sequence decorations, single-canvas newpage rendering, hide unlinked pruning, and solid lifeline style.",
    source: `@startuml
  !pragma teoz true
header
Sequence coverage header
with a second line
endheader
footer
Sequence coverage footer
with audit marker
endfooter
mainframe Sequence coverage frame
skinparam sequence LifeLineStrategy solid
hide unlinked
title Global presentation
participant Alice
participant Bob
participant Unused
partition "single-canvas teoz partition" {
Alice -> Bob: first page message
newpage Next page marker
& Bob --> Alice: second page response
}
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
    id: "feedback-loops-assets",
    title: "Feedback loops with participant assets",
    description:
      "Covers feedback-loop traffic while rendering actor/boundary/control/entity/database/collections/queue symbols in the same sequence.",
    source: `@startuml
title Feedback loops with assets
actor User
boundary Gateway
control Orchestrator
entity Domain
database Ledger
collections Views
queue Events

loop request-response loop
  User -> Gateway: submit
  Gateway -> Orchestrator ++: dispatch
  Orchestrator -> Domain: validate
  Domain -> Ledger: write
  Ledger --> Views: project
  Views --> Events: enqueue
  Events --> Gateway: ack
  Gateway --> User --: response
end
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
 * @type {readonly {component:string,status:"supported"|"partial"|"tolerated"|"not yet",notes:string}[]}
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
    status: "supported",
    notes: "Bracket-block titles are preserved as multiline participant labels.",
  },
  {
    component: "Self messages",
    status: "supported",
    notes: "Rendered as loop arrows with wrapped labels.",
  },
  {
    component: "Message text alignment/response below arrow",
    status: "supported",
    notes: "MessageAlign and ResponseMessageBelowArrow affect wrapped label layout and rendering.",
  },
  {
    component: "Actor style skinparam",
    status: "supported",
    notes: "ActorStyle supports stick, hollow, and box rendering modes.",
  },
  {
    component: "Arrow variants and colors",
    status: "supported",
    notes:
      "Filled/open/dashed/bidirectional/circle/cross/partial/color variants are modeled and rendered.",
  },
  {
    component: "Autonumber",
    status: "supported",
    notes: "Start/increment/stop/resume plus safe plain-text {0} and zero-padding formats.",
  },
  {
    component: "Title",
    status: "supported",
    notes: "Single-line title supported and rendered topmost.",
  },
  {
    component: "Header/footer/newpage",
    status: "supported",
    notes:
      "Single-line and block header/footer render visibly; newpage renders as a single-canvas page-break divider.",
  },
  {
    component: "Combined fragments",
    status: "supported",
    notes: "opt, loop, alt/else, par/and, break, critical/option, group/option.",
  },
  {
    component: "Group secondary label and colored groups",
    status: "supported",
    notes: "Group secondary labels and explicit fragment colors render separately.",
  },
  {
    component: "Partition/teoz",
    status: "supported",
    notes:
      "Teoz pragmas, partition wrappers, and & messages parse with deterministic single-row geometry.",
  },
  {
    component: "Notes",
    status: "supported",
    notes: "left/right/over/across, block notes, colors, hnote/rnote metadata.",
  },
  {
    component: "Creole/HTML markup",
    status: "supported",
    notes: "Markup is accepted and rendered safely as plain text.",
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
    status: "supported",
    notes:
      "External/short anchors, delays, slants, and parallel markers have deterministic visual output.",
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
    status: "supported",
    notes:
      "Arrow, message, participant, lifeline, actor, note, group, divider, and activation skinparams are applied.",
  },
  {
    component: "Hide unlinked",
    status: "supported",
    notes: "Unreferenced participants are pruned during finalization.",
  },
  {
    component: "Mainframe",
    status: "supported",
    notes: "Rendered as an outer single-canvas frame.",
  },
  {
    component: "Solid lifeline style",
    status: "supported",
    notes: "LifeLineStrategy/LifeLineStyle solid switches lifelines from dashed to solid.",
  },
]);
