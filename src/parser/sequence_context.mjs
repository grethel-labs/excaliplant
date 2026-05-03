// Mutable parsing context for sequence diagrams.

import { Participant, Message, SequenceDiagram, SequenceNote } from "../model/diagram.mjs";

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
 *   addMessage(spec: object): void,
 *   addNote(spec: object): void,
 * }}
 * @public
 */
export function createSequenceContext() {
  const diagram = new SequenceDiagram();
  let messageCounter = 0;
  let noteCounter = 0;

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
      }
      return p;
    },

    /**
     * Explicitly declare a participant (`participant Foo as f`).
     * @param {{id:string,title:string,shape?:string,stereotype?:string}} spec Participant specification.
     * @returns {Participant} The created or existing lifeline.
     */
    declareParticipant(
      /** @type {{id:string,title:string,shape?:string,stereotype?:string}} */ {
        id,
        title,
        shape = "participant",
        stereotype = "",
      },
    ) {
      if (diagram.participantById(id)) return diagram.participantById(id);
      const p = new Participant({ id, title, shape, stereotype });
      diagram.addParticipant(p);
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

    /**
     * Append a new message to the diagram (id is auto-assigned).
     * @param {any} spec Plugin-built message record (without id).
     */
    addMessage(/** @type {any} */ spec) {
      diagram.addMessage(new Message({ id: ctx.nextMessageId(), ...spec }));
    },
    /**
     * Append a new note to the diagram (id is auto-assigned).
     * @param {any} spec Plugin-built note record (without id).
     */
    addNote(/** @type {any} */ spec) {
      diagram.addNote(new SequenceNote({ id: ctx.nextNoteId(), ...spec }));
    },
  };
  return ctx;
}
