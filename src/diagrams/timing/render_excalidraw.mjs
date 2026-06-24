/**
 * Excalidraw renderer for timing diagrams.
 * @module diagrams/timing/render_excalidraw
 */

import { EXCALIDRAW_SCHEMA, ROUNDNESS } from "../../general/render/schema.mjs";
import { createSeededRng, stableHash32 } from "../../general/render/rng.mjs";
import { FONT } from "../../general/style/text.mjs";
import { timeToX } from "./layout.mjs";

/**
 * @typedef {{x:number,y:number}} Pt
 * @typedef {Record<string, any>} ExcalElement
 */

let rng = Math.random;
let idCounter = 0;
const COLORS = {
  axis: "#4b5563",
  row: "#e5e7eb",
  label: "#111827",
  state: "#dbeafe",
  stateStroke: "#2563eb",
  binaryHigh: "#16a34a",
  binaryLow: "#dc2626",
  message: "#7c3aed",
  constraint: "#b45309",
  noteFill: "#fff7cc",
  noteStroke: "#d97706",
};

/**
 * @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram
 * @param {object} [opts]
 * @param {string} [opts.sourceLabel]
 * @returns {object}
 * @public
 */
export function exportTimingDiagram(diagram, opts = {}) {
  const sourceLabel = opts.sourceLabel || "";
  rng = createSeededRng(stableHash32(`${sourceLabel}|${diagram.title}|timing`));
  idCounter = 0;
  /** @type {ExcalElement[]} */
  const elements = [];

  if (diagram.title) {
    elements.push(
      text(
        24,
        18,
        diagram.width - 48,
        28,
        diagram.title,
        FONT.sizeTitle + 2,
        COLORS.label,
        "center",
      ),
    );
  }
  for (const highlight of diagram.highlights) renderHighlight(highlight, elements);
  for (const participant of diagram.participants) renderParticipant(diagram, participant, elements);
  for (const constraint of diagram.constraints) renderConstraint(constraint, elements);
  for (const message of diagram.messages) renderMessage(message, elements);
  for (const note of diagram.notes) renderNote(note, elements);
  if (!diagram.axis.hidden) renderAxis(diagram, elements);
  renderPresentation(diagram, elements);

  return {
    type: EXCALIDRAW_SCHEMA.type,
    version: EXCALIDRAW_SCHEMA.version,
    source: EXCALIDRAW_SCHEMA.source,
    elements,
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
      name: sourceLabel,
    },
    files: {},
  };
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {import("../../general/model/diagram.mjs").TimingParticipant} participant @param {ExcalElement[]} elements */
function renderParticipant(diagram, participant, elements) {
  elements.push(
    text(
      24,
      participant.y + 20,
      diagram.labelWidth,
      24,
      participant.title,
      FONT.sizeTitle,
      COLORS.label,
      "right",
    ),
  );
  elements.push(
    line(
      [
        { x: diagram.timelineX, y: participant.y },
        { x: diagram.timelineX + diagram.timelineWidth, y: participant.y },
      ],
      COLORS.row,
    ),
  );
  elements.push(
    line(
      [
        { x: diagram.timelineX, y: participant.y + participant.height },
        { x: diagram.timelineX + diagram.timelineWidth, y: participant.y + participant.height },
      ],
      COLORS.row,
    ),
  );
  if (participant.kind === "clock") renderClock(diagram, participant, elements);
  else if (participant.kind === "binary") renderBinary(diagram, participant, elements);
  else if (participant.kind === "analog") renderAnalog(diagram, participant, elements);
  else renderStateBands(diagram, participant, elements);
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {import("../../general/model/diagram.mjs").TimingParticipant} participant @param {ExcalElement[]} elements */
function renderStateBands(diagram, participant, elements) {
  const events = participant.events;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.hidden) continue;
    const next = events[i + 1]?.time ?? diagram.maxTime;
    const x = timeToX(diagram, event.time);
    const width = Math.max(34, timeToX(diagram, next) - x);
    const fill = event.color || COLORS.state;
    elements.push(
      rect(x, participant.y + 12, width, participant.height - 24, COLORS.stateStroke, fill),
    );
    const label = participant.stateLabels.get(event.value) || event.value;
    elements.push(
      text(
        x + 8,
        participant.y + 24,
        width - 16,
        20,
        label,
        FONT.sizeDescription,
        COLORS.label,
        "center",
      ),
    );
    if (event.note)
      elements.push(
        text(
          x + 8,
          participant.y + participant.height - 26,
          width - 16,
          16,
          event.note,
          12,
          "#444",
          "center",
        ),
      );
  }
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {import("../../general/model/diagram.mjs").TimingParticipant} participant @param {ExcalElement[]} elements */
function renderBinary(diagram, participant, elements) {
  const highY = participant.y + 16;
  const lowY = participant.y + participant.height - 16;
  /** @type {Pt[]} */
  const points = [];
  const events = participant.events;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const y = /^(?:1|true|high)$/i.test(event.value) ? highY : lowY;
    const x = timeToX(diagram, event.time);
    if (points.length) points.push({ x, y: points[points.length - 1].y });
    points.push({ x, y });
    const nextX = timeToX(diagram, events[i + 1]?.time ?? diagram.maxTime);
    points.push({ x: nextX, y });
    elements.push(
      text(
        x + 4,
        y - 22,
        70,
        16,
        event.value,
        12,
        y === highY ? COLORS.binaryHigh : COLORS.binaryLow,
      ),
    );
  }
  if (points.length) elements.push(line(points, COLORS.binaryHigh, 2));
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {import("../../general/model/diagram.mjs").TimingParticipant} participant @param {ExcalElement[]} elements */
function renderClock(diagram, participant, elements) {
  const highY = participant.y + 16;
  const lowY = participant.y + participant.height - 16;
  const period = Math.max(0.001, participant.period || 1);
  const pulse = participant.pulse > 0 ? participant.pulse : period / 2;
  let t = diagram.minTime + (participant.offset || 0);
  /** @type {Pt[]} */
  const points = [{ x: timeToX(diagram, diagram.minTime), y: lowY }];
  while (t <= diagram.maxTime + period) {
    const start = Math.max(diagram.minTime, t);
    const end = Math.min(diagram.maxTime, t + pulse);
    points.push(
      { x: timeToX(diagram, start), y: lowY },
      { x: timeToX(diagram, start), y: highY },
      { x: timeToX(diagram, end), y: highY },
      { x: timeToX(diagram, end), y: lowY },
    );
    t += period;
  }
  points.push({ x: timeToX(diagram, diagram.maxTime), y: lowY });
  elements.push(line(points, COLORS.axis, 2));
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {import("../../general/model/diagram.mjs").TimingParticipant} participant @param {ExcalElement[]} elements */
function renderAnalog(diagram, participant, elements) {
  const values = participant.events.map((event) => Number(event.value)).filter(Number.isFinite);
  const min = participant.min ?? Math.min(...values, 0);
  const max = participant.max ?? Math.max(...values, min + 1);
  const range = Math.max(1, max - min);
  const points = participant.events
    .filter((/** @type {import("../../general/model/diagram.mjs").TimingEvent} */ event) =>
      Number.isFinite(Number(event.value)),
    )
    .map((/** @type {import("../../general/model/diagram.mjs").TimingEvent} */ event) => ({
      x: timeToX(diagram, event.time),
      y:
        participant.y +
        participant.height -
        12 -
        ((Number(event.value) - min) / range) * (participant.height - 24),
    }));
  if (points.length > 1) elements.push(line(points, "#0891b2", 2));
  for (const event of participant.events) {
    if (!Number.isFinite(Number(event.value))) continue;
    elements.push(
      text(timeToX(diagram, event.time) + 4, participant.y + 4, 64, 16, event.value, 12, "#0e7490"),
    );
  }
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {ExcalElement[]} elements */
function renderAxis(diagram, elements) {
  const y = diagram.axisY;
  elements.push(
    line(
      [
        { x: diagram.timelineX, y },
        { x: diagram.timelineX + diagram.timelineWidth, y },
      ],
      COLORS.axis,
      2,
    ),
  );
  const span = Math.max(1, diagram.maxTime - diagram.minTime);
  const tickCount = Math.min(12, Math.max(2, Math.ceil(diagram.timelineWidth / 90)));
  for (let i = 0; i <= tickCount; i++) {
    const time = diagram.minTime + (span * i) / tickCount;
    const x = timeToX(diagram, time);
    elements.push(
      line(
        [
          { x, y: y - 5 },
          { x, y: y + 5 },
        ],
        COLORS.axis,
        1,
      ),
    );
    elements.push(text(x - 30, y + 10, 60, 16, formatTime(time), 12, COLORS.axis, "center"));
  }
}

/** @param {import("../../general/model/diagram.mjs").TimingHighlight} highlight @param {ExcalElement[]} elements */
function renderHighlight(highlight, elements) {
  const element = rect(
    highlight.x,
    highlight.y,
    highlight.width,
    highlight.height,
    "transparent",
    highlight.color || "#fff2a8",
  );
  element.opacity = 35;
  elements.push(element);
  if (highlight.label)
    elements.push(
      text(
        highlight.x + 6,
        highlight.y + 6,
        Math.max(80, highlight.width - 12),
        16,
        highlight.label,
        12,
        COLORS.label,
      ),
    );
}

/** @param {import("../../general/model/diagram.mjs").TimingMessage} message @param {ExcalElement[]} elements */
function renderMessage(message, elements) {
  if (!message.path.length) return;
  elements.push(arrow(message.path, COLORS.message, "arrow"));
  if (message.label) {
    const mid = midpoint(message.path[0], message.path[1]);
    elements.push(
      text(mid.x - 60, mid.y - 24, 120, 18, message.label, 12, COLORS.message, "center"),
    );
  }
}

/** @param {import("../../general/model/diagram.mjs").TimingConstraint} constraint @param {ExcalElement[]} elements */
function renderConstraint(constraint, elements) {
  if (!constraint.path.length) return;
  elements.push(line(constraint.path, COLORS.constraint, 1, "dashed"));
  if (constraint.label) {
    const mid = midpoint(constraint.path[0], constraint.path[1]);
    elements.push(
      text(mid.x - 60, mid.y - 20, 120, 18, constraint.label, 12, COLORS.constraint, "center"),
    );
  }
}

/** @param {import("../../general/model/diagram.mjs").TimingNote} note @param {ExcalElement[]} elements */
function renderNote(note, elements) {
  elements.push(rect(note.x, note.y, note.width, note.height, COLORS.noteStroke, COLORS.noteFill));
  elements.push(
    text(
      note.x + 8,
      note.y + 8,
      note.width - 16,
      note.height - 16,
      note.text,
      FONT.sizeDescription,
      "#111827",
    ),
  );
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @param {ExcalElement[]} elements */
function renderPresentation(diagram, elements) {
  const footer = [diagram.caption, diagram.footer].filter(Boolean).join("\n");
  if (footer)
    elements.push(
      text(24, diagram.height - 30, diagram.width - 48, 20, footer, 12, COLORS.axis, "center"),
    );
}

/** @param {number} value @returns {string} */
function formatTime(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** @returns {ExcalElement} */
function baseElement() {
  return {
    id: `tim_${idCounter++}_${Math.floor(rng() * 0xffffffff).toString(36)}`,
    angle: 0,
    strokeStyle: "solid",
    fillStyle: "solid",
    roughness: 0,
    opacity: 100,
    strokeWidth: 1,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(rng() * 2_000_000_000),
    version: 1,
    versionNonce: Math.floor(rng() * 2_000_000_000),
    isDeleted: false,
    boundElements: [],
    updated: 1,
    link: null,
    locked: false,
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {string} strokeColor
 * @param {string} backgroundColor
 * @returns {ExcalElement}
 */
function rect(x, y, width, height, strokeColor, backgroundColor) {
  return {
    ...baseElement(),
    type: "rectangle",
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    roundness: ROUNDNESS.proportional,
    strokeWidth: strokeColor === "transparent" ? 0 : 1,
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {string} value
 * @param {number} fontSize
 * @param {string} color
 * @param {string} [align]
 * @returns {ExcalElement}
 */
function text(x, y, width, height, value, fontSize, color, align = "left") {
  return {
    ...baseElement(),
    type: "text",
    x,
    y,
    width: Math.max(20, width),
    height: Math.max(height, fontSize * FONT.lineHeight),
    strokeColor: color,
    backgroundColor: "transparent",
    text: value,
    originalText: value,
    fontSize,
    fontFamily: FONT.family,
    textAlign: align,
    verticalAlign: "top",
    baseline: Math.round(fontSize * 0.85),
    lineHeight: FONT.lineHeight,
  };
}

/**
 * @param {Pt[]} points
 * @param {string} strokeColor
 * @param {number} [strokeWidth]
 * @param {string} [strokeStyle]
 * @returns {ExcalElement}
 */
function line(points, strokeColor, strokeWidth = 1, strokeStyle = "solid") {
  const first = points[0];
  return {
    ...baseElement(),
    type: "line",
    x: first.x,
    y: first.y,
    width: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
    height: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
    strokeColor,
    backgroundColor: "transparent",
    strokeWidth,
    strokeStyle,
    points: points.map((p) => [p.x - first.x, p.y - first.y]),
    lastCommittedPoint: [
      points[points.length - 1].x - first.x,
      points[points.length - 1].y - first.y,
    ],
    startArrowhead: null,
    endArrowhead: null,
  };
}

/**
 * @param {Pt[]} points
 * @param {string} strokeColor
 * @param {string} [endArrowhead]
 * @returns {ExcalElement}
 */
function arrow(points, strokeColor, endArrowhead = "arrow") {
  return {
    ...line(points, strokeColor, 2),
    type: "arrow",
    endArrowhead,
    startArrowhead: null,
  };
}
