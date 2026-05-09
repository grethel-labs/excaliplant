// Sequence-diagram layout.
//
// Lifelines along x, time along y. No ELK needed — the structure is
// strictly tabular, so we lay it out with simple counters.
//
// Coordinate convention: head boxes sit at the top with their centre
// at participant.x; lifelines run vertically downward. Messages get a
// y position assigned in declaration order.

import {
  FONT,
  measureLine,
  measureSmartFitted,
  measureSmartWrapped,
} from "../../general/style/text.mjs";
import { SEQUENCE_SPACING, arrowLabelBudget, timelineItemGap } from "./spacing.mjs";

const HEAD_PAD_X = 18;
const HEAD_PAD_Y = 10;
const HEAD_MIN_W = 110;
const HEAD_HEIGHT = 50;
const ACTOR_HEAD_HEIGHT = 80; // taller for stickman
const PARTICIPANT_GAP = SEQUENCE_SPACING.participant.gap;
const BASE_TOP_MARGIN = SEQUENCE_SPACING.page.top;
const SIDE_MARGIN = SEQUENCE_SPACING.page.side;
const MESSAGE_FIRST_Y = SEQUENCE_SPACING.message.firstOffset; // distance from lifeline top to first arrow
const SELF_HEIGHT = SEQUENCE_SPACING.message.selfHeight;
const SELF_LOOP_TURN_Y = 24;
const NOTE_PAD = SEQUENCE_SPACING.note.pad;
const NOTE_GAP = SEQUENCE_SPACING.note.sideGap;
const REFERENCE_PAD_X = SEQUENCE_SPACING.reference.padX;
const REFERENCE_PAD_Y = SEQUENCE_SPACING.reference.padY;
const REFERENCE_MIN_HEIGHT = SEQUENCE_SPACING.reference.minHeight;
const DIVIDER_HEIGHT = SEQUENCE_SPACING.marker.dividerHeight;
const DELAY_HEIGHT = SEQUENCE_SPACING.marker.delayHeight;
const ACTIVATION_WIDTH = SEQUENCE_SPACING.activation.width;
const EXTERNAL_MESSAGE_OFFSET = SEQUENCE_SPACING.message.externalOffset;
const SHORT_MESSAGE_OFFSET = SEQUENCE_SPACING.message.shortOffset;
const DECORATION_INNER_MARGIN = SEQUENCE_SPACING.fragment.decorationInnerMargin;
const PARTICIPANT_GROUP_PAD_X = SEQUENCE_SPACING.participant.groupPadX;
const PARTICIPANT_GROUP_PAD_Y = SEQUENCE_SPACING.participant.groupPadY;
const BOTTOM_MARGIN = SEQUENCE_SPACING.page.bottom;
const FRAGMENT_SIDE_MARGIN = SEQUENCE_SPACING.fragment.sideMargin;
const FRAGMENT_TOP_MARGIN = SEQUENCE_SPACING.fragment.topMargin;
const FRAGMENT_BOTTOM_MARGIN = SEQUENCE_SPACING.fragment.bottomMargin;
const FRAGMENT_NESTED_MARGIN = SEQUENCE_SPACING.fragment.nestedMargin;
const FRAGMENT_BOUNDARY_GAP = SEQUENCE_SPACING.fragment.boundaryGap;
const FRAGMENT_MIN_HEIGHT = SEQUENCE_SPACING.fragment.minHeight;
const TITLE_Y = 16;
const HEADER_BASE_Y = 48;
const HEADER_MIN_Y = 12;
const HEADER_CLEARANCE = 44;

/**
 * Lay out a SequenceDiagram (see `src/general/model/diagram.mjs`) on a
 * tabular grid: lifelines along x, time along y. Mutates the model
 * in-place — every participant, message and note receives final
 * `x`/`y` coordinates.
 *
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @public
 */
export function layoutSequenceDiagram(diagram) {
  const participantDeclarationOrder = new Map(diagram.participants.map((p, index) => [p, index]));
  diagram.participants.sort((a, b) => {
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    return (participantDeclarationOrder.get(a) ?? 0) - (participantDeclarationOrder.get(b) ?? 0);
  });

  const topMargin = sequenceTopMargin(diagram);

  // 1. Size each participant head from its title.
  for (const p of diagram.participants) {
    const titleLines = String(p.title || "").split("\n");
    const w = Math.max(
      HEAD_MIN_W,
      Math.max(...titleLines.map((l) => measureLine(l, FONT.sizeTitle).width)) + HEAD_PAD_X * 2,
    );
    p.headWidth = Math.ceil(w);
    p.headHeight =
      p.shape === "actor" && diagram.style.actorStyle !== "box" ? ACTOR_HEAD_HEIGHT : HEAD_HEIGHT;
  }

  // 2. Lay out participants horizontally, centred on x.
  let cursor = SIDE_MARGIN;
  for (const p of diagram.participants) {
    p.x = cursor + p.headWidth / 2;
    p.headY = topMargin;
    cursor += p.headWidth + PARTICIPANT_GAP;
  }
  const totalWidth = cursor - PARTICIPANT_GAP + SIDE_MARGIN;

  assignActivationSides(diagram);
  layoutMessageEndpoints(diagram);
  sizeMessageLabels(diagram);

  const timelineTop = topMargin + Math.max(...diagram.participants.map((p) => p.headHeight), 0);
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
    y += timelineItemGap();
    if (entry.kind === "msg") {
      const m = /** @type {import("../../general/model/diagram.mjs").Message} */ (entry.item);
      y += Math.max(0, m.labelBandHeight);
      m.y = y;
      y += Math.max(0, m.labelBelowHeight || 0);
      // Record seqY AFTER the label-height delta so that activation bars
      // align with the actual arrow position, not the pre-delta y.
      if (Number.isFinite(entry.seq)) seqY.set(entry.seq, y);
      y += m.isSelf ? Math.max(SELF_HEIGHT, m.labelHeight + 8) : 8;
      y += timelineItemGap();
    } else if (entry.kind === "note") {
      const n = /** @type {import("../../general/model/diagram.mjs").SequenceNote} */ (entry.item);
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
      if (Number.isFinite(entry.seq)) seqY.set(entry.seq, y);
      y += n.height + timelineItemGap();
    } else if (entry.kind === "marker") {
      const marker = /** @type {import("../../general/model/diagram.mjs").SequenceMarker} */ (
        entry.item
      );
      marker.x = SIDE_MARGIN;
      marker.width = Math.max(220, totalWidth - SIDE_MARGIN * 2);
      marker.height =
        marker.kind === "space"
          ? Math.max(12, marker.size || SEQUENCE_SPACING.marker.defaultSpace)
          : marker.height;
      marker.y = y;
      if (Number.isFinite(entry.seq)) seqY.set(entry.seq, y);
      y += marker.height + timelineItemGap();
    } else if (entry.kind === "ref") {
      const ref = /** @type {import("../../general/model/diagram.mjs").SequenceReference} */ (
        entry.item
      );
      // Use participant head edges (not centres) plus FRAGMENT_SIDE_MARGIN so
      // ref frames are positioned consistently with combined-fragment boxes.
      const pLeft = Math.min(
        ref.target.x - ref.target.headWidth / 2,
        (ref.target2?.x ?? Infinity) - (ref.target2?.headWidth ?? 0) / 2,
      );
      const pRight = Math.max(
        ref.target.x + ref.target.headWidth / 2,
        (ref.target2?.x ?? -Infinity) + (ref.target2?.headWidth ?? 0) / 2,
      );
      ref.x = pLeft - FRAGMENT_SIDE_MARGIN;
      ref.width = Math.max(ref.width, pRight - pLeft + FRAGMENT_SIDE_MARGIN * 2);
      ref.y = y;
      if (Number.isFinite(entry.seq)) seqY.set(entry.seq, y);
      y += ref.height + timelineItemGap();
    }
  }

  layoutFragments(diagram, timelineTop, y);
  adjustDecorationBounds(diagram);
  layoutActivations(diagram, seqY, y);

  const contentBottom = Math.max(
    y,
    ...diagram.notes.map((note) => note.y + note.height),
    ...diagram.markers.map((marker) => marker.y + marker.height),
    ...diagram.references.map((ref) => ref.y + ref.height),
    ...diagram.fragments.map((fragment) => fragment.y + fragment.height),
    ...diagram.activations.map((activation) => activation.y + activation.height),
  );
  const lifelineBottom = contentBottom + BOTTOM_MARGIN;
  for (const p of diagram.participants) {
    p.destroyY = p.destroyedSeq === null ? 0 : yForSeq(seqY, p.destroyedSeq, contentBottom);
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
  const messageRight = Math.max(
    0,
    ...diagram.messages.map((message) => Math.max(message.startX, message.endX) + SIDE_MARGIN),
  );
  diagram.width = Math.max(totalWidth, fragmentRight, decorationRight, messageRight, 400);
  diagram.height = lifelineBottom + BOTTOM_MARGIN;

  return diagram;
}

/**
 * Pre-size dividers, delays, and reference frames.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
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
        : marker.kind === "pageBreak"
          ? DIVIDER_HEIGHT
          : marker.kind === "delay"
            ? DELAY_HEIGHT
            : marker.size || SEQUENCE_SPACING.marker.defaultSpace;
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
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
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
    group.y = Math.max(BASE_TOP_MARGIN - PARTICIPANT_GROUP_PAD_Y - 18, headerBottomY(diagram) + 8);
    group.width = right - left + PARTICIPANT_GROUP_PAD_X * 2;
    group.height = timelineTop - group.y + 10;
  }
}

/**
 * Clip markers and references that fall inside a fragment to the
 * fragment's inner bounds. This integrates dividers and `ref` frames
 * into the same nesting concept as combined fragments: a decorator
 * inside a fragment is visually contained by it.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @returns {void}
 */
function adjustDecorationBounds(diagram) {
  if (!diagram.fragments.length) return;

  /**
   * @param {number | undefined} seq
   * @returns {import("../../general/model/diagram.mjs").SequenceFragment | null}
   */
  const findInnermostFragment = (seq) => {
    const s = seq ?? Infinity;
    const containing = diagram.fragments.filter(
      (f) => f.width > 0 && f.startSeq <= s && f.endSeq > s,
    );
    if (!containing.length) return null;
    return containing.reduce((smallest, f) =>
      f.endSeq - f.startSeq < smallest.endSeq - smallest.startSeq ? f : smallest,
    );
  };

  for (const marker of diagram.markers) {
    if (marker.kind === "space") continue;
    const fragment = findInnermostFragment(marker.seq);
    if (!fragment) continue;
    marker.x = fragment.x + DECORATION_INNER_MARGIN;
    marker.width = Math.max(marker.width, fragment.width - DECORATION_INNER_MARGIN * 2);
  }

  for (const ref of diagram.references) {
    const fragment = findInnermostFragment(ref.seq);
    if (!fragment) continue;
    ref.x = fragment.x + DECORATION_INNER_MARGIN;
    ref.width = Math.max(ref.width, fragment.width - DECORATION_INNER_MARGIN * 2);
  }
}

/**
 * Position activation bars after all timeline y coordinates are known.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @param {Map<number, number>} seqY Map from declaration index to y.
 * @param {number} timelineBottom Bottom y fallback.
 * @returns {void}
 */
function layoutActivations(diagram, seqY, timelineBottom) {
  const messageBySeq = new Map(
    diagram.messages
      .filter((message) => Number.isFinite(message.seq))
      .map((message) => [message.seq, message]),
  );
  for (const activation of diagram.activations) {
    const startMessage = messageBySeq.get(activation.startSeq) ?? null;
    const endMessage = messageBySeq.get(activation.endSeq) ?? null;
    const top = activationStartBoundaryY(seqY, activation, startMessage, timelineBottom);
    const bottom = activationEndBoundaryY(seqY, activation, endMessage, timelineBottom);
    activation.x = activationLeftX(activation);
    activation.y = top;
    activation.width = ACTIVATION_WIDTH;
    activation.height = Math.max(18, bottom - top);
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
 * Assign concrete x coordinates for message arrow endpoints. Normal arrows
 * attach to lifelines; PlantUML boundary arrows (`[`/`]`) and short arrows
 * (`?`) get deterministic offsets from the attached participant span.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @returns {void}
 */
function layoutMessageEndpoints(diagram) {
  if (!diagram.participants.length) return;
  const left = Math.min(...diagram.participants.map((p) => p.x - p.headWidth / 2));
  const right = Math.max(...diagram.participants.map((p) => p.x + p.headWidth / 2));
  const diagramLeft = Math.max(8, left - EXTERNAL_MESSAGE_OFFSET);
  const diagramRight = right + EXTERNAL_MESSAGE_OFFSET;
  for (const message of diagram.messages) {
    message.startX = sequenceEndpointX(
      message.from,
      message.arrow.start,
      diagramLeft,
      diagramRight,
    );
    message.endX = sequenceEndpointX(message.to, message.arrow.end, diagramLeft, diagramRight);
    if (message.arrow.start.anchor === "shortLeft")
      message.startX = message.to.x - SHORT_MESSAGE_OFFSET;
    if (message.arrow.end.anchor === "shortRight")
      message.endX = message.from.x + SHORT_MESSAGE_OFFSET;
    const fromActivation = activeActivationAtSeq(diagram, message.from, message.seq);
    const toActivation = activeActivationAtSeq(diagram, message.to, message.seq);
    if (message.isSelf) {
      const isActivating = message.lifecycle === "++" || (message.creates && !message.destroys);
      const isDeactivating =
        message.lifecycle === "--" || message.destroys || message.kind === "reply";
      const activationBefore = activeActivationAtSeq(diagram, message.from, message.seq - 1);
      const activationAt = activeActivationAtSeq(diagram, message.from, message.seq);
      const activationAfter = activeActivationAtSeq(diagram, message.from, message.seq + 1);
      const side = selfMessageSide(activationBefore, activationAt, activationAfter);

      if (message.arrow.start.anchor === "participant") {
        if (isActivating && activationBefore) {
          message.startX = activationSideEdgeX(activationBefore, side);
        } else if (isDeactivating && activationAt) {
          message.startX = activationSideEdgeX(activationAt, side);
        } else if (activationAt) {
          message.startX = activationSideEdgeX(activationAt, side);
        } else {
          message.startX = participantEdgeX(message.from, side);
        }
      }

      if (message.arrow.end.anchor === "participant") {
        if (isActivating && activationAt) {
          message.endX = activationSideEdgeX(activationAt, side);
        } else if (isDeactivating && activationAfter) {
          message.endX = activationSideEdgeX(activationAfter, side);
        } else if (activationAt) {
          message.endX = activationSideEdgeX(activationAt, side);
        } else {
          message.endX = participantEdgeX(message.to, side);
        }
      }
    } else {
      if (fromActivation && message.arrow.start.anchor === "participant") {
        message.startX = activationEdgeX(fromActivation, message.from, message.endX);
      }
      if (toActivation && message.arrow.end.anchor === "participant") {
        message.endX = activationEdgeX(toActivation, message.to, message.startX);
      }
    }
  }
}

/**
 * Resolve the side used by nested self-calls inside each activation.
 * Root activations stay centered but still record a preferred child side.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @returns {void}
 */
function assignActivationSides(diagram) {
  const ordered = [...diagram.activations].sort(
    (a, b) => a.depth - b.depth || a.startSeq - b.startSeq,
  );
  for (const activation of ordered) {
    const parent = parentActivation(diagram, activation);
    const preferred = preferredActivationSide(diagram, activation);
    const inherited = parent ? activationLoopSide(parent) : 1;
    activation.nestSide = preferred || inherited;
    activation.side = activation.depth === 0 ? 0 : activation.nestSide;
  }
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @returns {number}
 */
function sequenceTopMargin(diagram) {
  return Math.max(BASE_TOP_MARGIN, headerBottomY(diagram) + HEADER_CLEARANCE);
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @returns {number}
 */
function headerBottomY(diagram) {
  const titleHeight = diagram.title ? blockHeight(diagram.title, FONT.sizePlaneTitle) : 0;
  const headerHeight = diagram.header ? blockHeight(diagram.header, FONT.sizeDescription) : 0;
  const titleBottom = diagram.title ? TITLE_Y + titleHeight : 0;
  const headerTop = headerStartY(diagram);
  const headerBottom = diagram.header ? headerTop + headerHeight : 0;
  return Math.max(titleBottom, headerBottom);
}

/**
 * Keep the header's visual baseline stable by moving multiline header
 * blocks upward instead of only pushing everything below further down.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @returns {number}
 */
function headerStartY(diagram) {
  if (!diagram.header) return HEADER_BASE_Y;
  const headerHeight = blockHeight(diagram.header, FONT.sizeDescription);
  const singleLineHeight = FONT.sizeDescription * FONT.lineHeight;
  const extra = Math.max(0, headerHeight - singleLineHeight);
  return Math.max(HEADER_MIN_Y, HEADER_BASE_Y - extra);
}

/**
 * @param {string} value
 * @param {number} fontSize
 * @returns {number}
 */
function blockHeight(value, fontSize) {
  const lines = String(value || "").split("\n").length;
  return lines * fontSize * FONT.lineHeight;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @param {import("../../general/model/diagram.mjs").Participant} participant
 * @param {number} seq
 * @returns {import("../../general/model/diagram.mjs").SequenceActivation|null}
 */
function activeActivationAtSeq(diagram, participant, seq) {
  if (!Number.isFinite(seq)) return null;
  let chosen = null;
  for (const activation of diagram.activations) {
    if (activation.participant !== participant) continue;
    if (seq < activation.startSeq || seq > activation.endSeq) continue;
    if (!chosen || activation.depth > chosen.depth) chosen = activation;
  }
  return chosen;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @returns {import("../../general/model/diagram.mjs").SequenceActivation|null}
 */
function parentActivation(diagram, activation) {
  if (activation.depth <= 0) return null;
  for (const candidate of diagram.activations) {
    if (candidate === activation) continue;
    if (candidate.participant !== activation.participant) continue;
    if (candidate.depth !== activation.depth - 1) continue;
    if (candidate.startSeq > activation.startSeq) continue;
    if (candidate.endSeq < activation.startSeq) continue;
    return candidate;
  }
  return null;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @returns {-1|0|1}
 */
function preferredActivationSide(diagram, activation) {
  for (const message of diagram.messages) {
    if (message.seq < activation.startSeq || message.seq > activation.endSeq) continue;
    if (message.from !== activation.participant) continue;
    if (message.to === activation.participant) continue;
    if (message.to.x > activation.participant.x) return 1;
    if (message.to.x < activation.participant.x) return -1;
  }
  return 0;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @returns {-1|1}
 */
function activationLoopSide(activation) {
  return activation.side === -1 || activation.nestSide === -1 ? -1 : 1;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @returns {number}
 */
function activationLeftX(activation) {
  return (
    activation.participant.x -
    ACTIVATION_WIDTH / 2 +
    activation.depth * activation.side * (ACTIVATION_WIDTH / 2)
  );
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @returns {number}
 */
function activationRightX(activation) {
  return activationLeftX(activation) + ACTIVATION_WIDTH;
}

/**
 * @param {import("../../general/model/diagram.mjs").Participant} participant
 * @param {-1|1} side
 * @returns {number}
 */
function participantEdgeX(participant, side) {
  return side < 0 ? participant.x - ACTIVATION_WIDTH / 2 : participant.x + ACTIVATION_WIDTH / 2;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @param {-1|1} side
 * @returns {number}
 */
function activationSideEdgeX(activation, side) {
  return side < 0 ? activationLeftX(activation) : activationRightX(activation);
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceActivation|null} activationBefore
 * @param {import("../../general/model/diagram.mjs").SequenceActivation|null} activationAt
 * @param {import("../../general/model/diagram.mjs").SequenceActivation|null} activationAfter
 * @returns {-1|1}
 */
function selfMessageSide(activationBefore, activationAt, activationAfter) {
  const activation = activationAt || activationBefore || activationAfter;
  return activation ? activationLoopSide(activation) : 1;
}

/**
 * @param {Map<number, number>} seqY
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @param {import("../../general/model/diagram.mjs").Message|null} message
 * @param {number} fallback
 * @returns {number}
 */
function activationStartBoundaryY(seqY, activation, message, fallback) {
  if (
    message?.isSelf &&
    message.from === activation.participant &&
    (message.lifecycle === "++" || (message.creates && !message.destroys))
  ) {
    return message.y + SELF_LOOP_TURN_Y;
  }
  return yForSeq(seqY, activation.startSeq, fallback) - 4;
}

/**
 * @param {Map<number, number>} seqY
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @param {import("../../general/model/diagram.mjs").Message|null} message
 * @param {number} fallback
 * @returns {number}
 */
function activationEndBoundaryY(seqY, activation, message, fallback) {
  if (
    message?.isSelf &&
    message.from === activation.participant &&
    (message.lifecycle === "--" || message.destroys || message.kind === "reply")
  ) {
    return message.y;
  }
  return yForSeq(seqY, activation.endSeq, fallback) + 4;
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation
 * @param {import("../../general/model/diagram.mjs").Participant} participant
 * @param {number} otherX
 * @returns {number}
 */
function activationEdgeX(activation, participant, otherX) {
  const left = activationLeftX(activation);
  const right = activationRightX(activation);
  return otherX >= participant.x ? right : left;
}

/**
 * @param {import("../../general/model/diagram.mjs").Participant} participant
 * @param {import("../../general/model/diagram.mjs").SequenceArrowEndpoint} endpoint
 * @param {number} diagramLeft
 * @param {number} diagramRight
 * @returns {number}
 */
function sequenceEndpointX(participant, endpoint, diagramLeft, diagramRight) {
  switch (endpoint.anchor) {
    case "diagramLeft":
      return diagramLeft;
    case "diagramRight":
      return diagramRight;
    case "shortLeft":
      return participant.x - SHORT_MESSAGE_OFFSET;
    case "shortRight":
      return participant.x + SHORT_MESSAGE_OFFSET;
    default:
      return participant.x;
  }
}

/**
 * Measure and cache wrapped message labels after participant x positions
 * are known, because normal message labels are constrained by arrow length.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
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
    } else {
      const maxWidth = messageLabelMaxWidth(message);
      const wrapped = fitWrappedLabel(label, FONT.sizeDescription, maxWidth);
      message.wrappedLabel = wrapped.lines.join("\n");
      message.labelWidth = Math.max(20, wrapped.width);
      message.labelHeight = Math.max(wrapped.fontSize * FONT.lineHeight, wrapped.height);
      message.labelFontSize = wrapped.fontSize;
    }

    sizeEndpointLabel(message.arrow.start, endpointLabelMaxWidth(message));
    sizeEndpointLabel(message.arrow.end, endpointLabelMaxWidth(message));
    const labelBelow = messageLabelBelow(diagram, message);
    message.labelBandHeight = Math.max(
      labelBelow ? 0 : message.labelHeight,
      message.arrow.start.labelHeight,
      message.arrow.end.labelHeight,
    );
    message.labelBelowHeight = labelBelow
      ? message.labelHeight + SEQUENCE_SPACING.message.labelToArrowGap
      : 0;
  }
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram Sequence diagram style holder.
 * @param {import("../../general/model/diagram.mjs").Message} message Message metadata.
 * @returns {boolean} Whether the central label is rendered below the arrow.
 */
function messageLabelBelow(diagram, message) {
  return (
    diagram.style.responseMessageBelowArrow === "true" &&
    message.kind === "reply" &&
    !message.isSelf &&
    Boolean(message.label || message.number)
  );
}
/**
 * @param {import("../../general/model/diagram.mjs").Message} message
 * @returns {string} Display label including autonumber prefix.
 */
function messageLabelText(message) {
  const label = String(message.label || "");
  return message.number ? `${message.number}${label ? ` ${label}` : ""}` : label;
}

/**
 * @param {import("../../general/model/diagram.mjs").Message} message
 * @returns {number} Label width limit in pixels.
 */
function messageLabelMaxWidth(message) {
  if (message.isSelf) return SEQUENCE_SPACING.message.selfLabelMaxWidth;
  const arrowLength = Math.abs((message.endX ?? message.to.x) - (message.startX ?? message.from.x));
  return Math.min(
    SEQUENCE_SPACING.message.labelHardMaxWidth,
    arrowLabelBudget(arrowLength, message.arrow.start, message.arrow.end),
  );
}

/**
 * @param {import("../../general/model/diagram.mjs").Message} message
 * @returns {number} Label width limit in pixels for endpoint labels.
 */
function endpointLabelMaxWidth(message) {
  if (message.isSelf) return SEQUENCE_SPACING.message.endpointLabelMaxWidth;
  const arrowLength = Math.abs((message.endX ?? message.to.x) - (message.startX ?? message.from.x));
  return Math.min(
    SEQUENCE_SPACING.message.endpointLabelMaxWidth,
    arrowLabelBudget(arrowLength, message.arrow.start, message.arrow.end),
  );
}

/**
 * @param {import("../../general/model/diagram.mjs").ArrowEndpoint} endpoint Endpoint metadata.
 * @param {number} maxWidth Available width in px.
 * @returns {void}
 */
function sizeEndpointLabel(endpoint, maxWidth) {
  if (!endpoint.label) {
    endpoint.wrappedLabel = "";
    endpoint.labelWidth = 0;
    endpoint.labelHeight = 0;
    endpoint.labelFontSize = FONT.sizeDescription;
    return;
  }
  const wrapped = fitWrappedLabel(endpoint.label, FONT.sizeDescription, maxWidth);
  endpoint.wrappedLabel = wrapped.lines.join("\n");
  endpoint.labelWidth = Math.max(20, wrapped.width);
  endpoint.labelHeight = Math.max(wrapped.fontSize * FONT.lineHeight, wrapped.height);
  endpoint.labelFontSize = wrapped.fontSize;
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
    const fitted = measureSmartFitted(segment, fontSize, maxWidth);
    chosenFontSize = Math.min(chosenFontSize, fitted.fontSize);
  }

  /** @type {string[]} */
  const lines = [];
  for (const segment of segments) {
    const wrapped = measureSmartWrapped(segment, chosenFontSize, maxWidth);
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
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
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
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram
 * @param {number} lifelineTop Top y of lifelines.
 * @param {number} timelineBottom Current bottom of the message/note timeline.
 * @returns {void}
 */
function layoutFragments(diagram, lifelineTop, timelineBottom) {
  if (!diagram.fragments.length || !diagram.participants.length) return;

  const participantLeft = (
    /** @type {import("../../general/model/diagram.mjs").Participant} */ p,
  ) => p.x - p.headWidth / 2;
  const participantRight = (
    /** @type {import("../../general/model/diagram.mjs").Participant} */ p,
  ) => p.x + p.headWidth / 2;
  const diagramLeft = Math.min(...diagram.participants.map(participantLeft));
  const diagramRight = Math.max(...diagram.participants.map(participantRight));
  const entries = [
    ...diagram.messages.map((m) => ({
      seq: m.seq ?? Infinity,
      top: m.y - Math.max(FONT.sizeDescription * FONT.lineHeight, m.labelBandHeight) - 8,
      bottom:
        m.y + (m.isSelf ? Math.max(SELF_HEIGHT, m.labelHeight + 8) : 8) + (m.labelBelowHeight || 0),
      left: Math.min(
        participantLeft(m.from),
        participantLeft(m.to),
        m.startX ?? m.from.x,
        m.endX ?? m.to.x,
      ),
      right: Math.max(
        participantRight(m.from),
        participantRight(m.to),
        m.startX ?? m.from.x,
        m.endX ?? m.to.x,
      ),
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
    return firstTopAtOrAfter(seq) + timelineItemGap();
  };

  /** @type {Map<import("../../general/model/diagram.mjs").SequenceFragment, {left:number,top:number,right:number,bottom:number}>} */
  const bounds = new Map();

  for (const fragment of diagram.fragments) {
    const contained = entries.filter(
      (entry) => entry.seq >= fragment.startSeq && entry.seq < fragment.endSeq,
    );
    const isTerminal = !entries.some((entry) => entry.seq >= fragment.endSeq);
    const startY = contained[0]?.top ?? firstTopAtOrAfter(fragment.startSeq);
    const endY = Math.max(
      contained.reduce((bottom, entry) => Math.max(bottom, entry.bottom), -Infinity),
      lastBottomBefore(fragment.endSeq) + (isTerminal ? timelineItemGap() : 0),
      startY + timelineItemGap(),
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
 * @param {import("../../general/model/diagram.mjs").SequenceFragment[]} fragments
 * @param {Map<import("../../general/model/diagram.mjs").SequenceFragment, {left:number,top:number,right:number,bottom:number}>} bounds
 * @returns {void}
 */
function expandNestedFragmentBounds(fragments, bounds) {
  const indexOf = new Map(fragments.map((fragment, index) => [fragment, index]));
  const duration = (/** @type {import("../../general/model/diagram.mjs").SequenceFragment} */ f) =>
    f.endSeq - f.startSeq;
  const contains = (
    /** @type {import("../../general/model/diagram.mjs").SequenceFragment} */ parent,
    /** @type {import("../../general/model/diagram.mjs").SequenceFragment} */ child,
  ) =>
    parent !== child &&
    parent.startSeq <= child.startSeq &&
    parent.endSeq >= child.endSeq &&
    (indexOf.get(parent) ?? 0) < (indexOf.get(child) ?? 0);
  const directParent = (
    /** @type {import("../../general/model/diagram.mjs").SequenceFragment} */ child,
  ) =>
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
