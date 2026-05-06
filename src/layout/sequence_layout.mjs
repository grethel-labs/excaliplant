// Sequence-diagram layout.
//
// Lifelines along x, time along y. No ELK needed — the structure is
// strictly tabular, so we lay it out with simple counters.
//
// Coordinate convention: head boxes sit at the top with their centre
// at participant.x; lifelines run vertically downward. Messages get a
// y position assigned in declaration order.

import { FONT, measureFitted, measureLine, measureWrapped } from "../style/text.mjs";

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
const MESSAGE_LABEL_SIDE_MARGIN = 12;
const MESSAGE_LABEL_MIN_WIDTH = 48;
const SELF_MESSAGE_LABEL_MAX_WIDTH = 220;
const SELF_HEIGHT = 36;
const NOTE_PAD = 8;
const NOTE_GAP = 14;
const REFERENCE_PAD_X = 14;
const REFERENCE_PAD_Y = 12;
const REFERENCE_MIN_HEIGHT = 54;
const MARKER_GAP = 16;
const DIVIDER_HEIGHT = 30;
const DELAY_HEIGHT = 34;
const ACTIVATION_WIDTH = 12;
const ACTIVATION_DEPTH_GAP = 8;
const PARTICIPANT_GROUP_PAD_X = 16;
const PARTICIPANT_GROUP_PAD_Y = 14;
const BOTTOM_MARGIN = 60;
const FRAGMENT_SIDE_MARGIN = 24;
const FRAGMENT_TOP_MARGIN = 30;
const FRAGMENT_BOTTOM_MARGIN = 28;
const FRAGMENT_NESTED_MARGIN = 14;
const FRAGMENT_BOUNDARY_GAP = 58;
const FRAGMENT_MIN_HEIGHT = 62;

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

  sizeMessageLabels(diagram);

  const timelineTop = TOP_MARGIN + Math.max(...diagram.participants.map((p) => p.headHeight), 0);
  for (const p of diagram.participants) p.lifelineTop = p.headY;
  layoutParticipantGroups(diagram, timelineTop);

  // 3. Walk messages and notes in their declaration order, assigning y.
  // Both message and note objects carry a `seq` index assigned by the
  // sequence context; we merge the two streams on that field so notes
  // appear at the temporal position they were declared at, instead of
  // being dumped at the bottom of the diagram.
  const timeline = [
    ...diagram.messages.map((m) => ({ kind: "msg", item: m, seq: m.seq ?? Infinity })),
    ...diagram.notes.map((n) => ({ kind: "note", item: n, seq: n.seq ?? Infinity })),
    ...diagram.markers.map((m) => ({ kind: "marker", item: m, seq: m.seq ?? Infinity })),
    ...diagram.references.map((r) => ({ kind: "ref", item: r, seq: r.seq ?? Infinity })),
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
  sizeTimelineDecorations(diagram, totalWidth);

  const firstFiniteSeq = Math.min(
    ...timeline.map((entry) => entry.seq).filter((seq) => Number.isFinite(seq)),
    Infinity,
  );
  const boundaryGapBefore = buildFragmentBoundaryGap(diagram, firstFiniteSeq);
  /** @type {Map<number, number>} */
  const seqY = new Map();

  let y = timelineTop + MESSAGE_FIRST_Y;
  for (const entry of timeline) {
    y += boundaryGapBefore(entry.seq);
    if (Number.isFinite(entry.seq)) seqY.set(entry.seq, y);
    if (entry.kind === "msg") {
      const m = /** @type {import("../model/diagram.mjs").Message} */ (entry.item);
      if (!m.isSelf) {
        y += Math.max(0, m.labelHeight - FONT.sizeDescription * FONT.lineHeight);
      }
      m.y = y;
      y += m.isSelf ? Math.max(SELF_HEIGHT, m.labelHeight + 8) + MESSAGE_GAP : MESSAGE_GAP;
    } else if (entry.kind === "note") {
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
    } else if (entry.kind === "marker") {
      const marker = /** @type {import("../model/diagram.mjs").SequenceMarker} */ (entry.item);
      marker.x = SIDE_MARGIN;
      marker.y = y;
      marker.width = Math.max(220, totalWidth - SIDE_MARGIN * 2);
      marker.height = marker.kind === "space" ? Math.max(12, marker.size || 36) : marker.height;
      y += marker.height + MARKER_GAP;
    } else if (entry.kind === "ref") {
      const ref = /** @type {import("../model/diagram.mjs").SequenceReference} */ (entry.item);
      const x1 = Math.min(ref.target.x, ref.target2?.x ?? ref.target.x);
      const x2 = Math.max(ref.target.x, ref.target2?.x ?? ref.target.x);
      ref.width = Math.max(ref.width, x2 - x1 + PARTICIPANT_GAP);
      ref.x = (x1 + x2) / 2 - ref.width / 2;
      ref.y = y;
      y += ref.height + NOTE_GAP;
    }
  }

  layoutFragments(diagram, timelineTop, y);
  layoutActivations(diagram, seqY, y);

  const lifelineBottom = y + BOTTOM_MARGIN;
  for (const p of diagram.participants) {
    p.destroyY = p.destroyedSeq === null ? 0 : yForSeq(seqY, p.destroyedSeq, y);
    p.lifelineBottom = p.destroyY || lifelineBottom;
  }

  const fragmentRight = Math.max(
    0,
    ...diagram.fragments.map((fragment) => fragment.x + fragment.width + SIDE_MARGIN),
  );
  const decorationRight = Math.max(
    0,
    ...diagram.references.map((ref) => ref.x + ref.width + SIDE_MARGIN),
    ...diagram.participantGroups.map((group) => group.x + group.width + SIDE_MARGIN),
  );
  diagram.width = Math.max(totalWidth, fragmentRight, decorationRight, 400);
  diagram.height = lifelineBottom + BOTTOM_MARGIN;

  return diagram;
}

/**
 * Pre-size dividers, delays, and reference frames.
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @param {number} totalWidth Current participant span.
 * @returns {void}
 */
function sizeTimelineDecorations(diagram, totalWidth) {
  const markerWidth = Math.max(220, totalWidth - SIDE_MARGIN * 2);
  for (const marker of diagram.markers) {
    marker.width = markerWidth;
    marker.height =
      marker.kind === "divider"
        ? DIVIDER_HEIGHT
        : marker.kind === "delay"
          ? DELAY_HEIGHT
          : marker.size;
  }
  for (const ref of diagram.references) {
    const maxWidth = Math.max(120, markerWidth - REFERENCE_PAD_X * 2);
    const wrapped = fitWrappedLabel(ref.label, FONT.sizeDescription, maxWidth);
    ref.wrappedLabel = wrapped.lines.join("\n");
    ref.width = Math.min(markerWidth, Math.max(160, wrapped.width + REFERENCE_PAD_X * 2));
    ref.height = Math.max(REFERENCE_MIN_HEIGHT, wrapped.height + REFERENCE_PAD_Y * 2 + 18);
  }
}

/**
 * Place participant grouping boxes around the top lifeline heads.
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @param {number} timelineTop First timeline y coordinate.
 * @returns {void}
 */
function layoutParticipantGroups(diagram, timelineTop) {
  for (const group of diagram.participantGroups) {
    const participants = group.participants.filter((participant) =>
      diagram.participants.includes(participant),
    );
    if (!participants.length) continue;
    const left = Math.min(...participants.map((p) => p.x - p.headWidth / 2));
    const right = Math.max(...participants.map((p) => p.x + p.headWidth / 2));
    group.x = left - PARTICIPANT_GROUP_PAD_X;
    group.y = TOP_MARGIN - PARTICIPANT_GROUP_PAD_Y - 18;
    group.width = right - left + PARTICIPANT_GROUP_PAD_X * 2;
    group.height = timelineTop - group.y + 10;
  }
}

/**
 * Position activation bars after all timeline y coordinates are known.
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @param {Map<number, number>} seqY Map from declaration index to y.
 * @param {number} timelineBottom Bottom y fallback.
 * @returns {void}
 */
function layoutActivations(diagram, seqY, timelineBottom) {
  for (const activation of diagram.activations) {
    const start = yForSeq(seqY, activation.startSeq, timelineBottom);
    const end = yForSeq(seqY, activation.endSeq, timelineBottom);
    activation.x = activation.participant.x + 6 + activation.depth * ACTIVATION_DEPTH_GAP;
    activation.y = start - 4;
    activation.width = ACTIVATION_WIDTH;
    activation.height = Math.max(18, end - start + 8);
  }
}

/**
 * @param {Map<number, number>} seqY Sequence index to y map.
 * @param {number} seq Sequence index.
 * @param {number} fallback Fallback y when the index is beyond the timeline.
 * @returns {number} Best y coordinate for the sequence boundary.
 */
function yForSeq(seqY, seq, fallback) {
  if (seqY.has(seq)) return seqY.get(seq) ?? fallback;
  const keys = [...seqY.keys()].filter((key) => key <= seq).sort((a, b) => b - a);
  if (keys.length) return (seqY.get(keys[0]) ?? fallback) + 24;
  return fallback;
}

/**
 * Measure and cache wrapped message labels after participant x positions
 * are known, because normal message labels are constrained by arrow length.
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @returns {void}
 */
function sizeMessageLabels(diagram) {
  for (const message of diagram.messages) {
    const label = messageLabelText(message);
    if (!label) {
      message.wrappedLabel = "";
      message.labelWidth = 0;
      message.labelHeight = 0;
      message.labelFontSize = FONT.sizeDescription;
      continue;
    }
    const maxWidth = messageLabelMaxWidth(message);
    const wrapped = fitWrappedLabel(label, FONT.sizeDescription, maxWidth);
    message.wrappedLabel = wrapped.lines.join("\n");
    message.labelWidth = Math.max(20, wrapped.width);
    message.labelHeight = Math.max(wrapped.fontSize * FONT.lineHeight, wrapped.height);
    message.labelFontSize = wrapped.fontSize;
  }
}

/**
 * @param {import("../model/diagram.mjs").Message} message
 * @returns {string} Display label including autonumber prefix.
 */
function messageLabelText(message) {
  const label = String(message.label || "");
  return message.number ? `${message.number}${label ? ` ${label}` : ""}` : label;
}

/**
 * @param {import("../model/diagram.mjs").Message} message
 * @returns {number} Label width limit in pixels.
 */
function messageLabelMaxWidth(message) {
  if (message.isSelf) return SELF_MESSAGE_LABEL_MAX_WIDTH;
  const arrowLength = Math.abs(message.to.x - message.from.x);
  return Math.max(MESSAGE_LABEL_MIN_WIDTH, arrowLength - MESSAGE_LABEL_SIDE_MARGIN * 2);
}

/**
 * Wrap a message label like box text: preserve manual line breaks,
 * wrap each segment, and shrink only when a single token still cannot fit.
 * @param {string} label Raw label text.
 * @param {number} fontSize Requested font size.
 * @param {number} maxWidth Available label width.
 * @returns {{fontSize:number,width:number,height:number,lines:string[]}}
 */
function fitWrappedLabel(label, fontSize, maxWidth) {
  const segments = String(label).split("\n");
  let chosenFontSize = fontSize;
  for (const segment of segments) {
    const fitted = measureFitted(segment, fontSize, maxWidth);
    chosenFontSize = Math.min(chosenFontSize, fitted.fontSize);
  }

  /** @type {string[]} */
  const lines = [];
  for (const segment of segments) {
    const wrapped = measureWrapped(segment, chosenFontSize, maxWidth);
    if (wrapped.lines.length === 0) lines.push("");
    else lines.push(...wrapped.lines);
  }

  return {
    fontSize: chosenFontSize,
    width: Math.min(
      maxWidth,
      Math.max(0, ...lines.map((line) => measureLine(line, chosenFontSize).width)),
    ),
    height: lines.length * chosenFontSize * FONT.lineHeight,
    lines,
  };
}

/**
 * Build a small vertical-reservation function for fragment boundaries.
 * This keeps adjacent fragments from visually colliding while preserving
 * declaration-order layout.
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @param {number} firstFiniteSeq First visible timeline index.
 * @returns {(seq: number) => number}
 */
function buildFragmentBoundaryGap(diagram, firstFiniteSeq) {
  /** @type {Map<number, number>} */
  const boundaryCounts = new Map();
  const addBoundary = (/** @type {number} */ seq) => {
    if (!Number.isFinite(seq) || seq === firstFiniteSeq) return;
    boundaryCounts.set(seq, (boundaryCounts.get(seq) ?? 0) + 1);
  };
  for (const fragment of diagram.fragments) {
    addBoundary(fragment.startSeq);
    addBoundary(fragment.endSeq);
  }
  return (seq) => {
    const count = boundaryCounts.get(seq) ?? 0;
    if (!count) return 0;
    return FRAGMENT_BOUNDARY_GAP + Math.max(0, count - 1) * 6;
  };
}

/**
 * Assign visual frames to combined fragments after timeline items have
 * received y coordinates.
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @param {number} lifelineTop Top y of lifelines.
 * @param {number} timelineBottom Current bottom of the message/note timeline.
 * @returns {void}
 */
function layoutFragments(diagram, lifelineTop, timelineBottom) {
  if (!diagram.fragments.length || !diagram.participants.length) return;

  const participantLeft = (/** @type {import("../model/diagram.mjs").Participant} */ p) =>
    p.x - p.headWidth / 2;
  const participantRight = (/** @type {import("../model/diagram.mjs").Participant} */ p) =>
    p.x + p.headWidth / 2;
  const diagramLeft = Math.min(...diagram.participants.map(participantLeft));
  const diagramRight = Math.max(...diagram.participants.map(participantRight));
  const entries = [
    ...diagram.messages.map((m) => ({
      seq: m.seq ?? Infinity,
      top: m.y - Math.max(FONT.sizeDescription * FONT.lineHeight, m.labelHeight) - 8,
      bottom: m.y + (m.isSelf ? Math.max(SELF_HEIGHT, m.labelHeight + 8) : 8),
      left: Math.min(participantLeft(m.from), participantLeft(m.to)),
      right: Math.max(participantRight(m.from), participantRight(m.to)),
    })),
    ...diagram.notes.map((n) => ({
      seq: n.seq ?? Infinity,
      top: n.y,
      bottom: n.y + n.height,
      left: n.x,
      right: n.x + n.width,
    })),
    ...diagram.references.map((r) => ({
      seq: r.seq ?? Infinity,
      top: r.y,
      bottom: r.y + r.height,
      left: r.x,
      right: r.x + r.width,
    })),
    ...diagram.markers
      .filter((marker) => marker.kind !== "space")
      .map((marker) => ({
        seq: marker.seq ?? Infinity,
        top: marker.y,
        bottom: marker.y + marker.height,
        left: marker.x,
        right: marker.x + marker.width,
      })),
  ].sort((a, b) => a.seq - b.seq);

  const firstTopAtOrAfter = (/** @type {number} */ seq) =>
    entries.find((entry) => entry.seq >= seq)?.top ?? timelineBottom;
  const lastBottomBefore = (/** @type {number} */ seq) => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].seq < seq) return entries[i].bottom;
    }
    return firstTopAtOrAfter(seq) + MESSAGE_GAP;
  };

  /** @type {Map<import("../model/diagram.mjs").SequenceFragment, {left:number,top:number,right:number,bottom:number}>} */
  const bounds = new Map();

  for (const fragment of diagram.fragments) {
    const contained = entries.filter(
      (entry) => entry.seq >= fragment.startSeq && entry.seq < fragment.endSeq,
    );
    const startY = contained[0]?.top ?? firstTopAtOrAfter(fragment.startSeq);
    const endY = Math.max(
      contained.reduce((bottom, entry) => Math.max(bottom, entry.bottom), -Infinity),
      lastBottomBefore(fragment.endSeq),
      startY + MESSAGE_GAP,
    );
    const left = contained.length ? Math.min(...contained.map((entry) => entry.left)) : diagramLeft;
    const right = contained.length
      ? Math.max(...contained.map((entry) => entry.right))
      : diagramRight;
    bounds.set(fragment, {
      left: left - FRAGMENT_SIDE_MARGIN,
      top: Math.max(lifelineTop + 8, startY - FRAGMENT_TOP_MARGIN),
      right: right + FRAGMENT_SIDE_MARGIN,
      bottom: endY + FRAGMENT_BOTTOM_MARGIN,
    });
  }

  expandNestedFragmentBounds(diagram.fragments, bounds);

  const minBoundLeft = Math.min(...[...bounds.values()].map((bound) => bound.left));
  const horizontalShift = minBoundLeft < 8 ? 8 - minBoundLeft : 0;
  if (horizontalShift > 0) {
    for (const bound of bounds.values()) {
      bound.left += horizontalShift;
      bound.right += horizontalShift;
    }
  }

  for (const fragment of diagram.fragments) {
    const bound = bounds.get(fragment);
    if (!bound) continue;
    fragment.x = bound.left;
    fragment.y = bound.top;
    fragment.width = Math.max(80, bound.right - fragment.x);
    fragment.height = Math.max(FRAGMENT_MIN_HEIGHT, bound.bottom - fragment.y);
    for (const operand of fragment.operands.slice(1)) {
      operand.y = Math.max(fragment.y + 32, firstTopAtOrAfter(operand.startSeq) - 16);
    }
  }
}

/**
 * Grow parent fragments around nested children, recursively. When a
 * child starts on the same horizontal edge as its parent, the parent is
 * padded outward on that edge so nesting remains legible.
 * @param {import("../model/diagram.mjs").SequenceFragment[]} fragments
 * @param {Map<import("../model/diagram.mjs").SequenceFragment, {left:number,top:number,right:number,bottom:number}>} bounds
 * @returns {void}
 */
function expandNestedFragmentBounds(fragments, bounds) {
  const indexOf = new Map(fragments.map((fragment, index) => [fragment, index]));
  const duration = (/** @type {import("../model/diagram.mjs").SequenceFragment} */ f) =>
    f.endSeq - f.startSeq;
  const contains = (
    /** @type {import("../model/diagram.mjs").SequenceFragment} */ parent,
    /** @type {import("../model/diagram.mjs").SequenceFragment} */ child,
  ) =>
    parent !== child &&
    parent.startSeq <= child.startSeq &&
    parent.endSeq >= child.endSeq &&
    (indexOf.get(parent) ?? 0) < (indexOf.get(child) ?? 0);
  const directParent = (/** @type {import("../model/diagram.mjs").SequenceFragment} */ child) =>
    fragments
      .filter((candidate) => contains(candidate, child))
      .sort(
        (a, b) => duration(a) - duration(b) || (indexOf.get(b) ?? 0) - (indexOf.get(a) ?? 0),
      )[0];

  for (const child of [...fragments].sort(
    (a, b) => duration(a) - duration(b) || (indexOf.get(b) ?? 0) - (indexOf.get(a) ?? 0),
  )) {
    const parent = directParent(child);
    if (!parent) continue;
    const childBounds = bounds.get(child);
    const parentBounds = bounds.get(parent);
    if (!childBounds || !parentBounds) continue;

    const leftGap =
      Math.abs(parentBounds.left - childBounds.left) <= 1 ? FRAGMENT_NESTED_MARGIN : 0;
    const rightGap =
      Math.abs(parentBounds.right - childBounds.right) <= 1 ? FRAGMENT_NESTED_MARGIN : 0;
    const topGap = Math.abs(parentBounds.top - childBounds.top) <= 1 ? FRAGMENT_NESTED_MARGIN : 0;
    const bottomGap =
      Math.abs(parentBounds.bottom - childBounds.bottom) <= 1 ? FRAGMENT_NESTED_MARGIN : 0;

    parentBounds.left = Math.min(
      parentBounds.left,
      childBounds.left - Math.max(FRAGMENT_NESTED_MARGIN, leftGap),
    );
    parentBounds.right = Math.max(
      parentBounds.right,
      childBounds.right + Math.max(FRAGMENT_NESTED_MARGIN, rightGap),
    );
    parentBounds.top = Math.min(
      parentBounds.top,
      childBounds.top - Math.max(FRAGMENT_NESTED_MARGIN, topGap),
    );
    parentBounds.bottom = Math.max(
      parentBounds.bottom,
      childBounds.bottom + Math.max(FRAGMENT_NESTED_MARGIN, bottomGap),
    );
  }
}
