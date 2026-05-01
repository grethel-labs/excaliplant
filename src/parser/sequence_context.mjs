// Mutable parsing context for sequence diagrams.

import { Participant, Message, SequenceDiagram, SequenceNote } from "../model/diagram.mjs";

export function createSequenceContext() {
  const diagram = new SequenceDiagram();
  let messageCounter = 0;
  let noteCounter = 0;

  const ctx = {
    get result() { return diagram; },
    diagram,

    setTitle(t) { diagram.title = t; },

    ensureParticipant(id) {
      let p = diagram.participantById(id);
      if (!p) {
        p = new Participant({ id, title: id });
        diagram.addParticipant(p);
      }
      return p;
    },

    declareParticipant({ id, title, shape = "participant", stereotype = "" }) {
      if (diagram.participantById(id)) return diagram.participantById(id);
      const p = new Participant({ id, title, shape, stereotype });
      diagram.addParticipant(p);
      return p;
    },

    nextMessageId() { return `seq_${messageCounter++}`; },
    nextNoteId()    { return `seqnote_${noteCounter++}`; },

    addMessage(spec) { diagram.addMessage(new Message({ id: ctx.nextMessageId(), ...spec })); },
    addNote(spec)    { diagram.addNote(new SequenceNote({ id: ctx.nextNoteId(), ...spec })); },
  };
  return ctx;
}
