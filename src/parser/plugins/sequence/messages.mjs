// Sequence-diagram messages.
//
// Supports compact and spaced forms such as:
//   A->B: sync
//   A --> B: reply
//   A ->> B: async/open head
//   A <- B: reverse-readable syntax
//   A -[#red]> B: per-message colour
//   A o->o B / A x-> B / A ->x B: endpoint decorations
//   [-> A / A ->] / ?-> A / A ->?: external and short arrows
//   ++/--/**/!! lifecycle suffixes after the target.

import { SequenceArrow } from "../../../model/diagram.mjs";
import { stripQuotes, unescapeLabel } from "../../utils.mjs";

const ARROW_CHARS = new Set(["-", "<", ">", "\\", "/", "o", "x", "[", "]", "?"]);
const LIFECYCLE = new Set(["++", "--", "**", "!!"]);

/**
 * Sequence-diagram message: `A op B [: label]`. Operator flavours:
 * `->` sync, `-->` reply (dashed), `->>` async, `<-` reverse, `<-->` bidir.
 * @type {import("../../engine.mjs").Plugin}
 */
export const messagePlugin = {
  name: "sequence.message",
  tryLine(line, ctx) {
    const parsed = parseSequenceMessageLine(line);
    if (!parsed) return false;

    const leftParticipant = parsed.left ? ctx.ensureParticipant(parsed.left.id) : null;
    const rightParticipant = parsed.right ? ctx.ensureParticipant(parsed.right.id) : null;
    applyInlineParticipantTitle(leftParticipant, parsed.left?.title || "");
    applyInlineParticipantTitle(rightParticipant, parsed.right?.title || "");

    /** @type {import("../../../model/diagram.mjs").Participant} */
    let src;
    /** @type {import("../../../model/diagram.mjs").Participant} */
    let dst;
    const arrow = parsed.arrow;

    if (parsed.incoming) {
      if (!rightParticipant) return true;
      src = rightParticipant;
      dst = rightParticipant;
      arrow.direction = "incoming";
    } else if (parsed.outgoing) {
      if (!leftParticipant) return true;
      src = leftParticipant;
      dst = leftParticipant;
      arrow.direction = "outgoing";
    } else if (parsed.reversed) {
      if (!leftParticipant || !rightParticipant) return true;
      src = rightParticipant;
      dst = leftParticipant;
      arrow.direction = "left";
    } else {
      if (!leftParticipant || !rightParticipant) return true;
      src = leftParticipant;
      dst = rightParticipant;
      arrow.direction = src === dst ? "self" : arrow.direction;
    }

    const msg = ctx.addMessage({
      from: src,
      to: dst,
      label: unescapeLabel(parsed.label),
      dashed: arrow.line.dashed,
      kind: src === dst && !parsed.incoming && !parsed.outgoing ? "self" : messageKind(arrow),
      startArrowhead: arrow.start.excalidrawArrowhead,
      endArrowhead: arrow.end.excalidrawArrowhead,
      arrow,
      color: arrow.line.color,
    });
    msg.lifecycle = parsed.lifecycle;
    msg.parallel = parsed.parallel;
    if (parsed.lifecycle === "++") {
      ctx.startActivation(dst, parsed.lifecycleColor || "", msg.seq, src);
    } else if (parsed.lifecycle === "--") {
      ctx.endActivation(src, msg.seq);
    } else if (parsed.lifecycle === "**") {
      msg.creates = true;
      ctx.markCreated(dst, msg.seq);
    } else if (parsed.lifecycle === "!!") {
      msg.destroys = true;
      ctx.markDestroyed(dst, msg.seq);
    }
    return true;
  },
};

/**
 * Message lines may implicitly declare participants, but they must not erase
 * explicit declarations such as multiline participant blocks.
 * @param {import("../../../model/diagram.mjs").Participant|null} participant Participant to update.
 * @param {string} title Inline title parsed from the message endpoint.
 * @returns {void}
 */
function applyInlineParticipantTitle(participant, title) {
  if (!participant || !title) return;
  if (participant.title === participant.id) participant.title = title;
}

/**
 * @param {SequenceArrow} arrow
 * @returns {string}
 */
function messageKind(arrow) {
  if (arrow.end.head === "open" || arrow.start.head === "open") return "async";
  if (arrow.line.dashed) return "reply";
  return "sync";
}

/**
 * @param {string} line
 * @returns {null | {
 *   left: {id:string,title:string}|null,
 *   right: {id:string,title:string}|null,
 *   label: string,
 *   lifecycle: string,
 *   lifecycleColor: string,
 *   arrow: SequenceArrow,
 *   incoming: boolean,
 *   outgoing: boolean,
 *   reversed: boolean,
 *   parallel: boolean,
 * }}
 */
function parseSequenceMessageLine(line) {
  let source = line.trim();
  const parallel = source.startsWith("&");
  if (parallel) source = source.slice(1).trimStart();
  const { body, label } = splitLabel(source);
  const span = findArrowSpan(body);
  if (!span) return null;

  const leftRaw = body.slice(0, span.start).trim();
  const rightRaw = body.slice(span.end).trim();
  const classified = classifyArrowToken(span.token);
  const incoming = classified.startAnchor !== "participant" && !leftRaw;
  const outgoing = classified.endAnchor !== "participant" && !rightRaw;

  const leftInfo = leftRaw
    ? parseLeftParticipant(leftRaw)
    : { participant: null, endpointLabel: "" };
  let left = leftInfo.participant;
  let rightInfo = rightRaw
    ? parseRightParticipant(rightRaw)
    : { participant: null, lifecycle: "", color: "", endpointLabel: "" };

  if (incoming && rightInfo.participant) left = null;
  if (outgoing) rightInfo = { participant: null, lifecycle: "", color: "", endpointLabel: "" };

  const arrow = new SequenceArrow({
    source: span.token,
    direction: classified.direction,
    start: {
      head: classified.startHead,
      anchor: classified.startAnchor,
      excalidrawArrowhead: arrowheadFor(classified.startHead),
      label: leftInfo.endpointLabel,
    },
    end: {
      head: classified.endHead,
      anchor: classified.endAnchor,
      excalidrawArrowhead: arrowheadFor(classified.endHead),
      label: rightInfo.endpointLabel,
    },
    line: {
      style: classified.dashed ? "dashed" : "solid",
      color: classified.color,
      slant: classified.slant,
    },
  });

  return {
    left,
    right: rightInfo.participant,
    label: label.trim(),
    lifecycle: rightInfo.lifecycle,
    lifecycleColor: rightInfo.color,
    arrow,
    incoming,
    outgoing,
    reversed: classified.reversed,
    parallel,
  };
}

/**
 * Split a message line into declaration body and label, ignoring colons in quotes.
 * @param {string} line
 * @returns {{body:string,label:string}}
 */
function splitLabel(line) {
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quote = !quote;
    if (ch === ":" && !quote) return { body: line.slice(0, i), label: line.slice(i + 1) };
  }
  return { body: line, label: "" };
}

/**
 * @param {string} body
 * @returns {{start:number,end:number,token:string}|null}
 */
function findArrowSpan(body) {
  let quote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      quote = !quote;
      continue;
    }
    if (quote || !ARROW_CHARS.has(ch)) continue;
    let j = i;
    while (j < body.length) {
      const current = body[j];
      if (current === "[" && body[j + 1] === "#") {
        const end = body.indexOf("]", j + 2);
        if (end < 0) break;
        j = end + 1;
        continue;
      }
      if (ARROW_CHARS.has(current)) {
        j++;
        continue;
      }
      if (current === "(" && /^\(\d+\)/.test(body.slice(j))) {
        const end = body.indexOf(")", j + 1);
        j = end + 1;
        continue;
      }
      break;
    }
    const token = body.slice(i, j);
    if (looksLikeArrow(token)) return { start: i, end: j, token };
  }
  return null;
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeArrow(token) {
  return token.includes("-") && /[<>\\/\]\?]/.test(token);
}

/**
 * @param {string} raw
 * @returns {{participant:{id:string,title:string}|null,lifecycle:string,color:string,endpointLabel:string}}
 */
function parseRightParticipant(raw) {
  let source = raw.trim();
  let endpointLabel = "";
  const possibleLabel = readToken(source);
  if (possibleLabel?.token.startsWith('"') && possibleLabel.rest.trim()) {
    const restFirst = readToken(possibleLabel.rest.trim());
    if (!restFirst || !LIFECYCLE.has(restFirst.token)) {
      endpointLabel = unescapeLabel(stripQuotes(possibleLabel.token));
      source = possibleLabel.rest.trim();
    }
  }
  const first = readToken(source);
  if (!first) return { participant: null, lifecycle: "", color: "", endpointLabel };
  let rest = first.rest.trim();
  let lifecycle = "";
  let color = "";
  const attached = first.token.match(/^(.*?)(\+\+|--|\*\*|!!)(?:\s+(#[\w-]+))?$/);
  let token = first.token;
  if (attached && attached[1]) {
    token = attached[1];
    lifecycle = attached[2];
    color = attached[3] || rest.split(/\s+/).find((part) => part.startsWith("#")) || "";
  } else if (rest) {
    const parts = rest.split(/\s+/);
    if (LIFECYCLE.has(parts[0])) {
      lifecycle = parts[0];
      color = parts[1]?.startsWith("#") ? parts[1] : "";
    }
  }
  return { participant: parseParticipantToken(token), lifecycle, color, endpointLabel };
}

/**
 * @param {string} raw
 * @returns {{participant:{id:string,title:string}|null,endpointLabel:string}}
 */
function parseLeftParticipant(raw) {
  const endpoint = raw.match(/^(.*?)\s+"([^"]*)"$/);
  if (!endpoint) return { participant: parseParticipantToken(raw), endpointLabel: "" };
  const participantRaw = endpoint[1].trim();
  if (!participantRaw) return { participant: parseParticipantToken(raw), endpointLabel: "" };
  return {
    participant: parseParticipantToken(participantRaw),
    endpointLabel: unescapeLabel(endpoint[2]),
  };
}

/**
 * @param {string} raw
 * @returns {{id:string,title:string}}
 */
function parseParticipantToken(raw) {
  const token = raw.trim();
  const stripped = stripQuotes(token);
  return { id: stripped, title: unescapeLabel(stripped) };
}

/**
 * @param {string} raw
 * @returns {{token:string,rest:string}|null}
 */
function readToken(raw) {
  if (!raw) return null;
  if (raw[0] === '"') {
    let end = 1;
    while (end < raw.length && raw[end] !== '"') end++;
    if (end < raw.length) end++;
    return { token: raw.slice(0, end), rest: raw.slice(end) };
  }
  const match = raw.match(/^(\S+)(?:\s+(.*))?$/);
  if (!match) return null;
  return { token: match[1], rest: match[2] || "" };
}

/**
 * @param {string} token
 * @returns {{
 *   dashed:boolean,
 *   color:string,
 *   slant:number,
 *   startHead:string,
 *   endHead:string,
 *   startAnchor:string,
 *   endAnchor:string,
 *   direction:string,
 *   reversed:boolean,
 * }}
 */
function classifyArrowToken(token) {
  let core = token.trim();
  const colorMatch = core.match(/\[#([^\]]+)\]/);
  const color = colorMatch ? `#${colorMatch[1].replace(/^#/, "")}` : "";
  core = core.replace(/\[#([^\]]+)\]/, "");
  const slantMatch = core.match(/\((\d+)\)/);
  const slant = slantMatch ? Number(slantMatch[1]) : 0;
  core = core.replace(/\(\d+\)/g, "");

  let startAnchor = "participant";
  let endAnchor = "participant";
  if (core.startsWith("[")) {
    startAnchor = "diagramLeft";
    core = core.slice(1);
  } else if (core.startsWith("?")) {
    startAnchor = "shortLeft";
    core = core.slice(1);
  }
  if (core.endsWith("]")) {
    endAnchor = "diagramRight";
    core = core.slice(0, -1);
  } else if (core.endsWith("?")) {
    endAnchor = "shortRight";
    core = core.slice(0, -1);
  }

  const startDecoration = core[0] === "x" ? "cross" : core[0] === "o" ? "circle" : "";
  if (startDecoration) core = core.slice(1);
  const endDecoration = core.endsWith("x") ? "cross" : core.endsWith("o") ? "circle" : "";
  if (endDecoration) core = core.slice(0, -1);

  const dashed = core.includes("--");
  const bidirectional = core.includes("<") && core.includes(">");
  const reversed = core.includes("<") && !core.includes(">");
  const open =
    core.includes(">>") || core.includes("<<") || core.includes("//") || core.includes("\\\\");
  const partialTop = core.includes("/") && !core.includes("//");
  const partialBottom = core.includes("\\") && !core.includes("\\\\");
  const defaultHead = partialTop
    ? "partialTop"
    : partialBottom
      ? "partialBottom"
      : open
        ? "open"
        : "filled";
  const startHead = startDecoration || (bidirectional ? defaultHead : "none");
  const endHead = endDecoration || defaultHead;
  const direction = bidirectional ? "bidirectional" : reversed ? "left" : "right";

  return {
    dashed,
    color,
    slant,
    startHead,
    endHead,
    startAnchor,
    endAnchor,
    direction,
    reversed,
  };
}

/**
 * @param {string} head
 * @returns {string|null}
 */
function arrowheadFor(head) {
  switch (head) {
    case "filled":
      return "triangle";
    case "open":
      return "arrow";
    case "partialTop":
      return "partial_top";
    case "partialBottom":
      return "partial_bottom";
    case "circle":
      return "circle_outline";
    case "cross":
      return "bar";
    default:
      return null;
  }
}
