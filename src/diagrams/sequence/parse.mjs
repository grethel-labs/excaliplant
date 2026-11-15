/**
 * Sequence diagram parser.
 * @module diagrams/sequence/parse
 */

import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColor, parseColorSpec } from "../../syntax/color.mjs";
import { runRules } from "../../syntax/reader.mjs";
import { label, takeStereotypes, takeColor, unquote, clampText } from "../../syntax/text.mjs";
import { parseNameAlias } from "../graph/parse.mjs";
import { LimitError } from "../../core/errors.mjs";

/**
 * @typedef {object} Participant
 * @property {string} id
 * @property {string} label
 * @property {"participant" | "actor" | "boundary" | "control" | "entity" | "database" | "collections" | "queue"} kind
 * @property {import("../../syntax/color.mjs").ColorSpec} colors
 * @property {string[]} stereotypes
 * @property {number} order Explicit `order` value or declaration index.
 * @property {number | null} createdAt Event index of `create`.
 * @property {boolean} declared Explicitly declared (vs implicit from a message).
 */

/**
 * @typedef {object} MessageArrow
 * @property {string | null} startHead
 * @property {string | null} endHead
 * @property {"solid" | "dashed"} lineStyle
 * @property {string | null} color
 */

/**
 * @typedef {(
 *  | { type: "message", from: string, to: string, text: string, arrow: MessageArrow, number: string | null, parallel: boolean, edge: "left" | "right" | null, edgeSide: "from" | "to" | null, short: boolean, lifecycle: { source: string | null, target: string | null }, line: number }
 *  | { type: "note", over: string[], position: "left" | "right" | "over" | "across", text: string, shape: "note" | "hnote" | "rnote", colors: import("../../syntax/color.mjs").ColorSpec, attached: boolean }
 *  | { type: "activate", id: string, color: string | null }
 *  | { type: "deactivate", id: string }
 *  | { type: "destroy", id: string }
 *  | { type: "create", id: string }
 *  | { type: "divider", text: string }
 *  | { type: "delay", text: string }
 *  | { type: "space", height: number }
 *  | { type: "groupStart", kind: string, text: string, color: string | null }
 *  | { type: "groupElse", text: string, color: string | null }
 *  | { type: "groupEnd" }
 *  | { type: "ref", over: string[], text: string }
 * )} SeqEvent
 */

/**
 * @typedef {object} SequenceModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {Map<string, Participant>} participants
 * @property {SeqEvent[]} events
 * @property {{ text: string, color: string | null, members: string[] }[]} boxes
 * @property {boolean} hideFootbox
 * @property {"left" | "center" | "right"} messageAlign
 */

const PARTICIPANT_KINDS = new Set([
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections",
  "queue",
]);
const GROUP_KINDS = new Set([
  "alt",
  "opt",
  "loop",
  "par",
  "par2",
  "break",
  "critical",
  "group",
  "else",
  "also",
]);

/**
 * @typedef {object} SeqContext
 * @property {SequenceModel} model
 * @property {import("../../core/registry.mjs").ModuleContext} module
 * @property {{ on: boolean, value: number, step: number, format: string }} autonumber
 * @property {{ text: string, color: string | null, members: string[] } | null} box
 * @property {string[][]} activations Stack of callers for `return`.
 * @property {number} order
 */

/**
 * @param {SeqContext} ctx
 * @param {string} rawName
 * @returns {Participant}
 */
function ensureParticipant(ctx, rawName) {
  const name = unquote(rawName.trim());
  const { participants } = ctx.model;
  let p = participants.get(name);
  if (!p) {
    for (const q of participants.values()) if (q.label === name) return q;
    p = {
      id: name,
      label: clampText(label(name), ctx.module.limits.maxTextLength),
      kind: "participant",
      colors: {},
      stereotypes: [],
      order: ctx.order++,
      createdAt: null,
      declared: false,
    };
    participants.set(name, p);
    if (ctx.box) ctx.box.members.push(name);
    if (participants.size > ctx.module.limits.maxNodes)
      throw new LimitError("Too many participants");
  }
  return p;
}

/**
 * Locate the message arrow in a line. Quoted text is skipped.
 * @param {string} line
 * @returns {{ start: number, end: number, left: string, body: string, right: string } | null}
 */
export function findMessageArrow(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    if (quoted || c !== "-") continue;
    if (line[i - 1] === "-") continue;
    // body: '-' or '--' with an optional [#color] style
    let j = i;
    while (line[j] === "-") j++;
    if (line[j] === "[") {
      const close = line.indexOf("]", j);
      if (close < 0) return null;
      j = close + 1;
      while (line[j] === "-") j++;
    }
    const dashes = line.slice(i, j).replace(/\[[^\]]*\]/, "").length;
    if (dashes < 1 || dashes > 2) continue;
    let s = i;
    let left = "";
    for (const tok of ["<<", "\\\\", "//", "<", "\\", "/"]) {
      if (line.slice(0, s).endsWith(tok)) {
        left = tok;
        s -= tok.length;
        break;
      }
    }
    if (/[ox]/.test(line[s - 1] ?? "") && /[\s\[?&]|^$/.test(line[s - 2] ?? "")) {
      left = line[s - 1] + left;
      s -= 1;
    }
    let e = j;
    let right = "";
    for (const tok of [">>", "\\\\", "//", ">", "\\", "/"]) {
      if (line.startsWith(tok, e)) {
        right = tok;
        e += tok.length;
        break;
      }
    }
    if (/[ox]/.test(line[e] ?? "") && /[\s\]?:+\-*!]|^$/.test(line[e + 1] ?? "")) {
      right += line[e];
      e += 1;
    }
    if (!left && !right) continue;
    return { start: s, end: e, left, body: line.slice(i, j), right };
  }
  return null;
}

/**
 * @param {string} left
 * @param {string} body
 * @param {string} right
 * @returns {MessageArrow}
 */
function arrowOf(left, body, right) {
  /** @param {string} tok @returns {string | null} */
  const head = (tok) => {
    const core = tok.replace(/[ox]/g, "");
    if (/o/.test(tok) && !core) return "circle_outline";
    if (/x/.test(tok) && !core) return "cross";
    if (core === ">" || core === "<") return "triangle";
    if (core === ">>" || core === "<<") return "arrow";
    if (core === "\\" || core === "/") return core === "\\" ? "half_top" : "half_bottom";
    if (core === "\\\\" || core === "//") return core === "\\\\" ? "half_top" : "half_bottom";
    return null;
  };
  const style = /\[([^\]]*)\]/.exec(body)?.[1] ?? "";
  const color = parseColor(style.split(/[,;]/)[0]?.replace(/^#/, "") ?? "");
  const startHead = left ? head(left) : null;
  let endHead = right ? head(right) : null;
  if (/x/.test(right) && right.replace(/x/, "")) endHead = "cross";
  if (/o/.test(right) && right.replace(/o/, "")) endHead = head(right.replace(/o/, ""));
  return {
    startHead,
    endHead,
    lineStyle:
      body.replace(/\[[^\]]*\]/, "").length === 2 || /dashed|dotted/.test(style)
        ? "dashed"
        : "solid",
    color,
  };
}

/**
 * @param {SeqContext} ctx
 */
function nextNumber(ctx) {
  const a = ctx.autonumber;
  if (!a.on) return null;
  const n = a.value;
  a.value += a.step;
  const zeros = /0{2,}/.exec(a.format);
  const num = zeros ? String(n).padStart(zeros[0].length, "0") : String(n);
  return a.format ? a.format.replace(/<[^>]*>/g, "").replace(/0{2,}|#+|0/, num) || num : num;
}

/** @type {import("../../syntax/reader.mjs").Rule<SeqContext>[]} */
const RULES = [
  (line, ctx, reader) => parseCommon(line, ctx.model.meta, reader),
  // participants
  (line, ctx, reader) => {
    const m =
      /^(create\s+)?(participant|actor|boundary|control|entity|database|collections|queue)\s+(.+)$/i.exec(
        line,
      );
    if (!m) return false;
    let rest = m[3].trim();
    let multi = null;
    if (/\[\s*$/.test(rest)) {
      rest = rest.replace(/\[\s*$/, "");
      multi = reader
        .until(/^\s*\]\s*$/)
        .map((l) => l.text.trim())
        .join("\n");
    }
    const order = /\sorder\s+(-?\d+)\s*$/i.exec(rest);
    if (order) rest = rest.slice(0, order.index);
    const st = takeStereotypes(rest);
    const col = takeColor(st.rest);
    const named = parseNameAlias(col.rest);
    if (!named) return false;
    const p = ensureParticipant(ctx, named.id);
    p.label = label(multi ?? named.label);
    p.kind = /** @type {any} */ (m[2].toLowerCase());
    p.colors = parseColorSpec(col.color);
    p.stereotypes = st.stereotypes;
    p.declared = true;
    if (order) p.order = Number(order[1]);
    if (named.label !== named.id) {
      for (const [k, v] of ctx.model.participants)
        if (k === named.label && v !== p) ctx.model.participants.delete(k);
    }
    if (m[1]) {
      p.createdAt = ctx.model.events.length;
      ctx.model.events.push({ type: "create", id: p.id });
    }
    return true;
  },
  (line, ctx) => {
    const m = /^create\s+(\S+)$/i.exec(line);
    if (!m) return false;
    const p = ensureParticipant(ctx, m[1]);
    p.createdAt = ctx.model.events.length;
    ctx.model.events.push({ type: "create", id: p.id });
    return true;
  },
  // boxes
  (line, ctx) => {
    const m = /^box\b\s*(.*)$/i.exec(line);
    if (!m) return false;
    const col = takeColor(m[1]);
    ctx.box = { text: label(col.rest), color: parseColorSpec(col.color).fill ?? null, members: [] };
    ctx.model.boxes.push(ctx.box);
    return true;
  },
  (line, ctx) => {
    if (!/^end\s*box$/i.test(line)) return false;
    ctx.box = null;
    return true;
  },
  // lifecycle
  (line, ctx) => {
    const m = /^(activate|deactivate|destroy)\s+("[^"]+"|\S+)\s*(#\S+)?$/i.exec(line);
    if (!m) return false;
    const p = ensureParticipant(ctx, m[2]);
    const kind = m[1].toLowerCase();
    if (kind === "activate") {
      ctx.model.events.push({
        type: "activate",
        id: p.id,
        color: parseColorSpec(m[3]).fill ?? null,
      });
      const call = [...ctx.model.events]
        .reverse()
        .find((e) => e.type === "message" && e.to === p.id);
      if (call?.type === "message" && call.from) ctx.activations.push([call.from, p.id]);
    } else if (kind === "deactivate") {
      const at = ctx.activations.map((a) => a[1]).lastIndexOf(p.id);
      if (at >= 0) ctx.activations.splice(at, 1);
      ctx.model.events.push({ type: "deactivate", id: p.id });
    } else ctx.model.events.push({ type: "destroy", id: p.id });
    return true;
  },
  (line, ctx) => {
    const m = /^autonumber\b\s*(.*)$/i.exec(line);
    if (!m) return false;
    const rest = m[1].trim();
    const a = ctx.autonumber;
    if (/^stop$/i.test(rest)) a.on = false;
    else if (/^resume\b/i.test(rest)) {
      a.on = true;
      const r = /^resume\s+(\d+)?\s*(?:"([^"]*)")?/i.exec(rest);
      if (r?.[1]) a.step = Number(r[1]);
      if (r?.[2]) a.format = r[2];
    } else {
      const r = /^(\d+)?\s*(\d+)?\s*(?:"([^"]*)")?/.exec(rest);
      a.on = true;
      a.value = r?.[1] ? Number(r[1]) : 1;
      a.step = r?.[2] ? Number(r[2]) : 1;
      a.format = r?.[3] ?? "";
    }
    return true;
  },
  (line, ctx) => {
    if (!/^hide\s+footbox$/i.test(line)) return false;
    ctx.model.hideFootbox = true;
    return true;
  },
  // dividers, delays, spacing
  (line, ctx) => {
    const m = /^==\s*(.*?)\s*==$/.exec(line);
    if (!m) return false;
    ctx.model.events.push({ type: "divider", text: label(m[1]) });
    return true;
  },
  (line, ctx) => {
    const m = /^\.\.\.\s*(.*?)\s*(?:\.\.\.)?$/.exec(line);
    if (!m) return false;
    ctx.model.events.push({ type: "delay", text: label(m[1]) });
    return true;
  },
  (line, ctx) => {
    const m = /^\|\|(\d*)\|\|?$/.exec(line);
    if (!m) return false;
    ctx.model.events.push({ type: "space", height: m[1] ? Math.min(2000, Number(m[1])) : 20 });
    return true;
  },
  // references
  (line, ctx, reader) => {
    const m = /^ref\s+over\s+(.+?)(?:\s*:\s*(.*))?$/i.exec(line);
    if (!m) return false;
    const over = m[1].split(",").map((s) => ensureParticipant(ctx, s).id);
    const text =
      m[2] !== undefined
        ? m[2]
        : reader
            .until(/^\s*end\s*ref\s*$/i)
            .map((l) => l.text.trim())
            .join("\n");
    ctx.model.events.push({ type: "ref", over, text: label(text) });
    return true;
  },
  // notes
  (line, ctx, reader) => {
    const m = /^(note|hnote|rnote)\s+(left|right|over|across)\b\s*(?:of\s+)?(.*?)$/i.exec(line);
    if (!m) return false;
    let rest = m[3];
    /** @type {string | null} */
    let text = null;
    const colon = /^(.*?)\s*:\s*(.*)$/.exec(rest);
    if (colon) {
      rest = colon[1];
      text = colon[2];
    }
    const col = takeColor(rest);
    const position = /** @type {"left" | "right" | "over" | "across"} */ (m[2].toLowerCase());
    const names = col.rest
      ? col.rest
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const over = names.map((n) => ensureParticipant(ctx, n).id);
    if (text === null)
      text = reader
        .until(/^\s*end\s*(note|hnote|rnote)\s*$/i)
        .map((l) => l.text)
        .join("\n");
    const lastMsg = [...ctx.model.events].reverse().find((e) => e.type === "message");
    const attached = over.length === 0 && position !== "across" && !!lastMsg;
    if (attached && lastMsg?.type === "message") {
      over.push(
        position === "left"
          ? lastMsg.from || lastMsg.to
          : position === "right"
            ? lastMsg.to || lastMsg.from
            : lastMsg.from,
      );
    }
    ctx.model.events.push({
      type: "note",
      over,
      position,
      text: label(text.replace(/^\n+|\n+$/g, "")),
      shape: /** @type {any} */ (m[1].toLowerCase()),
      colors: parseColorSpec(col.color),
      attached,
    });
    return true;
  },
  // grouping
  (line, ctx) => {
    const m = /^(alt|opt|loop|par2?|break|critical|group|else|also)\b\s*(#\S+)?\s*(.*)$/i.exec(
      line,
    );
    if (!m || !GROUP_KINDS.has(m[1].toLowerCase())) return false;
    const kind = m[1].toLowerCase();
    const color = parseColorSpec(m[2]).fill ?? null;
    if (kind === "else" || kind === "also")
      ctx.model.events.push({ type: "groupElse", text: label(m[3]), color });
    else
      ctx.model.events.push({
        type: "groupStart",
        kind: kind === "par2" ? "par" : kind,
        text: label(m[3].replace(/^\[|\]$/g, "")),
        color,
      });
    return true;
  },
  (line, ctx) => {
    if (!/^end$/i.test(line)) return false;
    ctx.model.events.push({ type: "groupEnd" });
    return true;
  },
  // return
  (line, ctx) => {
    const m = /^return\b\s*(.*)$/i.exec(line);
    if (!m) return false;
    const frame = ctx.activations.pop();
    if (!frame) return true;
    const [caller, callee] = frame;
    ctx.model.events.push({
      type: "message",
      from: callee,
      to: caller,
      text: label(m[1]),
      arrow: { startHead: null, endHead: "arrow", lineStyle: "dashed", color: null },
      number: nextNumber(ctx),
      parallel: false,
      edge: null,
      edgeSide: null,
      short: false,
      lifecycle: { source: "--", target: null },
      line: 0,
    });
    return true;
  },
  // messages
  (line, ctx, _reader, src) => {
    let text = line;
    let parallel = false;
    if (text.startsWith("&")) {
      parallel = true;
      text = text.slice(1).trim();
    }
    const arrow = findMessageArrow(text);
    if (!arrow) return false;
    let fromText = text.slice(0, arrow.start).trim();
    let rest = text.slice(arrow.end);
    let msg = "";
    const colon = rest.indexOf(":");
    if (colon >= 0) {
      msg = rest.slice(colon + 1).trim();
      rest = rest.slice(0, colon);
    }
    let toText = rest.trim();
    /** @type {{ source: string | null, target: string | null }} */
    const lifecycle = { source: null, target: null };
    const life = /(\+\+|--|\*\*|!!)\s*(\+\+|--)?\s*(#\S+)?$/.exec(toText);
    if (life) {
      // `++` activates, `**` creates and `!!` destroys the target; `--` deactivates the source.
      const tokens = [life[1], life[2]].filter(Boolean);
      lifecycle.target = tokens.find((t) => t !== "--") ?? null;
      lifecycle.source = tokens.includes("--") ? "--" : null;
      toText = toText.slice(0, life.index).trim();
    }
    /** @type {"left" | "right" | null} */
    let edge = null;
    /** @type {"from" | "to" | null} */
    let edgeSide = null;
    let short = false;
    if (fromText === "[" || fromText === "?") {
      edge = "left";
      edgeSide = "from";
      short = fromText === "?";
      fromText = "";
    }
    if (toText === "]" || toText === "?") {
      edge = "right";
      edgeSide = "to";
      short = toText === "?";
      toText = "";
    }
    if (toText === "[") {
      edge = "left";
      edgeSide = "to";
      toText = "";
    }
    if (fromText === "]") {
      edge = "right";
      edgeSide = "from";
      fromText = "";
    }
    if (!fromText && !toText) return false;
    if (
      (fromText && /\s/.test(fromText) && !/^".*"$/.test(fromText)) ||
      (toText && /\s/.test(toText) && !/^".*"$/.test(toText))
    )
      return false;
    const from = fromText ? ensureParticipant(ctx, fromText).id : "";
    const to = toText ? ensureParticipant(ctx, toText).id : "";
    const a = arrowOf(arrow.left, arrow.body, arrow.right);
    if (lifecycle.target === "**" && to) {
      const p = ensureParticipant(ctx, to);
      if (p.createdAt === null) {
        p.createdAt = ctx.model.events.length;
        ctx.model.events.push({ type: "create", id: to });
      }
    }
    ctx.model.events.push({
      type: "message",
      from,
      to,
      text: label(msg),
      arrow: a,
      number: nextNumber(ctx),
      parallel,
      edge,
      edgeSide,
      short,
      lifecycle,
      line: src.line,
    });
    if (lifecycle.target === "++" && from && to) ctx.activations.push([from, to]);
    if (ctx.model.events.length > ctx.module.limits.maxEdges * 2)
      throw new LimitError("Too many sequence events");
    return true;
  },
];

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 * @returns {SequenceModel}
 */
export function parseSequence(lines, module) {
  /** @type {SequenceModel} */
  const model = {
    meta: createMeta(),
    participants: new Map(),
    events: [],
    boxes: [],
    hideFootbox: false,
    messageAlign: "center",
  };
  /** @type {SeqContext} */
  const ctx = {
    model,
    module,
    autonumber: { on: false, value: 1, step: 1, format: "" },
    box: null,
    activations: [],
    order: 0,
  };
  runRules(lines, RULES, ctx, module.diagnostics);
  if (model.meta.hide.has("footbox")) model.hideFootbox = true;
  const align = model.meta.skin.get("sequencemessagealign");
  if (align)
    model.messageAlign = /** @type {any} */ (
      /left|right/i.test(align) ? align.toLowerCase() : "center"
    );
  // Explicit `activate` after a `++`-less call also feeds `return`.
  return model;
}
