// Generic, input-agnostic diagram model.
//
// Two top-level model kinds are supported:
//   - Diagram          → component / deployment / use-case style
//                        (planes, subplanes, boxes, connections)
//   - SequenceDiagram  → lifelines + messages
//
// Layout and renderer dispatch on the model class.

export const SIDES = ["top", "right", "bottom", "left"];

// Logical box shapes the parser may attach to a Box. The renderer turns
// them into the corresponding Excalidraw primitives.
export const SHAPES = [
  "rectangle", "component",
  "actor", "usecase", "database", "node", "cloud",
  "interface", "entity", "class", "note",
];

export class Box {
  constructor({
    id, title, description = "",
    shape = "rectangle", stereotype = "", members = [],
  }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.shape = shape;
    this.stereotype = stereotype;     // <<service>>, <<entity>>, …
    this.members = members;           // class members (string[])
    this.parent = null;               // Plane or Subplane
    this.connections = [];            // Connection[] referencing this box on either end
    this.ports = { top: [], right: [], bottom: [], left: [] };
    this.x = 0; this.y = 0;
    this.width = 0; this.height = 0;
  }
  get plane() {
    return this.parent instanceof Plane ? this.parent : this.parent?.parent || null;
  }
  centre() { return { x: this.x + this.width / 2, y: this.y + this.height / 2 }; }
}

export class Subplane {
  constructor({ id, title, kind = "subplane" }) {
    this.id = id;
    this.title = title;
    this.kind = kind;             // subplane | frame | folder | rectangle | together
    this.parent = null;
    this.boxes = [];
    this.x = 0; this.y = 0;
    this.width = 0; this.height = 0;
  }
  addBox(box) { box.parent = this; this.boxes.push(box); return box; }
}

export class Plane {
  constructor({ id, title, color = null, kind = "package" }) {
    this.id = id;
    this.title = title;
    this.kind = kind;             // package | frame | folder | rectangle | node | together
    this.color = color;
    this.children = [];
    this.x = 0; this.y = 0;
    this.width = 0; this.height = 0;
    this.gridRow = 0; this.gridCol = 0;
  }
  addSubplane(subplane) { subplane.parent = this; this.children.push(subplane); return subplane; }
  addBox(box) { box.parent = this; this.children.push(box); return box; }
  get subplanes() { return this.children.filter((c) => c instanceof Subplane); }
  get directBoxes() { return this.children.filter((c) => c instanceof Box); }
  get allBoxes() {
    const out = [];
    for (const c of this.children) {
      if (c instanceof Box) out.push(c);
      else if (c instanceof Subplane) out.push(...c.boxes);
    }
    return out;
  }
}

// Arrowhead values map directly onto Excalidraw's start/end arrowhead
// strings: arrow | triangle | triangle_outline | diamond |
// diamond_outline | dot | bar | circle | circle_outline | null.
export class Connection {
  constructor({
    id, from, to, label = "", kind = "default", dashed = false,
    startArrowhead = null, endArrowhead = "arrow",
    directionHint = null,
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.label = label;
    this.kind = kind;             // default | inheritance | composition | aggregation | realization | dependency
    this.dashed = dashed;
    this.startArrowhead = startArrowhead;
    this.endArrowhead = endArrowhead;
    this.directionHint = directionHint;   // up|down|left|right|null
    this.fromSide = null;
    this.toSide = null;
    this.path = [];
  }
  get internal() {
    return this.from.plane && this.from.plane === this.to.plane;
  }
}

export class Diagram {
  constructor() {
    this.title = "";
    this.planes = [];
    this.connections = [];
  }
  addPlane(plane) { this.planes.push(plane); return plane; }
  addConnection(connection) {
    this.connections.push(connection);
    connection.from.connections.push(connection);
    connection.to.connections.push(connection);
    return connection;
  }
  allBoxes() { return this.planes.flatMap((p) => p.allBoxes); }
  boxById(id) {
    for (const p of this.planes) for (const b of p.allBoxes) if (b.id === id) return b;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------

export class Participant {
  constructor({ id, title, shape = "participant", stereotype = "" }) {
    this.id = id;
    this.title = title;
    this.shape = shape;            // participant | actor | boundary | control | entity | database | collections | queue
    this.stereotype = stereotype;
    this.x = 0;                    // centre x of the head
    this.headY = 0;
    this.headWidth = 0;
    this.headHeight = 0;
    this.lifelineTop = 0;
    this.lifelineBottom = 0;
  }
}

export class Message {
  constructor({
    id, from, to, label = "",
    dashed = false, kind = "sync",
    startArrowhead = null, endArrowhead = "arrow",
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.label = label;
    this.dashed = dashed;
    this.kind = kind;             // sync | async | reply | self
    this.startArrowhead = startArrowhead;
    this.endArrowhead = endArrowhead;
    this.y = 0;
  }
  get isSelf() { return this.from === this.to; }
}

export class SequenceNote {
  constructor({ id, text, side, target, target2 = null }) {
    this.id = id;
    this.text = text;
    this.side = side;              // left | right | over
    this.target = target;          // Participant
    this.target2 = target2;        // Participant or null (for "over A,B")
    this.x = 0; this.y = 0;
    this.width = 0; this.height = 0;
  }
}

export class SequenceDiagram {
  constructor() {
    this.title = "";
    this.participants = [];
    this.messages = [];
    this.notes = [];
    this.width = 0;
    this.height = 0;
  }
  addParticipant(p) { this.participants.push(p); return p; }
  addMessage(m) { this.messages.push(m); return m; }
  addNote(n) { this.notes.push(n); return n; }
  participantById(id) { return this.participants.find((p) => p.id === id) || null; }
}
