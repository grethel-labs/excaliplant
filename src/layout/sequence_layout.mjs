// Sequence-diagram layout.
//
// Lifelines along x, time along y. No ELK needed — the structure is
// strictly tabular, so we lay it out with simple counters.
//
// Coordinate convention: head boxes sit at the top with their centre
// at participant.x; lifelines run vertically downward. Messages get a
// y position assigned in declaration order.

import { FONT, measureLine } from "../style/text.mjs";

const HEAD_PAD_X = 18;
const HEAD_PAD_Y = 10;
const HEAD_MIN_W = 110;
const HEAD_HEIGHT = 50;
const ACTOR_HEAD_HEIGHT = 80; // taller for stickman
const PARTICIPANT_GAP = 60;
const TOP_MARGIN = 60;
const SIDE_MARGIN = 40;
const MESSAGE_FIRST_Y = 50; // distance from lifeline top to first arrow
const MESSAGE_GAP = 50;
const SELF_HEIGHT = 36;
const NOTE_PAD = 8;
const NOTE_GAP = 14;
const BOTTOM_MARGIN = 60;

/**
 * Lay out a SequenceDiagram (see `src/model/diagram.mjs`) on a
 * tabular grid: lifelines along x, time along y. Mutates the model
 * in-place — every participant, message and note receives final
 * `x`/`y` coordinates.
 *
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @public
 */
export function layoutSequenceDiagram(diagram) {
  // 1. Size each participant head from its title.
  for (const p of diagram.participants) {
    const titleLines = String(p.title || "").split("\n");
    const w = Math.max(
      HEAD_MIN_W,
      Math.max(...titleLines.map((l) => measureLine(l, FONT.sizeTitle).width)) + HEAD_PAD_X * 2,
    );
    p.headWidth = Math.ceil(w);
    p.headHeight = p.shape === "actor" ? ACTOR_HEAD_HEIGHT : HEAD_HEIGHT;
  }

  // 2. Lay out participants horizontally, centred on x.
  let cursor = SIDE_MARGIN;
  for (const p of diagram.participants) {
    p.x = cursor + p.headWidth / 2;
    p.headY = TOP_MARGIN;
    cursor += p.headWidth + PARTICIPANT_GAP;
  }
  const totalWidth = cursor - PARTICIPANT_GAP + SIDE_MARGIN;

  const lifelineTop = TOP_MARGIN + Math.max(...diagram.participants.map((p) => p.headHeight), 0);
  for (const p of diagram.participants) p.lifelineTop = lifelineTop;

  // 3. Walk messages and notes in their declaration order, assigning y.
  // Both message and note objects carry a `seq` index assigned by the
  // sequence context; we merge the two streams on that field so notes
  // appear at the temporal position they were declared at, instead of
  // being dumped at the bottom of the diagram.
  const timeline = [
    ...diagram.messages.map((m) => ({ kind: "msg", item: m, seq: m.seq ?? Infinity })),
    ...diagram.notes.map((n) => ({ kind: "note", item: n, seq: n.seq ?? Infinity })),
  ];
  // Stable sort by declaration index. Items without a `seq` (e.g.
  // programmatically-built diagrams) keep their relative order at the
  // tail.
  timeline.sort((a, b) => a.seq - b.seq);

  // Pre-size notes so we know their height before assigning y.
  for (const n of diagram.notes) {
    const lines = n.text.split("\n");
    n.width = Math.max(
      120,
      Math.max(...lines.map((l) => measureLine(l, FONT.sizeDescription).width)) + NOTE_PAD * 2,
    );
    n.height = lines.length * FONT.sizeDescription * FONT.lineHeight + NOTE_PAD * 2;
  }

  let y = lifelineTop + MESSAGE_FIRST_Y;
  for (const entry of timeline) {
    if (entry.kind === "msg") {
      const m = /** @type {import("../model/diagram.mjs").Message} */ (entry.item);
      m.y = y;
      y += m.isSelf ? SELF_HEIGHT + MESSAGE_GAP : MESSAGE_GAP;
    } else {
      const n = /** @type {import("../model/diagram.mjs").SequenceNote} */ (entry.item);
      if (n.side === "over" && n.target2) {
        const x1 = Math.min(n.target.x, n.target2.x);
        const x2 = Math.max(n.target.x, n.target2.x);
        n.x = (x1 + x2) / 2 - n.width / 2;
      } else if (n.side === "left") {
        n.x = n.target.x - n.target.headWidth / 2 - n.width - NOTE_GAP;
      } else if (n.side === "right") {
        n.x = n.target.x + n.target.headWidth / 2 + NOTE_GAP;
      } else {
        // over single
        n.x = n.target.x - n.width / 2;
      }
      n.y = y;
      y += n.height + NOTE_GAP;
    }
  }

  const lifelineBottom = y + BOTTOM_MARGIN;
  for (const p of diagram.participants) p.lifelineBottom = lifelineBottom;

  diagram.width = Math.max(totalWidth, 400);
  diagram.height = lifelineBottom + BOTTOM_MARGIN;

  return diagram;
}
