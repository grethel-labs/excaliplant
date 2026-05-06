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
} from "../model/diagram.mjs";

/**
 * Construct the mutable parsing context shared by all sequence-diagram
 * plugins during a single `parsePlantUml` invocation.
 *
 * @returns {{
 *   readonly result: import("../model/diagram.mjs").SequenceDiagram,
 *   diagram:         import("../model/diagram.mjs").SequenceDiagram,
 *   setTitle(t: string): void,
 *   ensureParticipant(id: string): import("../model/diagram.mjs").Participant,
 *   declareParticipant(spec: object): import("../model/diagram.mjs").Participant,
 *   nextMessageId(): string,
 *   nextNoteId(): string,
 *   nextFragmentId(): string,
 *   nextActivationId(): string,
 *   nextMarkerId(): string,
 *   nextReferenceId(): string,
 *   nextParticipantGroupId(): string,
 *   currentSeq(): number,
 *   lastSeq(): number,
 *   addMessage(spec: object): import("../model/diagram.mjs").Message,
 *   addNote(spec: object): void,
 *   addMarker(kind: string, label?: string, size?: number): void,
 *   addReference(spec: object): void,
 *   startFragment(kind: string, label?: string): void,
 *   splitFragmentOperand(label?: string): boolean,
 *   endFragment(): boolean,
 *   startActivation(participant: import("../model/diagram.mjs").Participant, color?: string, seq?: number): void,
 *   endActivation(participant: import("../model/diagram.mjs").Participant, seq?: number): boolean,
 *   markCreated(participant: import("../model/diagram.mjs").Participant, seq?: number): void,
 *   markDestroyed(participant: import("../model/diagram.mjs").Participant, seq?: number): void,
 *   setAutonumber(enabled: boolean, start?: number, step?: number): void,
 *   setSequenceStyle(key: keyof import("../model/diagram.mjs").SequenceDiagram["style"], value: string): void,
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
  /** @type {SequenceFragment[]} */
  const fragmentStack = [];
  /** @type {Map<string, SequenceActivation[]>} */
  const activationStacks = new Map();
  /** @type {SequenceParticipantGroup[]} */
  const participantGroupStack = [];

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
     * @param {{id:string,title:string,shape?:string,stereotype?:string,color?:string}} spec Participant specification.
     * @returns {Participant} The created or existing lifeline.
     */
    declareParticipant(
      /** @type {{id:string,title:string,shape?:string,stereotype?:string,color?:string}} */ {
        id,
        title,
        shape = "participant",
        stereotype = "",
        color = "",
      },
    ) {
      const existing = diagram.participantById(id);
      if (existing) return existing;
      const p = new Participant({ id, title, shape, stereotype, color });
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
        msg.number = String(autonumberNext);
        autonumberNext += autonumberStep;
      }
      msg.seq = timelineCounter++;
      diagram.addMessage(msg);
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
     * @param {{label:string,target:import("../model/diagram.mjs").Participant,target2?:import("../model/diagram.mjs").Participant|null}} spec
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
     */
    startFragment(/** @type {string} */ kind, /** @type {string} */ label = "") {
      const fragment = new SequenceFragment({
        id: ctx.nextFragmentId(),
        kind,
        label,
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
     * @param {import("../model/diagram.mjs").Participant} participant
     * @param {string} [color]
     * @param {number} [seq]
     */
    startActivation(participant, color = "", seq = timelineCounter) {
      const stack = activationStacks.get(participant.id) ?? [];
      const activation = new SequenceActivation({
        id: ctx.nextActivationId(),
        participant,
        startSeq: Math.max(0, seq),
        color,
        depth: stack.length,
      });
      stack.push(activation);
      activationStacks.set(participant.id, stack);
      diagram.addActivation(activation);
    },
    /**
     * End the most recent activation on a lifeline.
     * @param {import("../model/diagram.mjs").Participant} participant
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
    /** Mark a participant as created at a declaration index. */
    markCreated(
      /** @type {import("../model/diagram.mjs").Participant} */ participant,
      /** @type {number} */ seq = timelineCounter,
    ) {
      participant.createdSeq = Math.max(0, seq);
    },
    /** Mark a participant as destroyed at a declaration index. */
    markDestroyed(
      /** @type {import("../model/diagram.mjs").Participant} */ participant,
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
    ) {
      autonumberEnabled = enabled;
      if (Number.isFinite(start)) autonumberNext = start;
      if (Number.isFinite(step) && step !== 0) autonumberStep = step;
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
    },
  };

  /** @param {Participant} participant */
  function attachToCurrentParticipantGroup(participant) {
    const group = participantGroupStack[participantGroupStack.length - 1];
    if (!group || group.participants.includes(participant)) return;
    participant.groupId = group.id;
    group.participants.push(participant);
  }

  return ctx;
}
