/**
 * @module model
 *
 * Input-agnostic diagram model. Two top-level kinds:
 *
 * - **`Diagram`** — component / deployment / use-case style
 *   (planes, subplanes, boxes, connections).
 * - **`SequenceDiagram`** — lifelines + messages + notes.
 *
 * Layout and renderer dispatch on the model class. Anything that
 * can be expressed as one of these two shapes flows through the
 * pipeline; the parser is just one possible source. Callers can
 * also build a `Diagram` programmatically and feed it to
 * `renderDiagram()`.
 */

/**
 * Anchor sides for box ports / connection routing.
 * @public
 */
export const SIDES = ["top", "right", "bottom", "left"];

/**
 * Logical box shapes the parser may attach to a {@link Box}. The renderer
 * turns each into the corresponding Excalidraw primitive.
 * @public
 */
export const SHAPES = [
  "rectangle",
  "component",
  "actor",
  "usecase",
  "database",
  "node",
  "cloud",
  "interface",
  "entity",
  "class",
  "note",
];

/**
 * A single component-style node in the diagram model.
 *
 * Boxes carry their own geometry once the layout pass has run; before
 * layout, the geometry fields are zero.
 * @public
 */
export class Box {
  /**
   * @param {object} spec
   * @param {string} spec.id           Stable, unique identifier for routing & lookup.
   * @param {string} spec.title        Human-readable label rendered inside the box.
   * @param {string} [spec.description] Optional secondary text shown below the title.
   * @param {string} [spec.shape]      One of {@link SHAPES} — chooses the Excalidraw primitive.
   * @param {string} [spec.stereotype] PlantUML `<<tag>>` (e.g. `service`).
   * @param {string[]} [spec.members]  Class members for `class` shape (one per line).
   */
  constructor({ id, title, description = "", shape = "rectangle", stereotype = "", members = [] }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.shape = shape;
    this.stereotype = stereotype; // <<service>>, <<entity>>, …
    this.members = members; // class members (string[])
    /** @type {Plane | Subplane | null} */
    this.parent = null;
    /** @type {Connection[]} */
    this.connections = [];
    /** @type {{ top: any[], right: any[], bottom: any[], left: any[] }} */
    this.ports = { top: [], right: [], bottom: [], left: [] };
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    /**
     * Title and description after the sizing pass has wrapped them to
     * fit the box. Set by `sizeDiagram` in the layout pipeline; the
     * renderer prefers these over the raw fields when present.
     * @type {string|undefined}
     */
    this._wrappedTitle = undefined;
    /** @type {string|undefined} */
    this._wrappedDescription = undefined;
  }
  /** @returns {Plane | null} The owning plane (direct or via a {@link Subplane} parent). */
  get plane() {
    return this.parent instanceof Plane ? this.parent : this.parent?.parent || null;
  }
  /** @returns {{x:number,y:number}} The centre point of the box in absolute coords. */
  centre() {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }
}

/**
 * A nested grouping inside a {@link Plane} (e.g. PlantUML
 * `frame`, `folder`, `together`). Subplanes only contain boxes;
 * arbitrary nesting is intentionally not supported.
 * @public
 */
export class Subplane {
  /**
   * @param {object} spec
   * @param {string} spec.id    Stable identifier referenced by connections.
   * @param {string} spec.title Title shown on the subplane's header tab.
   * @param {string} [spec.kind] Visual variant: subplane | frame | folder | rectangle | together.
   */
  constructor({ id, title, kind = "subplane" }) {
    this.id = id;
    this.title = title;
    this.kind = kind; // subplane | frame | folder | rectangle | together
    /** @type {Plane | null} */
    this.parent = null;
    /** @type {Box[]} */
    this.boxes = [];
    /** @type {{ stroke: string, fill: string, titleFill: string } | null} */
    this.color = null;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }
  /**
   * Attach `box` to this subplane and back-link its parent.
   * @param {Box} box The box to add.
   * @returns {Box} The same box (for chaining).
   */
  addBox(box) {
    box.parent = this;
    this.boxes.push(box);
    return box;
  }
}

/**
 * A top-level container in a component-style {@link Diagram}
 * (PlantUML `package`, `frame`, `node` …). Holds boxes and
 * subplanes.
 * @public
 */
export class Plane {
  /**
   * @param {object} spec
   * @param {string} spec.id    Stable identifier (PlantUML alias or generated slug).
   * @param {string} spec.title Title shown on the plane's header tab.
   * @param {{ stroke: string, fill: string, titleFill: string } | null} [spec.color] Pre-computed colour triple, or `null` to derive on demand.
   * @param {string} [spec.kind] Visual variant: package | frame | folder | rectangle | node | together.
   */
  constructor({ id, title, color = null, kind = "package" }) {
    this.id = id;
    this.title = title;
    this.kind = kind; // package | frame | folder | rectangle | node | together
    this.color = color;
    /** @type {Array<Box | Subplane>} */
    this.children = [];
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.gridRow = 0;
    this.gridCol = 0;
  }
  /**
   * Attach a {@link Subplane} as a child of this plane.
   * @param {Subplane} subplane The subplane to add.
   * @returns {Subplane} The same subplane (for chaining).
   */
  addSubplane(subplane) {
    subplane.parent = this;
    this.children.push(subplane);
    return subplane;
  }
  /**
   * Attach a {@link Box} directly as a child (bypassing any subplane).
   * @param {Box} box The box to add.
   * @returns {Box} The same box (for chaining).
   */
  addBox(box) {
    box.parent = this;
    this.children.push(box);
    return box;
  }
  /** @returns {Subplane[]} All direct subplane children, in declaration order. */
  get subplanes() {
    return /** @type {Subplane[]} */ (this.children.filter((c) => c instanceof Subplane));
  }
  /** @returns {Box[]} Boxes attached directly to this plane (no subplane). */
  get directBoxes() {
    return /** @type {Box[]} */ (this.children.filter((c) => c instanceof Box));
  }
  /** @returns {Box[]} Every box, flattened across direct children and subplanes. */
  get allBoxes() {
    /** @type {Box[]} */
    const out = [];
    for (const c of this.children) {
      if (c instanceof Box) out.push(c);
      else if (c instanceof Subplane) out.push(...c.boxes);
    }
    return out;
  }
}

/**
 * Directed connection between two {@link Box}es.
 *
 * Arrowhead values map directly onto Excalidraw's start/end
 * arrowhead strings: `arrow | triangle | triangle_outline | diamond |
 * diamond_outline | dot | bar | circle | circle_outline | null`.
 * @public
 */
export class Connection {
  /**
   * @param {object} spec
   * @param {string} spec.id            Unique connection identifier.
   * @param {Box} spec.from             Source box (arrow tail).
   * @param {Box} spec.to               Target box (arrow head).
   * @param {string} [spec.label]       Optional edge label.
   * @param {string} [spec.kind]        default | inheritance | composition | aggregation | realization | dependency.
   * @param {boolean} [spec.dashed]     Render as a dashed line.
   * @param {string|null} [spec.startArrowhead] Excalidraw arrowhead at the source side.
   * @param {string|null} [spec.endArrowhead]   Excalidraw arrowhead at the target side.
   * @param {string|null} [spec.directionHint]  Layout hint: up | down | left | right.
   */
  constructor({
    id,
    from,
    to,
    label = "",
    kind = "default",
    dashed = false,
    startArrowhead = null,
    endArrowhead = "arrow",
    directionHint = null,
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.label = label;
    this.kind = kind; // default | inheritance | composition | aggregation | realization | dependency
    this.dashed = dashed;
    /** @type {string|null} */
    this.startArrowhead = startArrowhead;
    /** @type {string|null} */
    this.endArrowhead = endArrowhead;
    /** @type {string|null} */
    this.directionHint = directionHint; // up|down|left|right|null
    /** @type {string|null} */
    this.fromSide = null;
    /** @type {string|null} */
    this.toSide = null;
    /** @type {Array<{x:number,y:number}>} */
    this.path = [];
  }
  /** @returns {boolean} `true` when both endpoints sit in the same plane. */
  get internal() {
    return this.from.plane !== null && this.from.plane === this.to.plane;
  }
}

/**
 * Component / deployment / use-case style diagram. Top-level container
 * for {@link Plane}s and inter-plane {@link Connection}s.
 * @public
 */
export class Diagram {
  constructor() {
    this.title = "";
    /** @type {Plane[]} */
    this.planes = [];
    /** @type {Connection[]} */
    this.connections = [];
  }
  /**
   * Register a top-level plane.
   * @param {Plane} plane The plane to add.
   * @returns {Plane} The same plane (for chaining).
   */
  addPlane(plane) {
    this.planes.push(plane);
    return plane;
  }
  /**
   * Register a connection and back-link it from both endpoint boxes.
   * @param {Connection} connection The connection to add.
   * @returns {Connection} The same connection (for chaining).
   */
  addConnection(connection) {
    this.connections.push(connection);
    connection.from.connections.push(connection);
    connection.to.connections.push(connection);
    return connection;
  }
  /** @returns {Box[]} Every box across every plane (and its subplanes). */
  allBoxes() {
    return this.planes.flatMap((p) => p.allBoxes);
  }
  /**
   * Look up a box by its stable id.
   * @param {string} id The box id to search for.
   * @returns {Box | null} The box, or `null` if no plane contains it.
   */
  boxById(id) {
    for (const p of this.planes) for (const b of p.allBoxes) if (b.id === id) return b;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sequence diagrams
// ---------------------------------------------------------------------------

/**
 * One lifeline in a {@link SequenceDiagram}.
 * @public
 */
export class Participant {
  /**
   * @param {object} spec
   * @param {string} spec.id    Stable lifeline identifier (PlantUML alias).
   * @param {string} spec.title Display name above the lifeline head.
   * @param {string} [spec.shape] participant | actor | boundary | control | entity | database | collections | queue.
   * @param {string} [spec.stereotype] Optional PlantUML `<<tag>>`.
   */
  constructor({ id, title, shape = "participant", stereotype = "" }) {
    this.id = id;
    this.title = title;
    this.shape = shape; // participant | actor | boundary | control | entity | database | collections | queue
    this.stereotype = stereotype;
    this.x = 0; // centre x of the head
    this.headY = 0;
    this.headWidth = 0;
    this.headHeight = 0;
    this.lifelineTop = 0;
    this.lifelineBottom = 0;
  }
}

/**
 * A message arrow exchanged between two {@link Participant}s.
 * @public
 */
export class Message {
  /**
   * @param {object} spec
   * @param {string} spec.id          Unique message identifier.
   * @param {Participant} spec.from   Sender lifeline.
   * @param {Participant} spec.to     Receiver lifeline.
   * @param {string} [spec.label]     Message text rendered above the arrow.
   * @param {boolean} [spec.dashed]   Render as a dashed line.
   * @param {string} [spec.kind]      sync | async | reply | self.
   * @param {string|null} [spec.startArrowhead] Excalidraw arrowhead at the sender side.
   * @param {string|null} [spec.endArrowhead]   Excalidraw arrowhead at the receiver side.
   */
  constructor({
    id,
    from,
    to,
    label = "",
    dashed = false,
    kind = "sync",
    startArrowhead = null,
    endArrowhead = "arrow",
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.label = label;
    this.dashed = dashed;
    this.kind = kind; // sync | async | reply | self
    this.startArrowhead = startArrowhead;
    this.endArrowhead = endArrowhead;
    this.y = 0;
  }
  /** @returns {boolean} `true` when sender and receiver are the same lifeline. */
  get isSelf() {
    return this.from === this.to;
  }
}

/**
 * Free-form note attached to one or two {@link Participant}s in a
 * {@link SequenceDiagram}.
 * @public
 */
export class SequenceNote {
  /**
   * @param {object} spec
   * @param {string} spec.id            Unique note identifier.
   * @param {string} spec.text          Note body (may contain `\n`).
   * @param {string} spec.side          Anchor side: left | right | over.
   * @param {Participant} spec.target   Primary attached lifeline.
   * @param {Participant|null} [spec.target2] Second lifeline for `over A,B` ranges.
   */
  constructor({ id, text, side, target, target2 = null }) {
    this.id = id;
    this.text = text;
    this.side = side; // left | right | over
    this.target = target; // Participant
    this.target2 = target2; // Participant or null (for "over A,B")
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }
}

/**
 * Sequence diagram model: lifelines, messages and notes laid out on
 * a vertical time axis.
 * @public
 */
export class SequenceDiagram {
  constructor() {
    this.title = "";
    /** @type {Participant[]} */
    this.participants = [];
    /** @type {Message[]} */
    this.messages = [];
    /** @type {SequenceNote[]} */
    this.notes = [];
    this.width = 0;
    this.height = 0;
  }
  /**
   * Register a lifeline.
   * @param {Participant} p Lifeline to add.
   * @returns {Participant} The same lifeline (for chaining).
   */
  addParticipant(p) {
    this.participants.push(p);
    return p;
  }
  /**
   * Register a message arrow.
   * @param {Message} m Message to add.
   * @returns {Message} The same message (for chaining).
   */
  addMessage(m) {
    this.messages.push(m);
    return m;
  }
  /**
   * Register a free-form note.
   * @param {SequenceNote} n Note to add.
   * @returns {SequenceNote} The same note (for chaining).
   */
  addNote(n) {
    this.notes.push(n);
    return n;
  }
  /**
   * Look up a lifeline by id.
   * @param {string} id Participant id to look up.
   * @returns {Participant | null} The lifeline, or `null` when missing.
   */
  participantById(id) {
    return this.participants.find((p) => p.id === id) || null;
  }
}
