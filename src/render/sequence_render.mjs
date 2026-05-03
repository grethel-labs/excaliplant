// Sequence-diagram → Excalidraw renderer.
//
// Receives the same primitive helpers (rect/text/arrow/ellipse/line)
// as the component renderer so id/seed/version generation stays in
// one place.

import { FONT } from "../style/text.mjs";

const HEAD_STROKE = "#1f2933";
const HEAD_FILL = "#f5f7fa";
const LIFELINE_STROKE = "#888";
const NOTE_STROKE = "#a07b00";
const NOTE_FILL = "#fff5b1";
const ACTOR_STROKE = "#1f2933";

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
  const elements = [];

  // Title
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

  // Lifelines
  for (const p of diagram.participants) {
    elements.push(
      line({
        points: [
          { x: p.x, y: p.lifelineTop },
          { x: p.x, y: p.lifelineBottom },
        ],
        strokeColor: LIFELINE_STROKE,
        dashed: true,
        strokeWidth: 1,
      }),
    );
  }

  // Participant heads
  for (const p of diagram.participants) {
    if (p.shape === "actor") renderActorHead(p, elements, { line, ellipse, text });
    else renderParticipantHead(p, elements, { rect, text, ellipse, line });
    // Tail box (mirrors head at bottom)
    if (p.shape !== "actor") {
      renderParticipantHead(
        {
          ...p,
          headY: p.lifelineBottom - p.headHeight,
        },
        elements,
        { rect, text, ellipse, line },
      );
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
      renderSelfMessage(m, elements, { arrow, text });
    } else {
      renderMessage(m, elements, { arrow, text });
    }
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

/** @internal */
/**
 * Render a single participant head (rectangle + label) and its lifeline.
 * @param {import("../model/diagram.mjs").Participant} p Lifeline metadata (positioned).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories injected by the caller (`rect`, `text`).
 * @returns {void}
 */
function renderParticipantHead(p, elements, { rect, text }) {
  const x = p.x - p.headWidth / 2;
  elements.push(
    rect({
      x,
      y: p.headY,
      width: p.headWidth,
      height: p.headHeight,
      strokeColor: HEAD_STROKE,
      backgroundColor: HEAD_FILL,
    }),
  );
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
 * @returns {void}
 */
function renderActorHead(p, elements, { line, ellipse, text }) {
  const cx = p.x;
  const top = p.headY + 4;
  const headD = 22;
  const bodyTop = top + headD;
  const bodyBottom = bodyTop + 22;
  elements.push(
    ellipse({
      x: cx - headD / 2,
      y: top,
      width: headD,
      height: headD,
      strokeColor: ACTOR_STROKE,
      backgroundColor: "#ffffff",
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyTop },
        { x: cx, y: bodyBottom },
      ],
      strokeColor: ACTOR_STROKE,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx - 12, y: bodyTop + 6 },
        { x: cx + 12, y: bodyTop + 6 },
      ],
      strokeColor: ACTOR_STROKE,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx - 10, y: bodyBottom + 12 },
      ],
      strokeColor: ACTOR_STROKE,
    }),
  );
  elements.push(
    line({
      points: [
        { x: cx, y: bodyBottom },
        { x: cx + 10, y: bodyBottom + 12 },
      ],
      strokeColor: ACTOR_STROKE,
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
      color: ACTOR_STROKE,
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
 * @returns {void}
 */
function renderMessage(m, elements, { arrow, text }) {
  const a = arrow({
    points: [
      { x: m.from.x, y: m.y },
      { x: m.to.x, y: m.y },
    ],
    strokeColor: "#1f2933",
    dashed: m.dashed,
    startArrowhead: m.startArrowhead ?? null,
    endArrowhead: m.endArrowhead ?? "arrow",
  });
  if (a) elements.push(a);
  if (m.label) {
    const x1 = Math.min(m.from.x, m.to.x);
    const x2 = Math.max(m.from.x, m.to.x);
    elements.push(
      text({
        x: x1,
        y: m.y - FONT.sizeDescription * FONT.lineHeight - 2,
        width: x2 - x1,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: m.label,
        fontSize: FONT.sizeDescription,
        color: "#222",
        align: "center",
      }),
    );
  }
}

/** @internal */
/**
 * Render a self-message loop (arrow returning to the same lifeline).
 * @param {import("../model/diagram.mjs").Message} m Message metadata (m.from === m.to).
 * @param {any[]} elements Excalidraw element list — mutated in place.
 * @param {Record<string, Function>} prims Primitive factories (`arrow`, `text`).
 * @returns {void}
 */
function renderSelfMessage(m, elements, { arrow, text }) {
  const x = m.from.x;
  const off = 30;
  const a = arrow({
    points: [
      { x, y: m.y },
      { x: x + off, y: m.y },
      { x: x + off, y: m.y + 24 },
      { x, y: m.y + 24 },
    ],
    strokeColor: "#1f2933",
    dashed: m.dashed,
    startArrowhead: null,
    endArrowhead: m.endArrowhead ?? "arrow",
  });
  if (a) elements.push(a);
  if (m.label) {
    elements.push(
      text({
        x: x + off + 6,
        y: m.y + 4,
        width: 200,
        height: FONT.sizeDescription * FONT.lineHeight,
        value: m.label,
        fontSize: FONT.sizeDescription,
        color: "#222",
      }),
    );
  }
}
