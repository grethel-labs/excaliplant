/**
 * PlantUML timing-diagram syntax plugin.
 * @module diagrams/timing/plugins/syntax
 */

import {
  normalisePlantUmlText,
  sanitizePlantUmlColor,
  stripComment,
  stripQuotes,
  slug,
} from "../../../util/plantuml_utils.mjs";
import { TimingDiagram, TimingParticipant } from "../../../general/model/diagram.mjs";

const DECLARATION = /^(?:(compact)\s+)?(analog|binary|clock|concise|rectangle|robust)\s+(.+)$/i;
const QUOTED_ALIAS = /^("[^"]+"|[^"]\S*)\s+as\s+([A-Za-z_][\w.-]*)\b(.*)$/i;
const STATE_DECL = /^([A-Za-z_][\w.-]*)\s+has\s+(.+)$/i;
const TIME_MARKER = /^@(.+)$/;
const NOTE = /^note\s+(top|bottom)\s+of\s+([A-Za-z_][\w.-]*)(?:\s*:\s*(.*))?$/i;
const MESSAGE =
  /^([A-Za-z_][\w.-]*)(?:@([^\s]+))?\s*(?:->|-->)\s*([A-Za-z_][\w.-]*)(?:@([^\s]+))?(?:\s*:\s*(.+))?$/;
const CONSTRAINT =
  /^(?:(?<participant>[A-Za-z_][\w.-]*)@)?(?<from>[^\s]+)\s*<?->\s*(?:(?<target>[A-Za-z_][\w.-]*)@)?(?<to>[^\s]+)(?:\s*:\s*(?<label>.+))?$/;
const HIGHLIGHT = /^highlight\s+(.+?)\s+to\s+(.+?)(?:\s+(#[^\s:]+))?(?:\s*:\s*(.+))?$/i;
const TIME_EVENT = /^(.+?)\s+is\s+(.+)$/i;
const SCALE = /^scale\s+(.+)$/i;

/** @returns {Record<string, any>} */
export function createTimingParseContext() {
  const diagram = new TimingDiagram();
  return {
    diagram,
    result: diagram,
    currentTime: 0,
    currentParticipant: "",
    pendingNote: null,
  };
}

/** @param {string[]} lines @returns {string[]} */
export function prepareTimingLines(lines) {
  const out = [];
  let inStyle = false;
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (/^<style\b/i.test(trimmed)) {
      inStyle = true;
      continue;
    }
    if (inStyle) {
      if (/^<\/style>/i.test(trimmed)) inStyle = false;
      continue;
    }
    if (/^@start(?:uml|timing)\b/i.test(trimmed) || /^@enduml\b/i.test(trimmed)) continue;
    out.push(raw);
  }
  return out;
}

/**
 * @param {string} source
 * @returns {boolean}
 */
export function detectTimingDiagram(source) {
  const lines = String(source || "").split(/\r?\n/);
  const first = lines.find((line) => stripComment(line).trim());
  if (first && /^@starttiming\b/i.test(stripComment(first).trim())) return true;
  for (const raw of lines.slice(0, 80)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^(?:archimate|Junction_(?:And|Or))\b/i.test(line)) return false;
    if (DECLARATION.test(line)) return true;
    if (/^@[-:+\w.]+/.test(line) && /\bis\b/i.test(line)) return true;
    if (/^concise\b|^robust\b|^binary\b|^clock\b|^analog\b/i.test(line)) return true;
  }
  return false;
}

/**
 * Timing syntax plugin.
 * @public
 */
export const timingSyntaxPlugin = {
  name: "timing.syntax",
  /**
   * @param {string} rawLine
   * @param {Record<string, any>} ctx
   * @returns {boolean}
   */
  tryLine(rawLine, ctx) {
    const line = stripComment(rawLine).trim();
    if (!line) return true;

    if (ctx.pendingNote) {
      if (/^end\s+note$/i.test(line)) {
        ctx.diagram.addNote(ctx.pendingNote);
        ctx.pendingNote = null;
        return true;
      }
      ctx.pendingNote.text += `\n${normalisePlantUmlText(line)}`;
      return true;
    }

    if (parsePresentation(line, ctx)) return true;
    if (parseScale(line, ctx)) return true;
    if (parseParticipant(line, ctx)) return true;
    if (parseStateList(line, ctx)) return true;
    if (parseNote(line, ctx)) return true;
    if (parseHighlight(line, ctx)) return true;
    if (parseMessage(line, ctx)) return true;
    if (parseConstraint(line, ctx)) return true;
    if (parseTimeMarker(line, ctx)) return true;
    if (parseEvent(line, ctx)) return true;
    if (/^(hide|show)\s+(footbox|time-axis|axis|timeaxis|clock)\b/i.test(line)) {
      if (/^hide\s+(time-axis|axis|timeaxis)\b/i.test(line)) ctx.diagram.axis.hidden = true;
      return true;
    }
    if (/^(?:[=-]{3,}|\|\|+)$/.test(line)) return true;
    return false;
  },
};

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parsePresentation(line, ctx) {
  const match = line.match(/^(title|caption|header|footer|legend|mainframe)\s+(.+)$/i);
  if (!match) return false;
  const key = match[1].toLowerCase();
  ctx.diagram[key] = normalisePlantUmlText(match[2]);
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseScale(line, ctx) {
  const match = line.match(SCALE);
  if (!match) return false;
  const numbers = match[1].match(/-?\d+(?:\.\d+)?/g) || [];
  if (numbers.length >= 2) {
    ctx.diagram.axis.scaleUnits = Number(numbers[0]);
    ctx.diagram.axis.scalePixels = Number(numbers[1]);
  } else if (/hide/i.test(match[1])) {
    ctx.diagram.axis.hidden = true;
  }
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseParticipant(line, ctx) {
  const match = line.match(DECLARATION);
  if (!match) return false;
  const [, compactToken, rawKind, tail] = match;
  /** @type {"analog"|"binary"|"clock"|"concise"|"rectangle"|"robust"} */
  const kind = /** @type {any} */ (rawKind.toLowerCase());
  const spec = parseParticipantTail(tail.trim(), kind);
  ctx.diagram.addParticipant(
    new TimingParticipant({
      ...spec,
      kind,
      compact: !!compactToken,
    }),
  );
  return true;
}

/**
 * @param {string} tail
 * @param {string} kind
 * @returns {any}
 */
function parseParticipantTail(tail, kind) {
  let rest = tail;
  let min = null;
  let max = null;
  const range = rest.match(/\s+between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/i);
  if (range) {
    min = Number(range[1]);
    max = Number(range[2]);
    rest = rest.replace(range[0], "").trim();
  }
  const options = parseClockOptions(rest);
  rest = rest
    .replace(/\s+with\s+period\b.*$/i, "")
    .replace(/\s+pulse\s+-?\d+(?:\.\d+)?/i, "")
    .replace(/\s+offset\s+-?\d+(?:\.\d+)?/i, "")
    .trim();
  const alias = rest.match(QUOTED_ALIAS);
  if (alias) {
    return {
      id: alias[2],
      title: normalisePlantUmlText(stripQuotes(alias[1])),
      min,
      max,
      ...options,
    };
  }
  const title = normalisePlantUmlText(stripQuotes(rest));
  return {
    id: /^[A-Za-z_][\w.-]*$/.test(rest) ? rest : slug(title),
    title,
    min,
    max,
    period: kind === "clock" ? options.period || 1 : options.period,
    ...options,
  };
}

/** @param {string} text @returns {{period?:number,pulse?:number,offset?:number}} */
function parseClockOptions(text) {
  const out = {};
  const period = text.match(/\bperiod\s+(-?\d+(?:\.\d+)?)/i);
  const pulse = text.match(/\bpulse\s+(-?\d+(?:\.\d+)?)/i);
  const offset = text.match(/\boffset\s+(-?\d+(?:\.\d+)?)/i);
  if (period) out.period = Number(period[1]);
  if (pulse) out.pulse = Number(pulse[1]);
  if (offset) out.offset = Number(offset[1]);
  return out;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseStateList(line, ctx) {
  const match = line.match(STATE_DECL);
  if (!match) return false;
  const participant = ctx.diagram.participantById(match[1]);
  if (!participant) return false;
  const values = match[2]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const raw of values) {
    const alias = raw.match(/^("[^"]+"|[^"]\S*)\s+as\s+([A-Za-z_][\w.-]*)$/i);
    const id = alias ? alias[2] : stripQuotes(raw);
    const title = normalisePlantUmlText(alias ? stripQuotes(alias[1]) : stripQuotes(raw));
    participant.stateLabels.set(id, title);
    participant.stateOrder.push(id);
  }
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseTimeMarker(line, ctx) {
  const match = line.match(TIME_MARKER);
  if (!match) return false;
  const value = match[1].trim();
  const participant = value.match(/^([A-Za-z_][\w.-]*)(?:\s+(.+))?$/);
  if (participant && ctx.diagram.participantById(participant[1])) {
    ctx.currentParticipant = participant[1];
    if (participant[2]) parseEventStatements(participant[2], ctx, participant[1]);
    return true;
  }
  const anchor = value.match(/^(.+?)\s+as\s+:(\w[\w.-]*)$/i);
  const time = parseTime(anchor ? anchor[1].trim() : value, ctx);
  ctx.currentTime = time;
  if (anchor) ctx.diagram.anchors.set(anchor[2], time);
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseEvent(line, ctx) {
  const match = line.match(TIME_EVENT);
  if (!match) return false;
  const first = match[1].trim();
  const participant = ctx.diagram.participantById(first);
  if (participant) {
    addEvent(ctx, participant.id, ctx.currentTime, match[2]);
    return true;
  }
  if (ctx.currentParticipant) {
    const time = parseTime(first, ctx);
    addEvent(ctx, ctx.currentParticipant, time, match[2]);
    ctx.currentTime = time;
    return true;
  }
  return false;
}

/** @param {string} text @param {Record<string, any>} ctx @param {string} participantId */
function parseEventStatements(text, ctx, participantId) {
  const parts = text.match(/(?:[^\s]+\s+is\s+.*?)(?=\s+[+:\w.-]+\s+is\s+|$)/gi) || [text];
  for (const part of parts) {
    const match = part.trim().match(TIME_EVENT);
    if (match) addEvent(ctx, participantId, parseTime(match[1].trim(), ctx), match[2]);
  }
}

/**
 * @param {Record<string, any>} ctx
 * @param {string} participantId
 * @param {number} time
 * @param {string} rawValue
 */
function addEvent(ctx, participantId, time, rawValue) {
  const parsed = parseValue(rawValue);
  ctx.diagram.addEvent({
    participantId,
    time,
    value: parsed.value,
    note: parsed.note,
    color: parsed.color,
    hidden: parsed.hidden,
  });
}

/** @param {string} raw @returns {{value:string,note:string,color:string,hidden:boolean}} */
function parseValue(raw) {
  let text = raw.trim();
  let note = "";
  const noteMatch = text.match(/\s*:\s*(.+)$/);
  if (noteMatch) {
    note = normalisePlantUmlText(noteMatch[1]);
    text = text.slice(0, noteMatch.index).trim();
  }
  let color = "";
  const colorMatch = text.match(/(#[A-Za-z0-9_]+|#[0-9a-fA-F]{3,8})/);
  if (colorMatch) {
    color = sanitizePlantUmlColor(colorMatch[1]);
    text = text.replace(colorMatch[0], "").trim();
  }
  const hidden = /^[-_]+$/.test(text);
  return { value: normalisePlantUmlText(stripQuotes(text)), note, color, hidden };
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseMessage(line, ctx) {
  const match = line.match(MESSAGE);
  if (!match) return false;
  const [, fromId, fromRaw, toId, toRaw, label = ""] = match;
  ctx.diagram.addParticipant({ id: fromId, title: fromId });
  ctx.diagram.addParticipant({ id: toId, title: toId });
  ctx.diagram.addMessage({
    fromId,
    toId,
    fromTime: fromRaw ? parseTime(fromRaw, ctx) : ctx.currentTime,
    toTime: toRaw ? parseTime(toRaw, ctx) : ctx.currentTime,
    label: normalisePlantUmlText(label),
  });
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseConstraint(line, ctx) {
  const match = line.match(CONSTRAINT);
  if (!match?.groups) return false;
  const participantId = match.groups.participant || match.groups.target || "";
  ctx.diagram.addConstraint({
    participantId,
    fromTime: parseTime(match.groups.from, ctx),
    toTime: parseTime(match.groups.to, ctx),
    label: normalisePlantUmlText(match.groups.label || ""),
  });
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseHighlight(line, ctx) {
  const match = line.match(HIGHLIGHT);
  if (!match) return false;
  ctx.diagram.addHighlight({
    fromTime: parseTime(match[1], ctx),
    toTime: parseTime(match[2], ctx),
    color: sanitizePlantUmlColor(match[3] || "") || "#fff2a8",
    label: normalisePlantUmlText(match[4] || ""),
  });
  return true;
}

/** @param {string} line @param {Record<string, any>} ctx @returns {boolean} */
function parseNote(line, ctx) {
  const match = line.match(NOTE);
  if (!match) return false;
  const spec = {
    side: match[1].toLowerCase(),
    participantId: match[2],
    text: normalisePlantUmlText(match[3] || ""),
    time: ctx.currentTime,
  };
  if (match[3] !== undefined) ctx.diagram.addNote(spec);
  else ctx.pendingNote = spec;
  return true;
}

/**
 * @param {string} raw
 * @param {Record<string, any>} ctx
 * @returns {number}
 */
function parseTime(raw, ctx) {
  const value = raw.trim().replace(/^@/, "");
  const anchor = value.match(/^:(\w[\w.-]*)([+-]\d+(?:\.\d+)?)?$/);
  if (anchor)
    return (ctx.diagram.anchors.get(anchor[1]) ?? ctx.currentTime) + Number(anchor[2] || 0);
  if (/^[+-]\d+(?:\.\d+)?$/.test(value)) return ctx.currentTime + Number(value);
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const date = Date.parse(value.replace(/^['"]|['"]$/g, ""));
  if (Number.isFinite(date)) return date / 1000;
  return ctx.currentTime;
}
