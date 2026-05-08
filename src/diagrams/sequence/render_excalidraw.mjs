// Sequence-diagram → Excalidraw renderer.
//
// Receives the same primitive helpers (rect/text/arrow/ellipse/line)
// as the component renderer so id/seed/version generation stays in
// one place.

import { FONT } from "../../general/style/text.mjs";
import { stableHash32 } from "../../general/render/rng.mjs";

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
const SELF_LOOP_HEIGHT = 24;

/**
 * Render a SequenceDiagram into an Excalidraw JSON document.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram Sequence diagram.
 * @param {object} ctx Render context.
 * @param {string} ctx.sourceLabel Source label for app state.
 * @param {Record<string, Function>} ctx.primitives Excalidraw primitive factories.
 * @returns {object} Excalidraw JSON document.
 */
export function exportSequenceDiagram(diagram, { sourceLabel, primitives }) {
  const { rect, text, arrow, ellipse, line } = primitives;
  /** @type {any[]} */
  const elements = [];
  const style = sequenceStyle(diagram.style);

  for (const group of diagram.participantGroups) {
    renderParticipantGroup(group, elements, { rect, text }, style);
  }

  for (const fragment of diagram.fragments) {
    renderFragmentFill(fragment, elements, { rect }, style);
  }
  for (const ref of diagram.references) {
    renderReferenceFill(ref, elements, { rect });
  }

  for (const p of diagram.participants) {
    if (p.shape === "actor") renderActorHead(p, elements, { rect, line, ellipse, text }, style);
    else renderParticipantHead(p, elements, { rect, text, ellipse, line }, style);
  }

  for (const p of diagram.participants) {
    const lifelineStart =
      p.shape === "actor" ? p.headY + p.headHeight : p.headY + p.headHeight - LIFELINE_HEAD_OVERLAP;
    const lifeline = line({
      points: [
        { x: p.x, y: lifelineStart },
        { x: p.x, y: p.lifelineBottom },
      ],
      strokeColor: style.lifelineColor,
      dashed: style.lifelineStyle !== "solid",
      strokeWidth: 1,
    });
    lifeline.customData = { role: "sequenceLifeline", participantId: p.id };
    elements.push(lifeline);
  }

  for (const activation of diagram.activations) {
    renderActivation(activation, elements, { rect }, style);
  }

  for (const fragment of diagram.fragments) {
    renderFragmentBorder(fragment, elements, { rect, text, line }, style);
  }
  for (const ref of diagram.references) {
    renderReferenceBorder(ref, elements, { rect, text });
  }

  for (const marker of diagram.markers) {
    renderMarker(marker, elements, { rect, text, line }, style);
  }

  for (const p of diagram.participants) {
    if (diagram.showFootbox && p.shape !== "actor" && !p.destroyY) {
      const tail = /** @type {any} */ ({
        ...p,
        headY: p.lifelineBottom - p.headHeight,
        isTail: true,
      });
      renderParticipantHead(tail, elements, { rect, text, ellipse, line }, style);
    }
  }

  for (const n of diagram.notes) {
    const note = rect({
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      strokeColor: style.noteBorderColor,
      backgroundColor: sequenceColor(n.color || style.noteBackgroundColor, NOTE_FILL),
    });
    note.customData = { role: "sequenceNote", noteId: n.id, shape: n.shape };
    elements.push(note);
    const noteText = text({
      x: n.x + 8,
      y: n.y + 8,
      width: n.width - 16,
      height: n.height - 16,
      value: n.text,
      fontSize: FONT.sizeDescription,
      color: style.noteFontColor,
    });
    noteText.customData = { role: "sequenceNoteText", noteId: n.id, shape: n.shape };
    elements.push(noteText);
  }

  for (const m of diagram.messages) {
    if (m.isSelf) renderSelfMessage(m, elements, { arrow, text }, style);
    else renderMessage(m, elements, { arrow, text }, style);
  }

  for (const p of diagram.participants) {
    if (p.destroyY) renderDestroyMarker(p, elements, { line });
  }

  renderSequenceFrame(diagram, elements, { rect, text });
  renderHeaderFooter(diagram, elements, { text });

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
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram Sequence diagram.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderHeaderFooter(diagram, elements, { text }) {
  if (diagram.header) {
    const headerHeight = blockHeight(diagram.header, FONT.sizeDescription);
    const headerY = headerStartY(diagram);
    const header = text({
      x: 20,
      y: headerY,
      width: diagram.width - 40,
      height: headerHeight,
      value: diagram.header,
      fontSize: FONT.sizeDescription,
      color: HEAD_STROKE,
      align: "center",
    });
    header.customData = { role: "sequenceHeader" };
    elements.push(header);
  }

  if (diagram.footer) {
    const footerHeight = blockHeight(diagram.footer, FONT.sizeDescription);
    const footer = text({
      x: 20,
      y: Math.max(20, diagram.height - footerHeight - 20),
      width: diagram.width - 40,
      height: footerHeight,
      value: diagram.footer,
      fontSize: FONT.sizeDescription,
      color: HEAD_STROKE,
      align: "center",
    });
    footer.customData = { role: "sequenceFooter" };
    elements.push(footer);
  }
}

/**
 * Render a PlantUML `mainframe` as a light outer frame around the single
 * Excalidraw canvas.
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram} diagram Sequence diagram.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderSequenceFrame(diagram, elements, { rect, text }) {
  if (!diagram.mainframe) return;
  const frame = rect({
    x: 8,
    y: 8,
    width: Math.max(80, diagram.width - 16),
    height: Math.max(80, diagram.height - 16),
    strokeColor: "#64748b",
    backgroundColor: "transparent",
  });
  frame.roughness = 0;
  frame.strokeWidth = 1;
  frame.customData = { role: "sequenceMainframe" };
  elements.push(frame);
  const label = text({
    x: 18,
    y: 8,
    width: Math.min(240, Math.max(80, diagram.width - 36)),
    height: FONT.sizeDescription * FONT.lineHeight,
    value: diagram.mainframe,
    fontSize: FONT.sizeDescription,
    color: "#334155",
  });
  label.customData = { role: "sequenceMainframeLabel" };
  elements.push(label);
}

/**
 * Render a participant grouping box declared by `box ... end box`.
 * @param {import("../../general/model/diagram.mjs").SequenceParticipantGroup} group Group metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @param {{groupBackgroundColor:string,groupBorderColor:string,groupFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderParticipantGroup(group, elements, { rect, text }, style) {
  if (!group.width || !group.height) return;
  const frame = rect({
    x: group.x,
    y: group.y,
    width: group.width,
    height: group.height,
    strokeColor: style.groupBorderColor,
    backgroundColor: sequenceColor(group.color, style.groupBackgroundColor),
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
      color: style.groupFontColor,
    });
    label.customData = { role: "sequenceParticipantGroupLabel", groupId: group.id };
    elements.push(label);
  }
}

/**
 * Render dividers, delays, and spacing markers.
 * @param {import("../../general/model/diagram.mjs").SequenceMarker} marker Marker metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @param {{dividerColor:string}} style Diagram style.
 * @returns {void}
 */
function renderMarker(marker, elements, { rect, text, line }, style) {
  if (marker.kind === "space") return;
  if (marker.kind === "divider" || marker.kind === "pageBreak") {
    // Render as two horizontal solid lines (top + bottom) with the label
    // centred between them. Using lines rather than a filled rectangle keeps
    // the divider visually lightweight and avoids conflicts with activation
    // bars that span across the separator area.
    for (const lineY of [marker.y, marker.y + marker.height]) {
      const divLine = line({
        points: [
          { x: marker.x, y: lineY },
          { x: marker.x + marker.width, y: lineY },
        ],
        strokeColor: style.dividerColor,
        strokeWidth: 1,
      });
      divLine.roughness = 0;
      divLine.customData = {
        role: marker.kind === "pageBreak" ? "sequencePageBreak" : "sequenceDivider",
        markerId: marker.id,
      };
      elements.push(divLine);
    }
    if (marker.label) {
      const labelY = marker.y + (marker.height - FONT.sizeDescription * FONT.lineHeight) / 2;
      const label = text({
        x: marker.x + 8,
        y: labelY,
        width: marker.width - 16,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: marker.label,
        fontSize: FONT.sizeDescription,
        color: style.dividerColor,
        align: "center",
      });
      label.customData = {
        role: marker.kind === "pageBreak" ? "sequencePageBreakText" : "sequenceDividerText",
        markerId: marker.id,
      };
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
    strokeColor: style.dividerColor || DELAY_STROKE,
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
      color: style.dividerColor || DELAY_STROKE,
      align: "center",
    });
    label.customData = { role: "sequenceDelayText", markerId: marker.id };
    elements.push(label);
  }
}

/**
 * Render only the background fill of a `ref over` frame (fill pass —
 * rendered before lifelines so the fill sits behind the dashed lines).
 * @param {import("../../general/model/diagram.mjs").SequenceReference} ref Reference metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderReferenceFill(ref, elements, { rect }) {
  const fill = rect({
    x: ref.x,
    y: ref.y,
    width: ref.width,
    height: ref.height,
    strokeColor: "transparent",
    backgroundColor: REFERENCE_FILL,
  });
  fill.roughness = 0;
  fill.strokeWidth = 0;
  fill.customData = { role: "sequenceReferenceFill", referenceId: ref.id };
  elements.push(fill);
}

/**
 * Render the border, header tab, and label of a `ref over` frame
 * (border pass — rendered after lifelines so the frame sits on top).
 * @param {import("../../general/model/diagram.mjs").SequenceReference} ref Reference metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @returns {void}
 */
function renderReferenceBorder(ref, elements, { rect, text }) {
  const frame = rect({
    x: ref.x,
    y: ref.y,
    width: ref.width,
    height: ref.height,
    strokeColor: REFERENCE_STROKE,
    backgroundColor: "transparent",
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
    height: ref.height - 40,
    value: ref.wrappedLabel || ref.label,
    fontSize: FONT.sizeDescription,
    color: "#334155",
    align: "center",
  });
  label.customData = { role: "sequenceReferenceText", referenceId: ref.id };
  elements.push(label);
}

/**
 * Render only the background fill of a combined fragment (fill pass —
 * rendered before lifelines so the fill sits behind the dashed lines).
 * @param {import("../../general/model/diagram.mjs").SequenceFragment} fragment Fragment metadata.
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories.
 * @param {{groupBackgroundColor:string,groupBorderColor:string,groupFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderFragmentFill(fragment, elements, { rect }, style) {
  if (!fragment.width || !fragment.height) return;
  const colors = fragmentColors(fragment, style);
  const fill = rect({
    x: fragment.x,
    y: fragment.y,
    width: fragment.width,
    height: fragment.height,
    strokeColor: "transparent",
    backgroundColor: colors.fill,
  });
  fill.roughness = 0;
  fill.strokeWidth = 0;
  fill.customData = { role: "sequenceFragmentFrame", kind: fragment.kind };
  elements.push(fill);
}

/**
 * Render the border, header tab, labels, and operand separators of a
 * combined fragment (border pass — rendered after lifelines so the frame
 * sits on top and its border visibly overlaps the lifeline dashes).
 * @param {import("../../general/model/diagram.mjs").SequenceFragment} fragment Fragment metadata.
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories.
 * @param {{groupBackgroundColor:string,groupBorderColor:string,groupFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderFragmentBorder(fragment, elements, { rect, text, line }, style) {
  if (!fragment.width || !fragment.height) return;
  const colors = fragmentColors(fragment, style);
  const frame = rect({
    x: fragment.x,
    y: fragment.y,
    width: fragment.width,
    height: fragment.height,
    strokeColor: colors.stroke,
    backgroundColor: "transparent",
  });
  frame.roughness = 0;
  frame.strokeWidth = 1;
  frame.customData = { role: "sequenceFragmentBorder", kind: fragment.kind };
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

  if (fragment.secondaryLabel) {
    const secondaryText = text({
      x: fragment.x + headerWidth + 8,
      y: fragment.y + 3,
      width: Math.max(40, fragment.width - headerWidth - 16),
      height: FONT.sizeDescription * FONT.lineHeight,
      value: fragment.secondaryLabel,
      fontSize: FONT.sizeDescription,
      color: colors.stroke,
    });
    secondaryText.customData = { role: "sequenceFragmentSecondaryText", kind: fragment.kind };
    elements.push(secondaryText);
  }

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
 * @param {import("../../general/model/diagram.mjs").SequenceFragment} fragment Fragment metadata.
 * @param {{groupBackgroundColor:string,groupBorderColor:string,groupFontColor:string}} style Diagram style.
 * @returns {{stroke:string,fill:string,header:string}} Fragment colour set.
 */
function fragmentColors(fragment, style) {
  const base =
    fragment.kind === "group"
      ? {
          stroke: style.groupBorderColor,
          fill: style.groupBackgroundColor,
          header: style.groupBorderColor,
        }
      : (FRAGMENT_COLORS[fragment.kind] ?? FRAGMENT_COLORS.group);
  if (!fragment.color) return base;
  const fill = sequenceColor(fragment.color, base.fill);
  return { stroke: base.stroke, fill, header: base.header };
}

/**
 * @param {import("../../general/model/diagram.mjs").SequenceDiagram["style"]} rawStyle Parsed style values.
 * @returns {{arrowColor:string,messageFontColor:string,messageAlign:string,responseMessageBelowArrow:string,participantBackgroundColor:string,participantBorderColor:string,participantFontColor:string,lifelineColor:string,lifelineStyle:string,actorStyle:string,noteBackgroundColor:string,noteBorderColor:string,noteFontColor:string,groupBackgroundColor:string,groupBorderColor:string,groupFontColor:string,dividerColor:string,activationColor:string}}
 */
function sequenceStyle(rawStyle) {
  return {
    arrowColor: sequenceColor(rawStyle.arrowColor, "#1f2933"),
    messageFontColor: sequenceColor(rawStyle.messageFontColor, "#222"),
    messageAlign: rawStyle.messageAlign || "center",
    responseMessageBelowArrow: rawStyle.responseMessageBelowArrow === "true" ? "true" : "false",
    participantBackgroundColor: sequenceColor(rawStyle.participantBackgroundColor, ""),
    participantBorderColor: sequenceColor(rawStyle.participantBorderColor, ""),
    participantFontColor: sequenceColor(rawStyle.participantFontColor, ""),
    lifelineColor: sequenceColor(rawStyle.lifelineColor, LIFELINE_STROKE),
    lifelineStyle: rawStyle.lifelineStyle === "solid" ? "solid" : "dashed",
    actorStyle: rawStyle.actorStyle || "stick",
    noteBackgroundColor: sequenceColor(rawStyle.noteBackgroundColor, NOTE_FILL),
    noteBorderColor: sequenceColor(rawStyle.noteBorderColor, NOTE_STROKE),
    noteFontColor: sequenceColor(rawStyle.noteFontColor, "#000"),
    groupBackgroundColor: sequenceColor(rawStyle.groupBackgroundColor, "#f8fafc"),
    groupBorderColor: sequenceColor(rawStyle.groupBorderColor, "#94a3b8"),
    groupFontColor: sequenceColor(rawStyle.groupFontColor, "#334155"),
    dividerColor: sequenceColor(rawStyle.dividerColor, DIVIDER_STROKE),
    activationColor: sequenceColor(rawStyle.activationColor, ACTIVATION_FILL),
  };
}

/**
 * @param {import("../../general/model/diagram.mjs").Participant} p Lifeline metadata.
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
    aqua: "#00ffff",
    black: "#000000",
    blue: "#0000ff",
    darksalmon: "#e9967a",
    deepskyblue: "#00bfff",
    dodgerblue: "#1e90ff",
    gold: "#ffd700",
    green: "#008000",
    lightblue: "#dbeafe",
    lightgray: "#f1f5f9",
    lightgrey: "#f1f5f9",
    lightgreen: "#dcfce7",
    lightpink: "#fce7f3",
    lightyellow: "#fef9c3",
    pink: "#ffc0cb",
    purple: "#800080",
    red: "#ff0000",
    white: "#ffffff",
  });
  return palette[named] || fallback;
}

/**
 * Render a lifeline activation bar.
 * @param {import("../../general/model/diagram.mjs").SequenceActivation} activation Activation metadata.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @param {{activationColor:string}} style Diagram style.
 * @returns {void}
 */
function renderActivation(activation, elements, { rect }, style) {
  const fill = sequenceColor(activation.color, style.activationColor);
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
 * @param {import("../../general/model/diagram.mjs").Participant} participant Lifeline metadata.
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
 * @param {import("../../general/model/diagram.mjs").Participant} p Lifeline metadata (positioned).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories injected by the caller (`rect`, `text`).
 * @param {{participantBackgroundColor:string,participantBorderColor:string,participantFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderParticipantHead(p, elements, { rect, text, ellipse, line }, style) {
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
        color: style.participantFontColor || HEAD_STROKE,
        align: "center",
      }),
    );
  }
  const symbolHeight = renderParticipantSymbol(
    p,
    elements,
    { rect, ellipse, line },
    colors,
    isTail,
  );
  const contentTop = p.headY + 6 + (p.stereotype ? 14 : 0) + symbolHeight;
  const contentBottom = p.headY + p.headHeight - 6;
  const contentHeight = Math.max(FONT.sizeTitle * FONT.lineHeight, contentBottom - contentTop);
  const titleLines = String(p.title).split("\n").length;
  const th = FONT.sizeTitle * FONT.lineHeight * titleLines;
  elements.push(
    text({
      x,
      y: contentTop + (contentHeight - th) / 2,
      width: p.headWidth,
      height: th,
      value: p.title,
      fontSize: FONT.sizeTitle,
      color: style.participantFontColor || HEAD_STROKE,
      align: "center",
    }),
  );
}

/**
 * Render a participant-type symbol in the head box for non-actor lifelines.
 * @param {import("../../general/model/diagram.mjs").Participant} p
 * @param {any[]} elements
 * @param {Record<string, Function>} prims
 * @param {{stroke:string,fill:string}} colors
 * @param {boolean} isTail
 * @returns {number}
 */
function renderParticipantSymbol(p, elements, { rect, ellipse, line }, colors, isTail) {
  if (isTail) return 0;
  if (!["boundary", "control", "entity", "database", "collections", "queue"].includes(p.shape)) {
    return 0;
  }

  const cx = p.x;
  const top = p.headY + 6;
  const stamp = (/** @type {any} */ el) => {
    if (!el) return;
    el.customData = {
      role: "sequenceParticipantSymbol",
      participantId: p.id,
      shape: p.shape,
    };
    elements.push(el);
  };

  if (p.shape === "boundary") {
    stamp(
      ellipse({
        x: cx - 8,
        y: top,
        width: 16,
        height: 16,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    stamp(
      line({
        points: [
          { x: cx + 10, y: top + 1 },
          { x: cx + 10, y: top + 15 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    return 18;
  }

  if (p.shape === "control") {
    stamp(
      ellipse({
        x: cx - 8,
        y: top,
        width: 16,
        height: 16,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    stamp(
      line({
        points: [
          { x: cx - 2, y: top + 8 },
          { x: cx + 5, y: top + 8 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    stamp(
      line({
        points: [
          { x: cx + 5, y: top + 8 },
          { x: cx + 2, y: top + 5 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    stamp(
      line({
        points: [
          { x: cx + 5, y: top + 8 },
          { x: cx + 2, y: top + 11 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    return 18;
  }

  if (p.shape === "entity") {
    stamp(
      rect({
        x: cx - 12,
        y: top,
        width: 24,
        height: 16,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    stamp(
      line({
        points: [
          { x: cx - 12, y: top + 5 },
          { x: cx + 12, y: top + 5 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 1.5,
      }),
    );
    return 18;
  }

  if (p.shape === "database") {
    stamp(
      ellipse({
        x: cx - 12,
        y: top,
        width: 24,
        height: 8,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    stamp(
      line({
        points: [
          { x: cx - 12, y: top + 4 },
          { x: cx - 12, y: top + 14 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 1.5,
      }),
    );
    stamp(
      line({
        points: [
          { x: cx + 12, y: top + 4 },
          { x: cx + 12, y: top + 14 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 1.5,
      }),
    );
    stamp(
      ellipse({
        x: cx - 12,
        y: top + 10,
        width: 24,
        height: 8,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    return 20;
  }

  if (p.shape === "collections") {
    stamp(
      rect({
        x: cx - 12,
        y: top + 2,
        width: 18,
        height: 12,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    stamp(
      rect({
        x: cx - 7,
        y: top,
        width: 18,
        height: 12,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    return 18;
  }

  if (p.shape === "queue") {
    stamp(
      ellipse({
        x: cx - 12,
        y: top,
        width: 24,
        height: 8,
        strokeColor: colors.stroke,
        backgroundColor: "transparent",
      }),
    );
    stamp(
      line({
        points: [
          { x: cx - 12, y: top + 4 },
          { x: cx + 12, y: top + 4 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 1.5,
      }),
    );
    stamp(
      line({
        points: [
          { x: cx - 2, y: top + 12 },
          { x: cx + 6, y: top + 12 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    stamp(
      line({
        points: [
          { x: cx + 6, y: top + 12 },
          { x: cx + 3, y: top + 9 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    stamp(
      line({
        points: [
          { x: cx + 6, y: top + 12 },
          { x: cx + 3, y: top + 15 },
        ],
        strokeColor: colors.stroke,
        strokeWidth: 2,
      }),
    );
    return 20;
  }

  return 0;
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

/** @internal */
/**
 * Render a stick-figure actor head and its lifeline.
 * @param {import("../../general/model/diagram.mjs").Participant} p Lifeline metadata (positioned).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`rect`, `line`, `ellipse`, `text`).
 * @param {{actorStyle:string,participantBackgroundColor:string,participantBorderColor:string,participantFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderActorHead(p, elements, { rect, line, ellipse, text }, style) {
  if (style.actorStyle === "box") {
    renderParticipantHead(p, elements, { rect, text, ellipse, line }, style);
    return;
  }
  const cx = p.x;
  const top = p.headY + 4;
  const headD = 22;
  const bodyTop = top + headD;
  const bodyBottom = bodyTop + 22;
  const colors = participantColors(p, style);
  const fill = style.actorStyle === "hollow" ? "#ffffff" : colors.fill;
  const stamp = (/** @type {any} */ el) => {
    if (!el) return;
    el.customData = {
      role: "sequenceParticipantSymbol",
      participantId: p.id,
      shape: "actor",
    };
    elements.push(el);
  };
  stamp(
    ellipse({
      x: cx - headD / 2,
      y: top,
      width: headD,
      height: headD,
      strokeColor: colors.stroke,
      backgroundColor: fill,
    }),
  );
  stamp(
    line({
      points: [
        { x: cx, y: bodyTop },
        { x: cx, y: bodyBottom },
      ],
      strokeColor: colors.stroke,
    }),
  );
  stamp(
    line({
      points: [
        { x: cx - 12, y: bodyTop + 6 },
        { x: cx + 12, y: bodyTop + 6 },
      ],
      strokeColor: colors.stroke,
    }),
  );
  stamp(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx - 10, y: bodyBottom + 12 },
      ],
      strokeColor: colors.stroke,
    }),
  );
  stamp(
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
      color: style.participantFontColor || colors.stroke,
      align: "center",
    }),
  );
}

/**
 * @param {string} align Message text alignment.
 * @param {number} x1 Left edge of the arrow span.
 * @param {number} x2 Right edge of the arrow span.
 * @param {number} width Label width.
 * @returns {number} Label x position.
 */
function messageLabelX(align, x1, x2, width) {
  if (align === "left") return x1;
  if (align === "right") return x2 - width;
  return (x1 + x2) / 2 - width / 2;
}

/**
 * @param {{responseMessageBelowArrow:string}} style Diagram style.
 * @param {import("../../general/model/diagram.mjs").Message} message Message metadata.
 * @returns {boolean} Whether the central label is rendered below the arrow.
 */
function messageLabelBelow(style, message) {
  return style.responseMessageBelowArrow === "true" && message.kind === "reply" && !message.isSelf;
}

/** @internal */
/**
 * Render a horizontal message arrow + label between two lifelines.
 * @param {import("../../general/model/diagram.mjs").Message} m Message metadata.
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`arrow`, `text`).
 * @param {{arrowColor:string,messageFontColor:string,messageAlign:string,responseMessageBelowArrow:string}} style Diagram style.
 * @returns {void}
 */
function renderMessage(m, elements, { arrow, text }, style) {
  const startX = m.startX ?? m.from.x;
  const endX = m.endX ?? m.to.x;
  const a = arrow({
    points: [
      { x: startX, y: m.y },
      { x: endX, y: m.y + m.arrow.line.slant },
    ],
    strokeColor: sequenceColor(m.color, style.arrowColor),
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
      arrow: {
        source: m.arrow.source,
        direction: m.arrow.direction,
        parallel: m.parallel,
        start: {
          head: m.arrow.start.head,
          anchor: m.arrow.start.anchor,
          label: m.arrow.start.label,
          size: m.arrow.start.size,
        },
        end: {
          head: m.arrow.end.head,
          anchor: m.arrow.end.anchor,
          label: m.arrow.end.label,
          size: m.arrow.end.size,
        },
        line: { style: m.arrow.line.style, color: m.arrow.line.color, slant: m.arrow.line.slant },
      },
    };
    elements.push(a);
  }
  if (m.label || m.number) {
    const x1 = Math.min(startX, endX);
    const x2 = Math.max(startX, endX);
    const labelWidth = Math.min(x2 - x1, Math.max(20, m.labelWidth || x2 - x1));
    const labelHeight = m.labelHeight || FONT.sizeDescription * FONT.lineHeight;
    const labelBelow = messageLabelBelow(style, m);
    const labelX = messageLabelX(style.messageAlign, x1, x2, labelWidth);
    const label = text({
      x: labelX,
      y: labelBelow ? Math.max(m.y, m.y + m.arrow.line.slant) + 4 : m.y - labelHeight - 2,
      width: labelWidth,
      height: labelHeight,
      value: m.wrappedLabel || messageLabelText(m),
      fontSize: m.labelFontSize || FONT.sizeDescription,
      color: style.messageFontColor,
      align: style.messageAlign,
    });
    label.customData = { role: "sequenceMessageLabel", messageId: m.id };
    elements.push(label);
  }
  renderEndpointLabel(m, "start", startX, elements, { text }, style);
  renderEndpointLabel(m, "end", endX, elements, { text }, style);
}

/** @internal */
/**
 * Render a self-message loop (arrow returning to the same lifeline).
 * @param {import("../../general/model/diagram.mjs").Message} m Message metadata (m.from === m.to).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`arrow`, `text`).
 * @param {{arrowColor:string,messageFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderSelfMessage(m, elements, { arrow, text }, style) {
  const startX = m.startX ?? m.from.x;
  const endX = m.endX ?? m.to.x;
  const off = 30;
  const side = Math.max(startX, endX) <= m.from.x ? -1 : 1;
  const midX = side < 0 ? Math.min(startX, endX) - off : Math.max(startX, endX) + off;
  const bottomY = m.y + SELF_LOOP_HEIGHT;
  const a = arrow({
    points: [
      { x: startX, y: m.y },
      { x: midX, y: m.y },
      { x: midX, y: bottomY },
      { x: endX, y: bottomY },
    ],
    strokeColor: sequenceColor(m.color, style.arrowColor),
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
      arrow: {
        source: m.arrow.source,
        direction: m.arrow.direction,
        parallel: m.parallel,
        start: {
          head: m.arrow.start.head,
          anchor: m.arrow.start.anchor,
          label: m.arrow.start.label,
          size: m.arrow.start.size,
        },
        end: {
          head: m.arrow.end.head,
          anchor: m.arrow.end.anchor,
          label: m.arrow.end.label,
          size: m.arrow.end.size,
        },
        line: { style: m.arrow.line.style, color: m.arrow.line.color, slant: m.arrow.line.slant },
      },
    };
    elements.push(a);
  }
  if (m.label || m.number) {
    const labelWidth = m.labelWidth || 200;
    const label = text({
      x: side < 0 ? midX - labelWidth - 6 : midX + 6,
      y: m.y + 4,
      width: labelWidth,
      height: m.labelHeight || FONT.sizeDescription * FONT.lineHeight,
      value: m.wrappedLabel || messageLabelText(m),
      fontSize: m.labelFontSize || FONT.sizeDescription,
      color: style.messageFontColor,
    });
    label.customData = { role: "sequenceMessageLabel", messageId: m.id };
    elements.push(label);
  }
  renderEndpointLabel(m, "start", startX, elements, { text }, style);
  renderEndpointLabel(m, "end", endX, elements, { text }, style);
}

/**
 * Render an optional label above an arrow endpoint.
 * @param {import("../../general/model/diagram.mjs").Message} message Message metadata.
 * @param {"start"|"end"} endpointName Endpoint to render.
 * @param {number} x Endpoint x coordinate.
 * @param {any[]} elements Excalidraw element list.
 * @param {Record<string, Function>} prims Primitive factories.
 * @param {{messageFontColor:string}} style Diagram style.
 * @returns {void}
 */
function renderEndpointLabel(message, endpointName, x, elements, { text }, style) {
  const endpoint = message.arrow[endpointName];
  if (!endpoint?.label) return;
  const width = endpoint.labelWidth || 20;
  const height = endpoint.labelHeight || FONT.sizeDescription * FONT.lineHeight;
  const label = text({
    x: x - width / 2,
    y: message.y - height - 2,
    width,
    height,
    value: endpoint.wrappedLabel || endpoint.label,
    fontSize: endpoint.labelFontSize || FONT.sizeDescription,
    color: style.messageFontColor,
    align: "center",
  });
  label.customData = {
    role: "sequenceMessageEndpointLabel",
    messageId: message.id,
    endpoint: endpointName,
  };
  elements.push(label);
}

/**
 * @param {import("../../general/model/diagram.mjs").Message} message Message metadata.
 * @returns {string} Label text including autonumber prefix.
 */
function messageLabelText(message) {
  const label = String(message.label || "");
  return message.number ? `${message.number}${label ? ` ${label}` : ""}` : label;
}

const HEADER_BASE_Y = 48;
const HEADER_MIN_Y = 12;

/**
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
