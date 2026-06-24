/**
 * Timing diagram layout contract.
 * @module diagrams/timing/layout
 */

import { BaseModuleLayout } from "../base/layout.mjs";
import { measureSmartWrapped, FONT } from "../../general/style/text.mjs";

const PADDING_X = 32;
const TOP = 52;
const LABEL_GAP = 24;
const ROW_HEIGHT = 72;
const ROW_GAP = 24;
const DEFAULT_WIDTH = 760;
const MIN_SCALE = 2.5;
const MAX_SCALE = 24;

/**
 * Compute deterministic geometry for a timing diagram.
 * @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram
 * @returns {void}
 * @public
 */
export function layoutTimingDiagram(diagram) {
  const times = collectTimes(diagram);
  const minTime = Math.min(...times, 0);
  const maxTime = Math.max(...times, minTime + 1);
  diagram.minTime = minTime;
  diagram.maxTime = maxTime;

  const labelWidth = Math.max(
    120,
    ...diagram.participants.map(
      (participant) => measureSmartWrapped(participant.title, FONT.sizeTitle, 180).width + 20,
    ),
  );
  diagram.labelWidth = Math.ceil(labelWidth);
  diagram.timelineX = PADDING_X + diagram.labelWidth + LABEL_GAP;
  const explicitScale =
    diagram.axis.scaleUnits > 0 && diagram.axis.scalePixels > 0
      ? diagram.axis.scalePixels / diagram.axis.scaleUnits
      : 0;
  const fittedScale = DEFAULT_WIDTH / Math.max(1, maxTime - minTime);
  diagram.pixelsPerTime = explicitScale || Math.min(MAX_SCALE, Math.max(MIN_SCALE, fittedScale));
  diagram.timelineWidth = Math.ceil(
    Math.max(DEFAULT_WIDTH, (maxTime - minTime) * diagram.pixelsPerTime),
  );

  let y = TOP;
  if (diagram.title) y += 34;
  for (const participant of diagram.participants) {
    participant.x = diagram.timelineX;
    participant.y = y;
    participant.width = diagram.timelineWidth;
    participant.height = participant.compact || diagram.axis.compact ? 48 : ROW_HEIGHT;
    participant.events.sort((a, b) => a.time - b.time || a.value.localeCompare(b.value));
    for (const event of participant.events) {
      event.x = timeToX(diagram, event.time);
      event.y = participant.y + participant.height / 2;
    }
    y += participant.height + ROW_GAP;
  }
  diagram.axisY = y + 4;
  if (!diagram.axis.hidden) y += 42;

  for (const highlight of diagram.highlights) {
    highlight.x = timeToX(diagram, Math.min(highlight.fromTime, highlight.toTime));
    highlight.y = TOP - 14;
    highlight.width = Math.max(
      4,
      Math.abs(timeToX(diagram, highlight.toTime) - timeToX(diagram, highlight.fromTime)),
    );
    highlight.height = Math.max(40, diagram.axisY - highlight.y - 8);
  }
  for (const note of diagram.notes) {
    const participant = diagram.participantById(note.participantId);
    const width = Math.max(
      100,
      measureSmartWrapped(note.text, FONT.sizeDescription, 220).width + 24,
    );
    note.width = Math.min(240, width);
    note.height = Math.max(
      34,
      measureSmartWrapped(note.text, FONT.sizeDescription, note.width - 16).height + 16,
    );
    note.x = Math.max(diagram.timelineX, timeToX(diagram, note.time) - note.width / 2);
    note.y = participant
      ? note.side === "top"
        ? participant.y - note.height - 6
        : participant.y + participant.height + 6
      : TOP;
  }
  for (const message of diagram.messages) {
    const from = diagram.participantById(message.fromId);
    const to = diagram.participantById(message.toId);
    if (!from || !to) continue;
    message.path = [
      { x: timeToX(diagram, message.fromTime), y: from.y + from.height / 2 },
      { x: timeToX(diagram, message.toTime), y: to.y + to.height / 2 },
    ];
  }
  for (const constraint of diagram.constraints) {
    const participant = constraint.participantId
      ? diagram.participantById(constraint.participantId)
      : null;
    const yPos = participant ? participant.y + participant.height + 10 : diagram.axisY - 14;
    constraint.path = [
      { x: timeToX(diagram, constraint.fromTime), y: yPos },
      { x: timeToX(diagram, constraint.toTime), y: yPos },
    ];
  }

  diagram.x = 0;
  diagram.y = 0;
  diagram.width = diagram.timelineX + diagram.timelineWidth + PADDING_X;
  diagram.height = y + PADDING_X;
}

/**
 * @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram
 * @param {number} time
 * @returns {number}
 */
export function timeToX(diagram, time) {
  return diagram.timelineX + (time - diagram.minTime) * diagram.pixelsPerTime;
}

/** @param {import("../../general/model/diagram.mjs").TimingDiagram} diagram @returns {number[]} */
function collectTimes(diagram) {
  const times = [0];
  for (const participant of diagram.participants) {
    for (const event of participant.events) times.push(event.time);
    if (participant.kind === "clock" && participant.period > 0) {
      times.push((participant.events.at(-1)?.time ?? 0) + participant.period * 2);
    }
  }
  for (const message of diagram.messages) times.push(message.fromTime, message.toTime);
  for (const constraint of diagram.constraints) times.push(constraint.fromTime, constraint.toTime);
  for (const highlight of diagram.highlights) times.push(highlight.fromTime, highlight.toTime);
  return times.filter((time) => Number.isFinite(time));
}

/** @public */
export class TimingDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({
      layoutStrategy: "timeline",
      layout: (model) =>
        layoutTimingDiagram(
          /** @type {import("../../general/model/diagram.mjs").TimingDiagram} */ (model),
        ),
    });
  }
}

/** @public */
export const timingDiagramLayout = new TimingDiagramLayout();
