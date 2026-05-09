// Mutable parsing context for sequence diagrams.

import {
  Participant,
  Message,
  SequenceDiagram,
  SequenceNote,
  SequenceFragment,
  SequenceActivation,
  SequenceMarker,
  SequenceReference,
  SequenceParticipantGroup,
  SequenceArrow,
} from "../../general/model/diagram.mjs";

/**
 * Construct the mutable parsing context shared by all sequence-diagram
 * plugins during a single `parsePlantUml` invocation.
 *
 * @returns {{
 *   readonly result: import("../../general/model/diagram.mjs").SequenceDiagram,
 *   diagram:         import("../../general/model/diagram.mjs").SequenceDiagram,
 *   setTitle(t: string): void,
 *   setHeader(t: string): void,
 *   setFooter(t: string): void,
 *   setMainframe(t: string): void,
 *   ensureParticipant(id: string): import("../../general/model/diagram.mjs").Participant,
 *   declareParticipant(spec: object): import("../../general/model/diagram.mjs").Participant,
 *   nextMessageId(): string,
 *   nextNoteId(): string,
 *   nextFragmentId(): string,
 *   nextActivationId(): string,
 *   nextMarkerId(): string,
 *   nextReferenceId(): string,
 *   nextParticipantGroupId(): string,
 *   currentSeq(): number,
 *   lastSeq(): number,
 *   addMessage(spec: object): import("../../general/model/diagram.mjs").Message,
 *   addNote(spec: object): void,
 *   addMarker(kind: string, label?: string, size?: number): void,
 *   addReference(spec: object): void,
 *   startFragment(kind: string, label?: string, secondaryLabel?: string, color?: string): void,
 *   splitFragmentOperand(label?: string): boolean,
 *   endFragment(): boolean,
 *   startActivation(participant: import("../../general/model/diagram.mjs").Participant, color?: string, seq?: number, caller?: import("../../general/model/diagram.mjs").Participant|null): void,
 *   endActivation(participant: import("../../general/model/diagram.mjs").Participant, seq?: number): boolean,
 *   addReturnMessage(label?: string): boolean,
 *   markCreated(participant: import("../../general/model/diagram.mjs").Participant, seq?: number): void,
 *   markDestroyed(participant: import("../../general/model/diagram.mjs").Participant, seq?: number): void,
 *   setAutonumber(enabled: boolean, start?: number, step?: number, format?: string): void,
 *   setAutoactivate(enabled: boolean): void,
 *   applyAutoactivation(message: import("../../general/model/diagram.mjs").Message, lifecycle?: string): void,
 *   setSequenceStyle(key: keyof import("../../general/model/diagram.mjs").SequenceDiagram["style"], value: string): void,
 *   setFootboxVisible(visible: boolean): void,
 *   setHideUnlinked(visible: boolean): void,
 *   startParticipantGroup(label?: string, color?: string): void,
 *   endParticipantGroup(): boolean,
 * }}
 * @public
 */
export function createSequenceContext() {
  const diagram = new SequenceDiagram();
  let messageCounter = 0;
  let noteCounter = 0;
  let fragmentCounter = 0;
  let activationCounter = 0;
  let markerCounter = 0;
  let referenceCounter = 0;
  let participantGroupCounter = 0;
  let timelineCounter = 0;
  let autonumberEnabled = false;
  let autonumberNext = 1;
  let autonumberStep = 1;
  let autonumberFormat = "";
  let autoactivateEnabled = false;
  /** @type {SequenceFragment[]} */
  const fragmentStack = [];
  /** @type {Map<string, SequenceActivation[]>} */
  const activationStacks = new Map();
  /** @type {SequenceParticipantGroup[]} */
  const participantGroupStack = [];
  /** @type {Message|null} */
  let lastMessage = null;

  /** @param {SequenceFragment} fragment */
  const closeCurrentOperand = (fragment) => {
    const current = fragment.operands[fragment.operands.length - 1];
    if (current) current.endSeq = timelineCounter;
    fragment.endSeq = timelineCounter;
  };

  const ctx = {
    get result() {
      return diagram;
    },
    diagram,

    /**
     * Set the diagram's title (from a top-level `title` line).
     * @param {string} t Raw title text.
     */
    setTitle(/** @type {string} */ t) {
      diagram.title = t;
    },
    /** @param {string} t Header text. */
    setHeader(/** @type {string} */ t) {
      diagram.header = t;
    },
    /** @param {string} t Footer text. */
    setFooter(/** @type {string} */ t) {
      diagram.footer = t;
    },
    /** @param {string} t Mainframe label. */
    setMainframe(/** @type {string} */ t) {
      diagram.mainframe = t;
    },

    /**
     * Look up an existing participant or create one with the bare id
     * as title (PlantUML's implicit-declaration behaviour).
     * @param {string} id Participant alias from the source.
     * @returns {Participant} Existing or freshly-created lifeline.
     */
    ensureParticipant(/** @type {string} */ id) {
      let p = diagram.participantById(id);
      if (!p) {
        p = new Participant({ id, title: id });
        diagram.addParticipant(p);
        attachToCurrentParticipantGroup(p);
      }
      return p;
    },

    /**
     * Explicitly declare a participant (`participant Foo as f`).
     * @param {{id:string,title:string,shape?:string,stereotype?:string,color?:string,order?:number|null}} spec Participant specification.
     * @returns {Participant} The created or existing lifeline.
     */
    declareParticipant(
      /** @type {{id:string,title:string,shape?:string,stereotype?:string,color?:string,order?:number|null}} */ {
        id,
        title,
        shape = "participant",
        stereotype = "",
        color = "",
        order = null,
      },
    ) {
      const existing = diagram.participantById(id);
      if (existing) {
        existing.title = title || existing.title;
        existing.shape = shape || existing.shape;
        existing.stereotype = stereotype || existing.stereotype;
        existing.color = color || existing.color;
        if (order !== null) existing.order = order;
        return existing;
      }
      const p = new Participant({ id, title, shape, stereotype, color, order });
      diagram.addParticipant(p);
      attachToCurrentParticipantGroup(p);
      return p;
    },

    /** @returns {string} Fresh unique message id. */
    nextMessageId() {
      return `seq_${messageCounter++}`;
    },
    /** @returns {string} Fresh unique note id. */
    nextNoteId() {
      return `seqnote_${noteCounter++}`;
    },
    /** @returns {string} Fresh unique fragment id. */
    nextFragmentId() {
      return `seqfrag_${fragmentCounter++}`;
    },
    /** @returns {string} Fresh unique activation id. */
    nextActivationId() {
      return `seqact_${activationCounter++}`;
    },
    /** @returns {string} Fresh unique marker id. */
    nextMarkerId() {
      return `seqmark_${markerCounter++}`;
    },
    /** @returns {string} Fresh unique reference id. */
    nextReferenceId() {
      return `seqref_${referenceCounter++}`;
    },
    /** @returns {string} Fresh unique participant group id. */
    nextParticipantGroupId() {
      return `seqgroup_${participantGroupCounter++}`;
    },
    /** @returns {number} Current declaration-order timeline index. */
    currentSeq() {
      return timelineCounter;
    },
    /** @returns {number} Most recent declaration-order timeline index. */
    lastSeq() {
      return Math.max(0, timelineCounter - 1);
    },

    /**
     * Append a new message to the diagram (id is auto-assigned).
     * @param {any} spec Plugin-built message record (without id).
     */
    addMessage(/** @type {any} */ spec) {
      const msg = new Message({ id: ctx.nextMessageId(), ...spec });
      if (autonumberEnabled) {
        msg.number = formatAutonumber(autonumberNext, autonumberFormat);
        autonumberNext += autonumberStep;
      }
      msg.seq = timelineCounter++;
      diagram.addMessage(msg);
      lastMessage = msg;
      return msg;
    },
    /**
     * Append a new note to the diagram (id is auto-assigned).
     * @param {any} spec Plugin-built note record (without id).
     */
    addNote(/** @type {any} */ spec) {
      const note = new SequenceNote({ id: ctx.nextNoteId(), ...spec });
      note.seq = timelineCounter++;
      diagram.addNote(note);
    },
    /**
     * Append a visual timeline marker.
     * @param {string} kind divider | delay | space.
     * @param {string} [label] Marker text.
     * @param {number} [size] Optional vertical size.
     */
    addMarker(
      /** @type {string} */ kind,
      /** @type {string} */ label = "",
      /** @type {number} */ size = 0,
    ) {
      const marker = new SequenceMarker({ id: ctx.nextMarkerId(), kind, label, size });
      marker.seq = timelineCounter++;
      diagram.addMarker(marker);
    },
    /**
     * Append a `ref over` frame to the timeline.
     * @param {{label:string,target:import("../../general/model/diagram.mjs").Participant,target2?:import("../../general/model/diagram.mjs").Participant|null}} spec
     */
    addReference(/** @type {any} */ spec) {
      const ref = new SequenceReference({ id: ctx.nextReferenceId(), ...spec });
      ref.seq = timelineCounter++;
      diagram.addReference(ref);
    },
    /**
     * Open a combined sequence fragment at the current timeline index.
     * @param {string} kind Fragment operator.
     * @param {string} [label] First operand label / guard.
     * @param {string} [secondaryLabel] Optional PlantUML group secondary label.
     * @param {string} [color] Optional PlantUML fragment/group colour.
     */
    startFragment(
      /** @type {string} */ kind,
      /** @type {string} */ label = "",
      /** @type {string} */ secondaryLabel = "",
      /** @type {string} */ color = "",
    ) {
      const fragment = new SequenceFragment({
        id: ctx.nextFragmentId(),
        kind,
        label,
        secondaryLabel,
        color,
        operands: [{ label, startSeq: timelineCounter, endSeq: timelineCounter }],
      });
      diagram.addFragment(fragment);
      fragmentStack.push(fragment);
    },
    /**
     * Start a new operand on the currently open fragment (`else`).
     * @param {string} [label] Operand label / guard.
     * @returns {boolean} Whether an open fragment existed.
     */
    splitFragmentOperand(/** @type {string} */ label = "") {
      const fragment = fragmentStack[fragmentStack.length - 1];
      if (!fragment) return false;
      closeCurrentOperand(fragment);
      fragment.operands.push({ label, startSeq: timelineCounter, endSeq: timelineCounter });
      return true;
    },
    /** @returns {boolean} Whether an open fragment was closed. */
    endFragment() {
      const fragment = fragmentStack.pop();
      if (!fragment) return false;
      closeCurrentOperand(fragment);
      return true;
    },
    /**
     * Start an activation bar on a lifeline.
     * @param {import("../../general/model/diagram.mjs").Participant} participant
     * @param {string} [color]
     * @param {number} [seq]
     * @param {import("../../general/model/diagram.mjs").Participant|null} [caller]
     */
    startActivation(participant, color = "", seq = timelineCounter, caller = null) {
      const stack = activationStacks.get(participant.id) ?? [];
      const activation = new SequenceActivation({
        id: ctx.nextActivationId(),
        participant,
        startSeq: Math.max(0, seq),
        color,
        depth: stack.length,
        caller:
          caller ||
          (lastMessage && lastMessage.to === participant && lastMessage.from !== participant
            ? lastMessage.from
            : null),
      });
      stack.push(activation);
      activationStacks.set(participant.id, stack);
      diagram.addActivation(activation);
    },
    /**
     * End the most recent activation on a lifeline.
     * @param {import("../../general/model/diagram.mjs").Participant} participant
     * @param {number} [seq]
     * @returns {boolean} Whether an activation was open.
     */
    endActivation(participant, seq = timelineCounter) {
      const stack = activationStacks.get(participant.id);
      const activation = stack?.pop();
      if (!activation) return false;
      activation.endSeq = Math.max(activation.startSeq, seq);
      return true;
    },
    /** Add a reply message from the most recent activation to its caller. */
    addReturnMessage(label = "") {
      const open = [...activationStacks.values()]
        .map((stack) => stack[stack.length - 1])
        .filter(Boolean)
        .sort((a, b) => (b?.startSeq ?? -1) - (a?.startSeq ?? -1))[0];
      if (!open?.caller) return false;
      const arrow = new SequenceArrow({
        source: "return",
        direction: open.participant === open.caller ? "self" : "left",
        end: { head: "filled", excalidrawArrowhead: "triangle" },
        line: { style: "dashed" },
      });
      const msg = ctx.addMessage({
        from: open.participant,
        to: open.caller,
        label,
        dashed: true,
        kind: "reply",
        endArrowhead: "triangle",
        arrow,
      });
      ctx.endActivation(open.participant, msg.seq);
      return true;
    },
    /** Mark a participant as created at a declaration index. */
    markCreated(
      /** @type {import("../../general/model/diagram.mjs").Participant} */ participant,
      /** @type {number} */ seq = timelineCounter,
    ) {
      participant.createdSeq = Math.max(0, seq);
    },
    /** Mark a participant as destroyed at a declaration index. */
    markDestroyed(
      /** @type {import("../../general/model/diagram.mjs").Participant} */ participant,
      /** @type {number} */ seq = timelineCounter,
    ) {
      participant.destroyedSeq = Math.max(0, seq);
      ctx.endActivation(participant, participant.destroyedSeq);
    },
    /** Configure message autonumbering. */
    setAutonumber(
      /** @type {boolean} */ enabled,
      /** @type {number} */ start = autonumberNext,
      /** @type {number} */ step = autonumberStep,
      /** @type {string} */ format = autonumberFormat,
    ) {
      autonumberEnabled = enabled;
      if (Number.isFinite(start)) autonumberNext = start;
      if (Number.isFinite(step) && step !== 0) autonumberStep = step;
      autonumberFormat = format;
    },
    /** Toggle PlantUML `autoactivate`. */
    setAutoactivate(/** @type {boolean} */ enabled) {
      autoactivateEnabled = enabled;
    },
    /** Apply PlantUML autoactivation semantics to a just-added message. */
    applyAutoactivation(/** @type {Message} */ message, /** @type {string} */ lifecycle = "") {
      if (!autoactivateEnabled || lifecycle) return;
      if (message.kind === "reply") {
        ctx.endActivation(message.from, message.seq);
        return;
      }
      ctx.startActivation(message.to, message.color || "", message.seq, message.from);
    },
    /** Open a participant grouping box. */
    startParticipantGroup(label = "", color = "") {
      const group = new SequenceParticipantGroup({
        id: ctx.nextParticipantGroupId(),
        label,
        color,
      });
      diagram.addParticipantGroup(group);
      participantGroupStack.push(group);
    },
    /** Close the current participant grouping box. */
    endParticipantGroup() {
      return Boolean(participantGroupStack.pop());
    },
    /**
     * @param {keyof SequenceDiagram["style"]} key
     * @param {string} value
     */
    setSequenceStyle(key, value) {
      diagram.style[key] = value;
    },
    /** Toggle bottom participant footboxes. */
    setFootboxVisible(/** @type {boolean} */ visible) {
      diagram.showFootbox = visible;
    },
    /** Toggle PlantUML `hide unlinked`. */
    setHideUnlinked(/** @type {boolean} */ visible) {
      diagram.hideUnlinked = visible;
    },
    /** Close unterminated fragments tolerantly at EOF. */
    finalize() {
      while (fragmentStack.length) ctx.endFragment();
      for (const stack of activationStacks.values()) {
        while (stack.length) {
          const activation = stack.pop();
          if (activation) activation.endSeq = Math.max(activation.startSeq, timelineCounter);
        }
      }
      participantGroupStack.length = 0;
      applyHideUnlinked();

      // If no explicit ++/-- activations were declared, leave activation bars
      // empty so diagrams without them stay visually clean.
      if (!diagram.activations.length) return;

      // For participants that have no explicit ++/-- activation bars, generate
      // implicit bars from sync call → reply message pairs. This ensures all
      // participants show activation bars consistently whenever any participant
      // uses explicit activation markers.
      const explicitIds = new Set(diagram.activations.map((a) => a.participant.id));
      /** @type {Map<string, SequenceActivation[]>} */
      const implicitStacks = new Map();
      for (const msg of diagram.messages) {
        if (msg.isSelf) continue;
        if (msg.kind === "reply") {
          const pid = msg.from.id;
          if (explicitIds.has(pid)) continue;
          const stack = implicitStacks.get(pid);
          if (stack?.length) {
            const act = stack.pop();
            if (act) act.endSeq = Math.max(act.startSeq, msg.seq);
          }
        } else {
          const pid = msg.to.id;
          if (explicitIds.has(pid)) continue;
          const stack = implicitStacks.get(pid) ?? [];
          const act = new SequenceActivation({
            id: `seqact_${activationCounter++}`,
            participant: msg.to,
            startSeq: msg.seq,
            endSeq: msg.seq,
            depth: stack.length,
          });
          stack.push(act);
          implicitStacks.set(pid, stack);
          diagram.addActivation(act);
        }
      }
      // Close any implicit activations that had no matching reply.
      for (const stack of implicitStacks.values()) {
        for (const act of stack) {
          act.endSeq = Math.max(act.startSeq, timelineCounter);
        }
      }
    },
  };

  /** @param {Participant} participant */
  function attachToCurrentParticipantGroup(participant) {
    const group = participantGroupStack[participantGroupStack.length - 1];
    if (!group || group.participants.includes(participant)) return;
    participant.groupId = group.id;
    group.participants.push(participant);
  }

  function applyHideUnlinked() {
    if (!diagram.hideUnlinked) return;
    const linked = new Set();
    for (const message of diagram.messages) {
      linked.add(message.from.id);
      linked.add(message.to.id);
    }
    for (const note of diagram.notes) {
      linked.add(note.target.id);
      if (note.target2) linked.add(note.target2.id);
    }
    for (const ref of diagram.references) {
      linked.add(ref.target.id);
      if (ref.target2) linked.add(ref.target2.id);
    }
    diagram.participants = diagram.participants.filter((participant) => linked.has(participant.id));
    for (const group of diagram.participantGroups) {
      group.participants = group.participants.filter((participant) => linked.has(participant.id));
    }
    diagram.participantGroups = diagram.participantGroups.filter(
      (group) => group.participants.length,
    );
  }

  return ctx;
}

/**
 * Apply the safe plain-text subset of PlantUML autonumber formatting.
 * Supports `{0}` tokens and zero-padded DecimalFormat-style runs such as
 * `[000]`; HTML tags are stripped before text is rendered.
 * @param {number} value Current autonumber value.
 * @param {string} format Optional PlantUML format string.
 * @returns {string} Formatted message number.
 */
function formatAutonumber(value, format) {
  if (!format) return String(value);
  const plain = stripMarkup(format);
  if (plain.includes("{0}")) return plain.replace(/\{0\}/g, String(value));
  const zeroRun = plain.match(/0+/);
  if (!zeroRun) return `${plain}${value}`;
  return `${plain.slice(0, zeroRun.index)}${String(value).padStart(zeroRun[0].length, "0")}${plain.slice((zeroRun.index ?? 0) + zeroRun[0].length)}`;
}

/**
 * @param {string} value Text that may contain PlantUML HTML-ish tags.
 * @returns {string} Safe plain text.
 */
function stripMarkup(value) {
  return value.replace(/<[^>]*>/g, "");
}
