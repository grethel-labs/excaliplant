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
  "queue",
  "node",
  "cloud",
  "interface",
  "entity",
  "class",
  "enum",
  "object",
  "map",
  "diamond",
  "note",
  "state",
  "start",
  "end",
  "choice",
  "fork",
  "join",
  "history",
  "history_deep",
];

/**
 * Generic arrow endpoint head kinds. These are model-level semantics;
 * renderers map them to native primitives or generated SVG marker shapes.
 * @public
 */
export const ARROW_HEADS = [
  "none",
  "filled",
  "open",
  "circle",
  "cross",
  "partialTop",
  "partialBottom",
  "triangleOutline",
  "diamond",
  "diamondOutline",
  "dot",
  "bar",
];

/**
 * Generic arrow endpoint anchors. Component diagrams use `node`/`port`,
 * sequence diagrams use `participant`, and boundary arrows use diagram/short
 * anchors.
 * @public
 */
export const ARROW_ANCHORS = [
  "node",
  "port",
  "point",
  "participant",
  "diagramLeft",
  "diagramRight",
  "shortLeft",
  "shortRight",
];

/**
 * Generic arrow direction semantics.
 * @public
 */
export const ARROW_DIRECTIONS = [
  "right",
  "left",
  "bidirectional",
  "self",
  "incoming",
  "outgoing",
  "orthogonal",
];

/**
 * Generic arrow line styles.
 * @public
 */
export const ARROW_LINE_STYLES = ["solid", "dashed", "dotted"];

/** Sequence-arrow endpoint head kinds. @public */
export const SEQUENCE_ARROW_HEADS = ARROW_HEADS;

/** Sequence-arrow endpoint anchors. @public */
export const SEQUENCE_ARROW_ANCHORS = ARROW_ANCHORS.filter((anchor) => anchor !== "node");

/** Sequence-arrow direction semantics. @public */
export const SEQUENCE_ARROW_DIRECTIONS = ARROW_DIRECTIONS.filter(
  (direction) => direction !== "orthogonal",
);

/** Sequence-arrow line styles. @public */
export const SEQUENCE_ARROW_LINE_STYLES = ARROW_LINE_STYLES.filter((style) => style !== "dotted");

/** Default visual endpoint glyph size in px. @public */
export const DEFAULT_ARROW_HEAD_SIZE = 20;

/**
 * One endpoint of a reusable diagram arrow.
 * @public
 */
export class ArrowEndpoint {
  /**
   * @param {object} [spec]
   * @param {string} [spec.head] Model-level head kind.
   * @param {string} [spec.anchor] node | port | point | participant | diagramLeft | diagramRight | shortLeft | shortRight.
   * @param {string|null} [spec.excalidrawArrowhead] Closest Excalidraw arrowhead primitive.
   * @param {string} [spec.label] Optional text rendered near this endpoint.
   * @param {number} [spec.size] Visual endpoint glyph size in px.
   * @param {string} [spec.direction] Direction hint used by renderers.
   */
  constructor({
    head = "none",
    anchor = "node",
    excalidrawArrowhead = null,
    label = "",
    size = DEFAULT_ARROW_HEAD_SIZE,
    direction = "auto",
  } = {}) {
    this.head = head;
    this.anchor = anchor;
    /** @type {string|null} */
    this.excalidrawArrowhead = excalidrawArrowhead;
    this.label = label;
    this.size = size;
    this.direction = direction;
    this.wrappedLabel = label;
    this.labelWidth = 0;
    this.labelHeight = 0;
    this.labelFontSize = 0;
  }
}

/**
 * Reusable visual line segment for arrows.
 * @public
 */
export class ArrowLine {
  /**
   * @param {object} [spec]
   * @param {string} [spec.style] solid | dashed | dotted.
   * @param {string} [spec.color] Optional line colour token.
   * @param {number} [spec.slant] Optional y-offset for slanted sequence arrows.
   * @param {string} [spec.route] straight | orthogonal | polyline.
   * @param {Array<{x:number,y:number}>} [spec.points] Routed points for non-sequence diagrams.
   */
  constructor({ style = "solid", color = "", slant = 0, route = "straight", points = [] } = {}) {
    this.style = style;
    this.color = color;
    this.slant = slant;
    this.route = route;
    /** @type {Array<{x:number,y:number}>} */
    this.points = points;
  }
  /** @returns {boolean} `true` when the line should render dashed. */
  get dashed() {
    return this.style === "dashed" || this.style === "dotted";
  }
}

/**
 * Label attached to an arrow line or endpoint.
 * @public
 */
export class ArrowLabel {
  /**
   * @param {object} [spec]
   * @param {string} [spec.text] Display text.
   * @param {string} [spec.placement] center | start | end | segment.
   * @param {number|null} [spec.segmentIndex] Routed segment index for component/class diagrams.
   */
  constructor({ text = "", placement = "center", segmentIndex = null } = {}) {
    this.text = text;
    this.placement = placement;
    /** @type {number|null} */
    this.segmentIndex = segmentIndex;
    this.wrappedText = text;
    this.width = 0;
    this.height = 0;
    this.fontSize = 0;
  }
}

/**
 * Diagram-agnostic arrow: start endpoint, line, end endpoint, plus labels.
 * @public
 */
export class DiagramArrow {
  /**
   * @param {object} [spec]
   * @param {ArrowEndpoint|object} [spec.start] Start endpoint.
   * @param {ArrowEndpoint|object} [spec.end] End endpoint.
   * @param {ArrowLine|object} [spec.line] Line properties.
   * @param {Array<ArrowLabel|object>} [spec.labels] Line labels.
   * @param {string} [spec.source] Original source token.
   * @param {string} [spec.direction] Direction semantics.
   */
  constructor({
    start = {},
    end = {},
    line = {},
    labels = [],
    source = "",
    direction = "right",
  } = {}) {
    this.start = start instanceof ArrowEndpoint ? start : new ArrowEndpoint(start);
    this.end = end instanceof ArrowEndpoint ? end : new ArrowEndpoint(end);
    this.line = line instanceof ArrowLine ? line : new ArrowLine(line);
    this.labels = labels.map((label) =>
      label instanceof ArrowLabel ? label : new ArrowLabel(label),
    );
    this.source = source;
    this.direction = direction;
  }
}

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
    /**
     * Auto-shrunk font sizes computed by the sizing pass when a long
     * unbreakable token would otherwise overflow the box. Defaults to
     * the active style's `font.sizeTitle` / `font.sizeDescription`.
     * @type {number|undefined}
     */
    this._wrappedTitleFontSize = undefined;
    /** @type {number|undefined} */
    this._wrappedDescriptionFontSize = undefined;
    /**
     * Per-member wrapped lines computed by the sizing pass for class /
     * interface / enum boxes. Each entry corresponds to one logical
     * member from `box.members` and contains 1+ visual lines that
     * already fit inside the box width. Used by the renderer to draw
     * long method signatures across multiple lines instead of letting
     * them bleed past the right edge.
     * @type {string[][]|undefined}
     */
    this._wrappedMembers = undefined;
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
   * @param {string} [spec.fromMul] Multiplicity label rendered next to the source endpoint.
   * @param {string} [spec.toMul]   Multiplicity label rendered next to the target endpoint.
   * @param {DiagramArrow|object|null} [spec.arrow] Structured reusable arrow model.
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
    fromMul = "",
    toMul = "",
    arrow = null,
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.label = label;
    this.kind = kind; // default | inheritance | composition | aggregation | realization | dependency
    this.dashed = dashed;
    this.arrow =
      arrow instanceof DiagramArrow
        ? arrow
        : new DiagramArrow({
            start: {
              head: arrowHeadKindFromExcalidraw(startArrowhead),
              anchor: "node",
              excalidrawArrowhead: startArrowhead,
              label: fromMul,
            },
            end: {
              head: arrowHeadKindFromExcalidraw(endArrowhead),
              anchor: "node",
              excalidrawArrowhead: endArrowhead,
              label: toMul,
            },
            line: { style: dashed ? "dashed" : "solid", route: "orthogonal" },
            labels: label ? [{ text: label, placement: "center" }] : [],
            direction: directionHint || "orthogonal",
          });
    /** @type {string|null} */
    this.startArrowhead = this.arrow.start.excalidrawArrowhead;
    /** @type {string|null} */
    this.endArrowhead = this.arrow.end.excalidrawArrowhead;
    /** @type {string|null} */
    this.directionHint = directionHint; // up|down|left|right|null
    /**
     * Multiplicity label rendered next to the source endpoint (e.g. `1`).
     * Empty when no multiplicity was declared.
     * @type {string}
     */
    this.fromMul = fromMul;
    /**
     * Multiplicity label rendered next to the target endpoint (e.g. `0..*`).
     * Empty when no multiplicity was declared.
     * @type {string}
     */
    this.toMul = toMul;
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
 * Convert Excalidraw arrowhead names into generic model head kinds.
 * @param {string|null|undefined} arrowhead Excalidraw arrowhead name.
 * @returns {string} Generic model head kind.
 */
function arrowHeadKindFromExcalidraw(arrowhead) {
  switch (arrowhead) {
    case "arrow":
      return "open";
    case "triangle":
      return "filled";
    case "triangle_outline":
      return "triangleOutline";
    case "diamond":
      return "diamond";
    case "diamond_outline":
      return "diamondOutline";
    case "circle":
    case "circle_outline":
      return "circle";
    case "dot":
      return "dot";
    case "bar":
      return "bar";
    default:
      return "none";
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
    /** @type {boolean} Whether `hide empty members` was requested by graph syntax. */
    this.hideEmptyMembers = false;
    /** @type {string} Optional ELK direction override such as RIGHT or DOWN. */
    this.layoutDirection = "";
    /** @type {string} Optional graph caption metadata. */
    this.caption = "";
    /** @type {string} Optional graph header metadata. */
    this.header = "";
    /** @type {string} Optional graph footer metadata. */
    this.footer = "";
    /** @type {string} Optional graph legend metadata. */
    this.legend = "";
    /** @type {string} Optional graph mainframe metadata. */
    this.mainframe = "";
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
   * @param {string} [spec.color] Optional PlantUML colour token.
   * @param {number|null} [spec.order] Optional PlantUML `order` value.
   */
  constructor({ id, title, shape = "participant", stereotype = "", color = "", order = null }) {
    this.id = id;
    this.title = title;
    this.shape = shape; // participant | actor | boundary | control | entity | database | collections | queue
    this.stereotype = stereotype;
    this.color = color;
    /** @type {number|null} Optional explicit PlantUML participant order. */
    this.order = order;
    this.x = 0; // centre x of the head
    this.headY = 0;
    this.headWidth = 0;
    this.headHeight = 0;
    this.lifelineTop = 0;
    this.lifelineBottom = 0;
    /** @type {number|null} Declaration index where this lifeline is created, or `null` for top-level participants. */
    this.createdSeq = null;
    /** @type {number|null} Declaration index where this lifeline is destroyed, or `null` when it reaches the tail. */
    this.destroyedSeq = null;
    /** Rendered y-coordinate of the destroy marker, assigned by layout. */
    this.destroyY = 0;
    /** @type {string|null} Optional participant group id from `box ... end box`. */
    this.groupId = null;
  }
}

/**
 * One endpoint of a sequence message arrow.
 * @public
 */
export class SequenceArrowEndpoint extends ArrowEndpoint {
  /**
   * @param {object} [spec]
   * @param {string} [spec.head] PlantUML-level head kind: none | filled | open | circle | cross | partialTop | partialBottom.
   * @param {string} [spec.anchor] participant | diagramLeft | diagramRight | shortLeft | shortRight.
   * @param {string|null} [spec.excalidrawArrowhead] Closest Excalidraw arrowhead primitive.
   * @param {string} [spec.label] Optional text rendered above this arrow tip.
   * @param {number} [spec.size] Visual head size in px.
   */
  constructor(spec = {}) {
    super({ anchor: "participant", ...spec });
  }
}

/**
 * Visual line segment of a sequence message arrow.
 * @public
 */
export class SequenceArrowLine extends ArrowLine {
  /**
   * @param {object} [spec]
   * @param {string} [spec.style] solid | dashed.
   * @param {string} [spec.color] Optional PlantUML arrow colour token.
   * @param {number} [spec.slant] Optional PlantUML slanted-arrow offset.
   */
  constructor(spec = {}) {
    super({ route: "straight", ...spec });
  }
}

/**
 * Object-oriented representation of a PlantUML sequence message arrow:
 * start endpoint, line segment, and end endpoint.
 * @public
 */
export class SequenceArrow extends DiagramArrow {
  /**
   * @param {object} [spec]
   * @param {SequenceArrowEndpoint|object} [spec.start] Start endpoint.
   * @param {SequenceArrowEndpoint|object} [spec.end] End endpoint.
   * @param {SequenceArrowLine|object} [spec.line] Line properties.
   * @param {string} [spec.source] Original PlantUML arrow token.
   * @param {string} [spec.direction] right | left | bidirectional | self | incoming | outgoing.
   */
  constructor({ start = {}, end = {}, line = {}, source = "", direction = "right" } = {}) {
    super({
      start: start instanceof SequenceArrowEndpoint ? start : new SequenceArrowEndpoint(start),
      end: end instanceof SequenceArrowEndpoint ? end : new SequenceArrowEndpoint(end),
      line: line instanceof SequenceArrowLine ? line : new SequenceArrowLine(line),
      source,
      direction,
    });
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
   * @param {SequenceArrow|object|null} [spec.arrow] Structured arrow semantics.
   * @param {string} [spec.color] Optional PlantUML arrow colour token.
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
    arrow = null,
    color = "",
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.label = label;
    this.arrow =
      arrow instanceof SequenceArrow
        ? arrow
        : new SequenceArrow({
            start: { excalidrawArrowhead: startArrowhead },
            end: { excalidrawArrowhead: endArrowhead },
            line: { style: dashed ? "dashed" : "solid", color },
          });
    this.dashed = this.arrow.line.dashed;
    this.kind = kind; // sync | async | reply | self
    this.startArrowhead = this.arrow.start.excalidrawArrowhead;
    this.endArrowhead = this.arrow.end.excalidrawArrowhead;
    this.color = this.arrow.line.color;
    /** Optional autonumber prefix rendered with the label. */
    this.number = "";
    /** Whether this message creates the receiver lifeline (`**`). */
    this.creates = false;
    /** Whether this message destroys a lifeline (`!!`). */
    this.destroys = false;
    /** Inline lifecycle marker: ++ | -- | ** | !! | "". */
    this.lifecycle = "";
    /** Whether this message was declared with PlantUML teoz parallel `&` syntax. */
    this.parallel = false;
    this.y = 0;
    /** Absolute start x coordinate assigned by sequence layout. */
    this.startX = 0;
    /** Absolute end x coordinate assigned by sequence layout. */
    this.endX = 0;
    /** Label text after layout-time wrapping. */
    this.wrappedLabel = label;
    /** Width of the wrapped label text box. */
    this.labelWidth = 0;
    /** Height of the wrapped label text box. */
    this.labelHeight = 0;
    /** Maximum height reserved above the arrow for all label types. */
    this.labelBandHeight = 0;
    /** Maximum height reserved below the arrow for response-below labels. */
    this.labelBelowHeight = 0;
    /** Font size chosen for the wrapped label. */
    this.labelFontSize = 0;
    /** Declaration order index across messages + notes. */
    this.seq = -1;
  }
  /** @returns {boolean} `true` when sender and receiver are the same lifeline. */
  get isSelf() {
    return (
      this.from === this.to &&
      this.arrow.start.anchor === "participant" &&
      this.arrow.end.anchor === "participant"
    );
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
   * @param {string} [spec.shape] note | hnote | rnote.
   * @param {string} [spec.color] Optional PlantUML note colour token.
   */
  constructor({ id, text, side, target, target2 = null, shape = "note", color = "" }) {
    this.id = id;
    this.text = text;
    this.side = side; // left | right | over
    this.target = target; // Participant
    this.target2 = target2; // Participant or null (for "over A,B")
    this.shape = shape;
    this.color = color;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    /** Declaration order index across messages + notes. */
    this.seq = -1;
  }
}

/**
 * Combined fragment in a sequence diagram (`opt`, `loop`, `alt`, `par`,
 * `break`, `critical`, `group`). A fragment owns one or more operands;
 * each operand spans a declaration-order range on the sequence timeline.
 * @public
 */
export class SequenceFragment {
  /**
   * @param {object} spec
   * @param {string} spec.id Unique fragment identifier.
   * @param {string} spec.kind Fragment operator: opt | loop | alt | par | break | critical | group.
   * @param {string} [spec.label] Header/guard text for the first operand.
   * @param {string} [spec.secondaryLabel] Optional PlantUML group secondary label.
   * @param {string} [spec.color] Optional PlantUML fragment/group colour.
   * @param {{label:string,startSeq:number,endSeq:number,y?:number}[]} [spec.operands]
   *   Operand ranges in declaration-order indices.
   */
  constructor({ id, kind, label = "", secondaryLabel = "", color = "", operands = [] }) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.secondaryLabel = secondaryLabel;
    this.color = color;
    this.operands = operands;
    this.startSeq = operands[0]?.startSeq ?? -1;
    this.endSeq = operands[operands.length - 1]?.endSeq ?? this.startSeq;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }
}

/**
 * Activation bar on a participant lifeline.
 * @public
 */
export class SequenceActivation {
  /**
   * @param {object} spec
   * @param {string} spec.id Unique activation identifier.
   * @param {Participant} spec.participant Activated lifeline.
   * @param {number} spec.startSeq Declaration index where activation starts.
   * @param {number} [spec.endSeq] Declaration index where activation ends.
   * @param {string} [spec.color] Optional PlantUML activation colour.
   * @param {number} [spec.depth] Stack depth for nested activations.
   * @param {-1|0|1} [spec.side] Horizontal stacking side: -1 left, 0 centered, 1 right.
   * @param {-1|1} [spec.nestSide] Preferred side for nested self-calls spawned inside this activation.
   * @param {Participant|null} [spec.caller] Lifeline that caused this activation, used by PlantUML `return`.
   */
  constructor({
    id,
    participant,
    startSeq,
    endSeq = startSeq,
    color = "",
    depth = 0,
    side = 0,
    nestSide = 1,
    caller = null,
  }) {
    this.id = id;
    this.participant = participant;
    this.startSeq = startSeq;
    this.endSeq = endSeq;
    this.color = color;
    this.depth = depth;
    this.side = side;
    this.nestSide = nestSide;
    /** @type {Participant|null} */
    this.caller = caller;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }
}

/**
 * Timeline marker such as dividers (`== label ==`), delays (`...`), and vertical spacers.
 * @public
 */
export class SequenceMarker {
  /**
   * @param {object} spec
   * @param {string} spec.id Unique marker identifier.
   * @param {string} spec.kind divider | delay | space.
   * @param {string} [spec.label] Optional marker text.
   * @param {number} [spec.size] Requested vertical size for space markers.
   */
  constructor({ id, kind, label = "", size = 0 }) {
    this.id = id;
    this.kind = kind;
    this.label = label;
    this.size = size;
    this.seq = -1;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }
}

/**
 * `ref over ...` reference frame in a sequence diagram.
 * @public
 */
export class SequenceReference {
  /**
   * @param {object} spec
   * @param {string} spec.id Unique reference identifier.
   * @param {string} spec.label Reference text.
   * @param {Participant} spec.target Primary lifeline.
   * @param {Participant|null} [spec.target2] Optional second lifeline.
   */
  constructor({ id, label, target, target2 = null }) {
    this.id = id;
    this.label = label;
    this.target = target;
    this.target2 = target2;
    this.seq = -1;
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.wrappedLabel = label;
  }
}

/**
 * Participant grouping box declared with PlantUML `box ... end box`.
 * @public
 */
export class SequenceParticipantGroup {
  /**
   * @param {object} spec
   * @param {string} spec.id Unique group identifier.
   * @param {string} [spec.label] Group label.
   * @param {string} [spec.color] Optional PlantUML colour token.
   */
  constructor({ id, label = "", color = "" }) {
    this.id = id;
    this.label = label;
    this.color = color;
    /** @type {Participant[]} */
    this.participants = [];
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }
}

/**
 * Sequence diagram model: lifelines, messages, notes, fragments and
 * other timeline decorations laid out on a vertical time axis.
 * @public
 */
export class SequenceDiagram {
  constructor() {
    this.title = "";
    this.header = "";
    this.footer = "";
    this.mainframe = "";
    /** @type {Participant[]} */
    this.participants = [];
    /** @type {Message[]} */
    this.messages = [];
    /** @type {SequenceNote[]} */
    this.notes = [];
    /** @type {SequenceFragment[]} */
    this.fragments = [];
    /** @type {SequenceActivation[]} */
    this.activations = [];
    /** @type {SequenceMarker[]} */
    this.markers = [];
    /** @type {SequenceReference[]} */
    this.references = [];
    /** @type {SequenceParticipantGroup[]} */
    this.participantGroups = [];
    this.showFootbox = true;
    /**
     * Parsed sequence-level style hints from supported `skinparam sequence`
     * colours. Empty strings mean renderer defaults should be used.
     * @type {{arrowColor:string,messageFontColor:string,messageAlign:string,responseMessageBelowArrow:string,participantBackgroundColor:string,participantBorderColor:string,participantFontColor:string,lifelineColor:string,lifelineStyle:string,actorStyle:string,noteBackgroundColor:string,noteBorderColor:string,noteFontColor:string,groupBackgroundColor:string,groupBorderColor:string,groupFontColor:string,dividerColor:string,activationColor:string}}
     */
    this.style = {
      arrowColor: "",
      messageFontColor: "",
      messageAlign: "center",
      responseMessageBelowArrow: "false",
      participantBackgroundColor: "",
      participantBorderColor: "",
      participantFontColor: "",
      lifelineColor: "",
      lifelineStyle: "dashed",
      actorStyle: "stick",
      noteBackgroundColor: "",
      noteBorderColor: "",
      noteFontColor: "",
      groupBackgroundColor: "",
      groupBorderColor: "",
      groupFontColor: "",
      dividerColor: "",
      activationColor: "",
    };
    this.hideUnlinked = false;
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
   * Register a combined sequence fragment.
   * @param {SequenceFragment} f Fragment to add.
   * @returns {SequenceFragment} The same fragment (for chaining).
   */
  addFragment(f) {
    this.fragments.push(f);
    return f;
  }
  /**
   * Register an activation bar.
   * @param {SequenceActivation} a Activation to add.
   * @returns {SequenceActivation} The same activation.
   */
  addActivation(a) {
    this.activations.push(a);
    return a;
  }
  /**
   * Register a sequence marker.
   * @param {SequenceMarker} m Marker to add.
   * @returns {SequenceMarker} The same marker.
   */
  addMarker(m) {
    this.markers.push(m);
    return m;
  }
  /**
   * Register a reference frame.
   * @param {SequenceReference} r Reference to add.
   * @returns {SequenceReference} The same reference.
   */
  addReference(r) {
    this.references.push(r);
    return r;
  }
  /**
   * Register a participant group.
   * @param {SequenceParticipantGroup} g Group to add.
   * @returns {SequenceParticipantGroup} The same group.
   */
  addParticipantGroup(g) {
    this.participantGroups.push(g);
    return g;
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
