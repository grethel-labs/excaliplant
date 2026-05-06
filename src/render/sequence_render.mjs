// Sequence-diagram → Excalidraw renderer.
//
// Receives the same primitive helpers (rect/text/arrow/ellipse/line)
// as the component renderer so id/seed/version generation stays in
// one place.

import { FONT } from "../style/text.mjs";
import { stableHash32 } from "./rng.mjs";

const HEAD_STROKE = "#1f2933";
const LIFELINE_STROKE = "#888";
const NOTE_STROKE = "#a07b00";
const NOTE_FILL = "#fff5b1";
const LIFELINE_HEAD_OVERLAP = 12;
const ACTIVATION_STROKE = "#374151";
const ACTIVATION_FILL = "#ffffff";
const REFERENCE_STROKE = "#64748b";
const REFERENCE_FILL = "#f8fafc";
const REFERENCE_HEADER = "#475569";
const DIVIDER_STROKE = "#475569";
const DIVIDER_FILL = "#e2e8f0";
const DELAY_STROKE = "#64748b";
const FRAGMENT_COLORS = /** @type {Record<string, {stroke:string,fill:string,header:string}>} */ (
  Object.freeze({
    opt: { stroke: "#2563eb", fill: "#eff6ff", header: "#2563eb" },
    loop: { stroke: "#7c3aed", fill: "#f5f3ff", header: "#7c3aed" },
    alt: { stroke: "#0891b2", fill: "#ecfeff", header: "#0891b2" },
    par: { stroke: "#16a34a", fill: "#f0fdf4", header: "#16a34a" },
    break: { stroke: "#dc2626", fill: "#fef2f2", header: "#dc2626" },
    critical: { stroke: "#b45309", fill: "#fffbeb", header: "#b45309" },
    group: { stroke: "#475569", fill: "#f8fafc", header: "#475569" },
  })
);

/**
 * Render a SequenceDiagram (see `src/model/diagram.mjs`) into an
 * array of Excalidraw elements using the primitive factories
 * supplied by the parent renderer.
 *
 * @param {import("../model/diagram.mjs").SequenceDiagram} diagram
 * @param {object} ctx
 * @param {string} ctx.sourceLabel
 * @param {Record<string, Function>} ctx.primitives
 *        Bag of primitive factories: `rect`, `text`, `arrow`,
 *        `ellipse`, `line` (provided by the parent renderer).
 * @returns {object}             An Excalidraw JSON document.
 * @internal
 */
export function exportSequenceDiagram(diagram, { sourceLabel, primitives }) {
  const { rect, text, arrow, ellipse, line } = primitives;
  /** @type {any[]} */
  const elements = [];
  const style = sequenceStyle(diagram.style);

  for (const group of diagram.participantGroups) {
    renderParticipantGroup(group, elements, { rect, text });
  }

  // Title sits above participant group boxes in z-order so it is never
  // obscured by a `box` frame that shares the top margin area.
  if (diagram.title) {
    elements.push(
      text({
        x: 20,
        y: 16,
        width: diagram.width - 40,
        height: 30,
        value: diagram.title,
        fontSize: FONT.sizePlaneTitle,
        color: HEAD_STROKE,
        align: "center",
      }),
    );
  }

  // Combined fragment frames sit behind lifelines and messages.
  for (const fragment of diagram.fragments) {
    renderFragment(fragment, elements, { rect, text, line });
  }

  for (const marker of diagram.markers) {
    renderMarker(marker, elements, { rect, text, line });
  }

  for (const ref of diagram.references) {
    renderReference(ref, elements, { rect, text });
  }

  // Participant heads
  for (const p of diagram.participants) {
    if (p.shape === "actor") renderActorHead(p, elements, { line, ellipse, text }, style);
    else renderParticipantHead(p, elements, { rect, text, ellipse, line }, style);
  }

  // Lifelines intentionally enter the lower part of participant heads.
  for (const p of diagram.participants) {
    const lifelineStart =
      p.shape === "actor" ? p.headY + p.headHeight : p.headY + p.headHeight - LIFELINE_HEAD_OVERLAP;
    const lifeline = line({
      points: [
        { x: p.x, y: lifelineStart },
        { x: p.x, y: p.lifelineBottom },
      ],
      strokeColor: style.lifelineColor,
      dashed: true,
      strokeWidth: 1,
    });
    lifeline.customData = { role: "sequenceLifeline", participantId: p.id };
    elements.push(lifeline);
  }

  for (const activation of diagram.activations) {
    renderActivation(activation, elements, { rect });
  }

  // Tail boxes mirror heads at the bottom and sit above lifelines.
  for (const p of diagram.participants) {
    if (p.shape !== "actor" && !p.destroyY) {
      const tail = /** @type {any} */ ({
        ...p,
        headY: p.lifelineBottom - p.headHeight,
        isTail: true,
      });
      renderParticipantHead(tail, elements, { rect, text, ellipse, line }, style);
    }
  }

  // Notes
  for (const n of diagram.notes) {
    elements.push(
      rect({
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
        strokeColor: NOTE_STROKE,
        backgroundColor: NOTE_FILL,
      }),
    );
    elements.push(
      text({
        x: n.x + 8,
        y: n.y + 8,
        width: n.width - 16,
        height: n.height - 16,
        value: n.text,
        fontSize: FONT.sizeDescription,
        color: "#000",
      }),
    );
  }

  // Messages
  for (const m of diagram.messages) {
    if (m.isSelf) {
      renderSelfMessage(m, elements, { arrow, text }, style);
    } else {
      renderMessage(m, elements, { arrow, text }, style);
    }
  }

  for (const p of diagram.participants) {
    if (p.destroyY) renderDestroyMarker(p, elements, { line });
  }

  return {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
      name: sourceLabel,
    },
    files: {},
  };
}

/**
 * Render a participant grouping box declared by `box ... end box`.
 * @param {import("../model/diagram.mjs").SequenceParticipantGroup} group Group metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderParticipantGroup(group, elements, { rect, text }) {
  if (!group.width || !group.height) return;
  const frame = rect({
    x: group.x,
    y: group.y,
    width: group.width,
    height: group.height,
    strokeColor: "#94a3b8",
    backgroundColor: sequenceColor(group.color, "#f8fafc"),
  });
  frame.roughness = 0;
  frame.strokeWidth = 1;
  frame.customData = { role: "sequenceParticipantGroup", groupId: group.id };
  elements.push(frame);
  if (group.label) {
    const label = text({
      x: group.x + 8,
      y: group.y + 4,
      width: group.width - 16,
      height: FONT.sizeDescription * FONT.lineHeight,
      value: group.label,
      fontSize: FONT.sizeDescription,
      color: "#334155",
    });
    label.customData = { role: "sequenceParticipantGroupLabel", groupId: group.id };
    elements.push(label);
  }
}

/**
 * Render dividers, delays, and spacing markers.
 * @param {import("../model/diagram.mjs").SequenceMarker} marker Marker metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderMarker(marker, elements, { rect, text, line }) {
  if (marker.kind === "space") return;
  if (marker.kind === "divider") {
    const band = rect({
      x: marker.x,
      y: marker.y,
      width: marker.width,
      height: marker.height,
      strokeColor: DIVIDER_STROKE,
      backgroundColor: DIVIDER_FILL,
    });
    band.roughness = 0;
    band.strokeWidth = 1;
    band.customData = { role: "sequenceDivider", markerId: marker.id };
    elements.push(band);
    if (marker.label) {
      const label = text({
        x: marker.x + 8,
        y: marker.y + 6,
        width: marker.width - 16,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: marker.label,
        fontSize: FONT.sizeDescription,
        color: DIVIDER_STROKE,
        align: "center",
      });
      label.customData = { role: "sequenceDividerText", markerId: marker.id };
      elements.push(label);
    }
    return;
  }
  const y = marker.y + marker.height / 2;
  const delay = line({
    points: [
      { x: marker.x, y },
      { x: marker.x + marker.width, y },
    ],
    strokeColor: DELAY_STROKE,
    dashed: true,
    strokeWidth: 1,
  });
  delay.customData = { role: "sequenceDelay", markerId: marker.id };
  elements.push(delay);
  if (marker.label) {
    const label = text({
      x: marker.x,
      y: marker.y + 4,
      width: marker.width,
      height: FONT.sizeDescription * FONT.lineHeight,
      value: marker.label,
      fontSize: FONT.sizeDescription,
      color: DELAY_STROKE,
      align: "center",
    });
    label.customData = { role: "sequenceDelayText", markerId: marker.id };
    elements.push(label);
  }
}

/**
 * Render a `ref over` frame.
 * @param {import("../model/diagram.mjs").SequenceReference} ref Reference metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderReference(ref, elements, { rect, text }) {
  const frame = rect({
    x: ref.x,
    y: ref.y,
    width: ref.width,
    height: ref.height,
    strokeColor: REFERENCE_STROKE,
    backgroundColor: REFERENCE_FILL,
  });
  frame.roughness = 0;
  frame.strokeWidth = 1;
  frame.customData = { role: "sequenceReference", referenceId: ref.id };
  elements.push(frame);
  const tab = rect({
    x: ref.x,
    y: ref.y,
    width: 42,
    height: 22,
    strokeColor: REFERENCE_HEADER,
    backgroundColor: REFERENCE_HEADER,
  });
  tab.roughness = 0;
  tab.strokeWidth = 1;
  tab.customData = { role: "sequenceReferenceHeader", referenceId: ref.id };
  elements.push(tab);
  elements.push(
    text({
      x: ref.x + 8,
      y: ref.y + 3,
      width: 30,
      height: FONT.sizeDescription * FONT.lineHeight,
      value: "ref",
      fontSize: FONT.sizeDescription,
      color: "#ffffff",
    }),
  );
  const label = text({
    x: ref.x + 12,
    y: ref.y + 28,
    width: ref.width - 24,
    height: ref.height - 34,
    value: ref.wrappedLabel || ref.label,
    fontSize: FONT.sizeDescription,
    color: "#334155",
    align: "center",
  });
  label.customData = { role: "sequenceReferenceText", referenceId: ref.id };
  elements.push(label);
}

/**
 * Render a UML combined fragment frame.
 * @param {import("../model/diagram.mjs").SequenceFragment} fragment Fragment metadata.
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderFragment(fragment, elements, { rect, text, line }) {
  const colors = fragmentColors(fragment.kind);
  const frame = rect({
    x: fragment.x,
    y: fragment.y,
    width: fragment.width,
    height: fragment.height,
    strokeColor: colors.stroke,
    backgroundColor: colors.fill,
  });
  frame.roughness = 0;
  frame.strokeWidth = 1;
  frame.customData = { role: "sequenceFragmentFrame", kind: fragment.kind };
  elements.push(frame);

  const header = `${fragment.kind}${fragment.label ? ` ${fragment.label}` : ""}`;
  const headerWidth = Math.min(
    Math.max(42, fragment.width - 12),
    260,
    Math.max(42, header.length * FONT.sizeDescription * 0.58 + 18),
  );
  const tab = rect({
    x: fragment.x,
    y: fragment.y,
    width: headerWidth,
    height: 22,
    strokeColor: colors.header,
    backgroundColor: colors.header,
  });
  tab.roughness = 0;
  tab.strokeWidth = 1;
  tab.customData = { role: "sequenceFragmentHeader", kind: fragment.kind };
  elements.push(tab);
  const headerText = text({
    x: fragment.x + 6,
    y: fragment.y + 3,
    width: headerWidth - 12,
    height: FONT.sizeDescription * FONT.lineHeight,
    value: header,
    fontSize: FONT.sizeDescription,
    color: "#ffffff",
  });
  headerText.customData = { role: "sequenceFragmentHeaderText", kind: fragment.kind };
  elements.push(headerText);

  for (const operand of fragment.operands.slice(1)) {
    const y = operand.y ?? fragment.y + 28;
    const separator = line({
      points: [
        { x: fragment.x, y },
        { x: fragment.x + fragment.width, y },
      ],
      strokeColor: colors.stroke,
      dashed: true,
      strokeWidth: 1,
    });
    separator.customData = { role: "sequenceFragmentOperandSeparator", kind: fragment.kind };
    elements.push(separator);
    if (operand.label) {
      const operandText = text({
        x: fragment.x + 8,
        y: y + 4,
        width: fragment.width - 16,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: operand.label,
        fontSize: FONT.sizeDescription,
        color: colors.stroke,
      });
      operandText.customData = { role: "sequenceFragmentOperandText", kind: fragment.kind };
      elements.push(operandText);
    }
  }
}

/**
 * @param {string} kind Fragment kind.
 * @returns {{stroke:string,fill:string,header:string}} Fragment colour set.
 */
function fragmentColors(kind) {
  return FRAGMENT_COLORS[kind] ?? FRAGMENT_COLORS.group;
}

/**
 * @param {import("../model/diagram.mjs").SequenceDiagram["style"]} rawStyle Parsed style values.
 * @returns {{arrowColor:string,participantBackgroundColor:string,participantBorderColor:string,lifelineColor:string}}
 */
function sequenceStyle(rawStyle) {
  return {
    arrowColor: sequenceColor(rawStyle.arrowColor, "#1f2933"),
    participantBackgroundColor: sequenceColor(rawStyle.participantBackgroundColor, ""),
    participantBorderColor: sequenceColor(rawStyle.participantBorderColor, ""),
    lifelineColor: sequenceColor(rawStyle.lifelineColor, LIFELINE_STROKE),
  };
}

/**
 * @param {import("../model/diagram.mjs").Participant} p Lifeline metadata.
 * @param {{participantBackgroundColor:string,participantBorderColor:string}} style Diagram style.
 * @returns {{stroke:string,fill:string}} Deterministic pastel head colours.
 */
function participantColors(p, style) {
  if (p.color) {
    return {
      fill: sequenceColor(p.color, "#f5f7fa"),
      stroke: style.participantBorderColor || "#1f2933",
    };
  }
  const hash = stableHash32(`${p.id}|${p.title}|${p.shape}`);
  const hue = hash % 360;
  const saturation = 38 + ((hash >>> 8) % 14);
  return {
    fill: style.participantBackgroundColor || hslToHex(hue, saturation, 91),
    stroke: style.participantBorderColor || hslToHex(hue, Math.min(58, saturation + 12), 36),
  };
}

/**
 * @param {number} hue Hue in degrees.
 * @param {number} saturation Saturation percentage.
 * @param {number} lightness Lightness percentage.
 * @returns {string} Hex colour.
 */
function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (/** @type {number} */ n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (/** @type {number} */ value) =>
    Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * @param {string} color PlantUML-ish colour token.
 * @param {string} fallback Fallback CSS colour.
 * @returns {string} CSS-safe colour token.
 */
function sequenceColor(color, fallback) {
  if (!color) return fallback;
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) return color;
  const named = color.replace(/^#/, "").toLowerCase();
  const palette = /** @type {Record<string, string>} */ ({
    lightblue: "#dbeafe",
    lightgreen: "#dcfce7",
    lightyellow: "#fef9c3",
    lightpink: "#fce7f3",
    lightgray: "#f1f5f9",
    lightgrey: "#f1f5f9",
  });
  return palette[named] || fallback;
}

/**
 * Render a lifeline activation bar.
 * @param {import("../model/diagram.mjs").SequenceActivation} activation Activation metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderActivation(activation, elements, { rect }) {
  const fill = sequenceColor(activation.color, ACTIVATION_FILL);
  const bar = rect({
    x: activation.x,
    y: activation.y,
    width: activation.width,
    height: activation.height,
    strokeColor: ACTIVATION_STROKE,
    backgroundColor: fill,
  });
  bar.roughness = 0;
  bar.strokeWidth = 1;
  bar.customData = {
    role: "sequenceActivation",
    participantId: activation.participant.id,
    activationId: activation.id,
  };
  elements.push(bar);
}

/**
 * Render a PlantUML destroy marker at the end of a lifeline.
 * @param {import("../model/diagram.mjs").Participant} participant Lifeline metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderDestroyMarker(participant, elements, { line }) {
  const size = 16;
  const x = participant.x;
  const y = participant.destroyY;
  for (const points of [
    [
      { x: x - size / 2, y: y - size / 2 },
      { x: x + size / 2, y: y + size / 2 },
    ],
    [
      { x: x + size / 2, y: y - size / 2 },
      { x: x - size / 2, y: y + size / 2 },
    ],
  ]) {
    const marker = line({ points, strokeColor: "#991b1b", strokeWidth: 2 });
    marker.customData = { role: "sequenceDestroyMarker", participantId: participant.id };
    elements.push(marker);
  }
}

/** @internal */
/**
 * Render a single participant head (rectangle + label) and its lifeline.
 * @param {import("../model/diagram.mjs").Participant} p Lifeline metadata (positioned).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories injected by the caller (`rect`, `text`).
 * @param {{participantBackgroundColor:string,participantBorderColor:string}} style Diagram style.
 * @returns {void}
 */
function renderParticipantHead(p, elements, { rect, text }, style) {
  const x = p.x - p.headWidth / 2;
  const colors = participantColors(p, style);
  const isTail = Boolean(/** @type {any} */ (p).isTail);
  const head = rect({
    x,
    y: p.headY,
    width: p.headWidth,
    height: p.headHeight,
    strokeColor: colors.stroke,
    backgroundColor: colors.fill,
  });
  head.customData = {
    role: isTail ? "sequenceParticipantTail" : "sequenceParticipantHead",
    participantId: p.id,
  };
  elements.push(head);
  if (p.stereotype) {
    elements.push(
      text({
        x,
        y: p.headY + 4,
        width: p.headWidth,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: `«${p.stereotype}»`,
        fontSize: FONT.sizeDescription,
        color: HEAD_STROKE,
        align: "center",
      }),
    );
  }
  const titleLines = String(p.title).split("\n").length;
  const th = FONT.sizeTitle * FONT.lineHeight * titleLines;
  elements.push(
    text({
      x,
      y: p.headY + (p.headHeight - th) / 2 + (p.stereotype ? 6 : 0),
      width: p.headWidth,
      height: th,
      value: p.title,
      fontSize: FONT.sizeTitle,
      color: HEAD_STROKE,
      align: "center",
    }),
  );
}

/** @internal */
/**
 * Render a stick-figure actor head and its lifeline.
 * @param {import("../model/diagram.mjs").Participant} p Lifeline metadata (positioned).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`line`, `ellipse`, `text`).
 * @param {{participantBackgroundColor:string,participantBorderColor:string}} style Diagram style.
 * @returns {void}
 */
function renderActorHead(p, elements, { line, ellipse, text }, style) {
  const cx = p.x;
  const top = p.headY + 4;
  const headD = 22;
  const bodyTop = top + headD;
  const bodyBottom = bodyTop + 22;
  const colors = participantColors(p, style);
  elements.push(
    ellipse({
      x: cx - headD / 2,
      y: top,
      width: headD,
      height: headD,
      strokeColor: colors.stroke,
      backgroundColor: colors.fill,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyTop },
        { x: cx, y: bodyBottom },
      ],
      strokeColor: colors.stroke,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx - 12, y: bodyTop + 6 },
        { x: cx + 12, y: bodyTop + 6 },
      ],
      strokeColor: colors.stroke,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx - 10, y: bodyBottom + 12 },
      ],
      strokeColor: colors.stroke,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx + 10, y: bodyBottom + 12 },
      ],
      strokeColor: colors.stroke,
    }),
  );
  // Label below
  const labelY = bodyBottom + 18;
  elements.push(
    text({
      x: cx - p.headWidth / 2,
      y: labelY,
      width: p.headWidth,
      height: FONT.sizeTitle * FONT.lineHeight,
      value: p.title,
      fontSize: FONT.sizeTitle,
      color: colors.stroke,
      align: "center",
    }),
  );
}

/** @internal */
/**
 * Render a horizontal message arrow + label between two lifelines.
 * @param {import("../model/diagram.mjs").Message} m Message metadata.
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`arrow`, `text`).
 * @param {{arrowColor:string}} style Diagram style.
 * @returns {void}
 */
function renderMessage(m, elements, { arrow, text }, style) {
  const a = arrow({
    points: [
      { x: m.from.x, y: m.y },
      { x: m.to.x, y: m.y },
    ],
    strokeColor: style.arrowColor,
    dashed: m.dashed,
    startArrowhead: m.startArrowhead ?? null,
    endArrowhead: m.endArrowhead ?? "arrow",
  });
  if (a) {
    a.customData = {
      role: "sequenceMessage",
      messageId: m.id,
      creates: m.creates,
      destroys: m.destroys,
      lifecycle: m.lifecycle,
    };
    elements.push(a);
  }
  if (m.label || m.number) {
    const x1 = Math.min(m.from.x, m.to.x);
    const x2 = Math.max(m.from.x, m.to.x);
    const labelWidth = Math.min(x2 - x1, Math.max(20, m.labelWidth || x2 - x1));
    const labelHeight = m.labelHeight || FONT.sizeDescription * FONT.lineHeight;
    const label = text({
      x: (x1 + x2) / 2 - labelWidth / 2,
      y: m.y - labelHeight - 2,
      width: labelWidth,
      height: labelHeight,
      value: m.wrappedLabel || messageLabelText(m),
      fontSize: m.labelFontSize || FONT.sizeDescription,
      color: "#222",
      align: "center",
    });
    label.customData = { role: "sequenceMessageLabel", messageId: m.id };
    elements.push(label);
  }
}

/** @internal */
/**
 * Render a self-message loop (arrow returning to the same lifeline).
 * @param {import("../model/diagram.mjs").Message} m Message metadata (m.from === m.to).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`arrow`, `text`).
 * @param {{arrowColor:string}} style Diagram style.
 * @returns {void}
 */
function renderSelfMessage(m, elements, { arrow, text }, style) {
  const x = m.from.x;
  const off = 30;
  const a = arrow({
    points: [
      { x, y: m.y },
      { x: x + off, y: m.y },
      { x: x + off, y: m.y + 24 },
      { x, y: m.y + 24 },
    ],
    strokeColor: style.arrowColor,
    dashed: m.dashed,
    startArrowhead: null,
    endArrowhead: m.endArrowhead ?? "arrow",
  });
  if (a) {
    a.customData = {
      role: "sequenceMessage",
      messageId: m.id,
      creates: m.creates,
      destroys: m.destroys,
      lifecycle: m.lifecycle,
    };
    elements.push(a);
  }
  if (m.label || m.number) {
    const label = text({
      x: x + off + 6,
      y: m.y + 4,
      width: m.labelWidth || 200,
      height: m.labelHeight || FONT.sizeDescription * FONT.lineHeight,
      value: m.wrappedLabel || messageLabelText(m),
      fontSize: m.labelFontSize || FONT.sizeDescription,
      color: "#222",
    });
    label.customData = { role: "sequenceMessageLabel", messageId: m.id };
    elements.push(label);
  }
}

/**
 * @param {import("../model/diagram.mjs").Message} message Message metadata.
 * @returns {string} Label text including autonumber prefix.
 */
function messageLabelText(message) {
  const label = String(message.label || "");
  return message.number ? `${message.number}${label ? ` ${label}` : ""}` : label;
}
