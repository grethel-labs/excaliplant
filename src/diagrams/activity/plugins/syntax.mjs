/**
 * Activity diagram parser plugin.
 * @module diagrams/activity/plugins/syntax
 */

import { Box, Connection, Diagram, Plane } from "../../../general/model/diagram.mjs";
import {
  extractPlantUmlLink,
  normalisePlantUmlText,
  sanitizePlantUmlColor,
  slug,
  stripQuotes,
} from "../../../util/plantuml_utils.mjs";
import { planeColor } from "../../../general/style/colors.mjs";

const CONTROL_WORDS =
  /^(?:start|stop|end|kill|detach|break|fork(?:\s+again)?|end\s+(?:fork|merge|split)|split(?:\s+again)?|else(?:\s*\(.+?\))?|elseif\b.*|endif|case\b.*|endswitch|repeat(?:\s+while\b.*)?|while\b.*|endwhile\b.*|backward\b.*|label\b.*|goto\b.*|\}|\{)$/i;

/**
 * @typedef {{from:string,to:string,label?:string,dashed?:boolean,hidden?:boolean}} ActivityEdge
 */

/**
 * @typedef {{
 *   id?: string,
 *   title: string,
 *   shape?: string,
 *   stereotype?: string,
 *   members?: string[],
 *   link?: string,
 *   tooltip?: string,
 *   connect?: boolean,
 *   activate?: boolean,
 *   edgeLabel?: string,
 *   dashed?: boolean,
 * }} ActivityNodeSpec
 */

/**
 * @returns {any}
 * @public
 */
export function createActivityParseContext() {
  const diagram = new Diagram();
  diagram.kind = "activity";
  const plane = new Plane({ id: "activity", title: "", color: planeColor("activity") });
  diagram.addPlane(plane);
  const boxes = new Map();
  /** @type {ActivityEdge[]} */
  const edges = [];
  let nodeCounter = 0;
  /** @type {string|null} */
  let lastId = null;

  const addBox = (
    /** @type {ActivityNodeSpec} */ {
      id = `activity_${nodeCounter++}`,
      title,
      shape = "state",
      stereotype = "",
      members = [],
      link = "",
      tooltip = "",
      connect = true,
      activate = true,
      edgeLabel = "",
      dashed = false,
    },
  ) => {
    const box = new Box({ id, title, shape, stereotype, members, link, tooltip });
    boxes.set(id, box);
    plane.addBox(box);
    if (connect && lastId && lastId !== id)
      edges.push({ from: lastId, to: id, label: edgeLabel, dashed });
    if (activate) lastId = id;
    return box;
  };

  return {
    get result() {
      return diagram;
    },
    diagram,
    boxes,
    get nodeCount() {
      return nodeCounter;
    },
    addNode(/** @type {ActivityNodeSpec} */ spec) {
      return addBox(spec);
    },
    connectTo(
      /** @type {string} */ id,
      /** @type {string} */ label = "",
      /** @type {boolean} */ dashed = false,
    ) {
      if (lastId && lastId !== id) edges.push({ from: lastId, to: id, label, dashed });
      lastId = id;
    },
    finalize() {
      for (const edge of edges) {
        if (edge.hidden) continue;
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        if (!from || !to || from === to) continue;
        diagram.addConnection(
          new Connection({
            id: `${edge.from}->${edge.to}#${diagram.connections.length}`,
            from,
            to,
            label: edge.label || "",
            dashed: !!edge.dashed,
            kind: edge.dashed ? "dependency" : "default",
            endArrowhead: "arrow",
          }),
        );
      }
    },
  };
}

/**
 * Join multiline `:action ... ;` blocks before the generic line engine runs.
 * @param {string[]} lines
 * @returns {string[]}
 * @public
 */
export function prepareActivityLines(lines) {
  /** @type {string[]} */
  const out = [];
  let action = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (action) {
      action += `\n${line}`;
      if (/;\s*(?:<<[^>]+>>)?\s*$/.test(line)) {
        out.push(action);
        action = "";
      }
      continue;
    }
    if (line.startsWith(":") && !/;\s*(?:<<[^>]+>>)?\s*$/.test(line)) {
      action = line;
      continue;
    }
    out.push(raw);
  }
  if (action) out.push(action);
  return out;
}

/**
 * @param {string} raw
 * @returns {{text:string,link:string,tooltip:string}}
 */
function parseLabel(raw) {
  return extractPlantUmlLink(normalisePlantUmlText(stripQuotes(raw.trim())));
}

/**
 * @param {string} raw
 * @returns {string}
 */
function endpointId(raw) {
  const clean = raw.trim();
  if (clean === "(*)") return "activity_end";
  if (clean.startsWith("(") && clean.endsWith(")")) return `connector_${slug(clean.slice(1, -1))}`;
  if (clean.startsWith('"') && clean.endsWith('"')) return `action_${slug(stripQuotes(clean))}`;
  return slug(clean);
}

/**
 * @param {any} ctx
 * @param {string} raw
 * @returns {string}
 */
function ensureLegacyEndpoint(ctx, raw) {
  const clean = raw.trim();
  const id = endpointId(clean);
  if (ctx.boxes.has(id)) return id;
  if (clean === "(*)") {
    ctx.addNode({ id, title: "", shape: "end", connect: false, activate: false });
    return id;
  }
  if (clean.startsWith("(") && clean.endsWith(")")) {
    const name = clean.slice(1, -1);
    ctx.addNode({
      id,
      title: normalisePlantUmlText(name),
      shape: "interface",
      connect: false,
      activate: false,
    });
    return id;
  }
  const parsed = parseLabel(clean);
  ctx.addNode({
    id,
    title: parsed.text,
    shape: "state",
    link: parsed.link,
    tooltip: parsed.tooltip,
    connect: false,
    activate: false,
  });
  return id;
}

/**
 * @param {string} op
 * @returns {{label:string,dashed:boolean,hidden:boolean}}
 */
function parseArrow(op) {
  const label = op.match(/\[([^\]]+)]/)?.[1] || "";
  return {
    label: normalisePlantUmlText(label),
    dashed: /dashed|dotted|\.\./i.test(op),
    hidden: /hidden/i.test(op),
  };
}

/**
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const activitySyntaxPlugin = {
  name: "activity.syntax",
  tryLine(line, ctx) {
    const clean = line.trim();
    if (!clean) return false;

    const presentation = clean.match(/^(title|caption)\s+(.+)$/i);
    if (presentation) {
      ctx.diagram[presentation[1].toLowerCase()] = normalisePlantUmlText(presentation[2]);
      return true;
    }
    if (/^skinparam\b/i.test(clean) || /^!pragma\b/i.test(clean) || /^<style>\s*$/i.test(clean)) {
      return true;
    }
    if (/^<\/style>\s*$/i.test(clean)) return true;
    if (/^(left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i.test(clean)) {
      ctx.diagram.layoutDirection = /^left/i.test(clean) ? "RIGHT" : "DOWN";
      return true;
    }

    const legacy = clean.match(
      /^(?:(\(\*\)|\([^)]+\)|"[^"]+"|[\w.]+)\s+)?([-.<>]+(?:\[[^\]]+])?[-.<>]*)(?:\s+(\(\*\)|\([^)]+\)|"[^"]+"|[\w.]+))?$/i,
    );
    if (legacy && (legacy[1] || legacy[3])) {
      const arrow = parseArrow(legacy[2]);
      if (legacy[1]) ctx.connectTo(ensureLegacyEndpoint(ctx, legacy[1]));
      if (legacy[3]) ctx.connectTo(ensureLegacyEndpoint(ctx, legacy[3]), arrow.label, arrow.dashed);
      return true;
    }

    const action = clean.match(/^:(.+);\s*(?:<<([^>]+)>>)?$/s);
    if (action) {
      const parsed = parseLabel(action[1]);
      const stereo = action[2]?.trim() || "";
      const color = sanitizePlantUmlColor(stereo.replace(/^#/, ""));
      ctx.addNode({
        title: parsed.text,
        shape: "state",
        stereotype: stereo && !color ? stereo : "",
        link: parsed.link,
        tooltip: parsed.tooltip,
      });
      return true;
    }

    const list = clean.match(/^([-*]+)\s+(.+)$/);
    if (list) {
      ctx.addNode({ title: normalisePlantUmlText(list[2]), shape: "state" });
      return true;
    }

    const startStop = clean.toLowerCase();
    if (startStop === "start") {
      ctx.addNode({ id: "activity_start", title: "", shape: "start" });
      return true;
    }
    if (
      startStop === "stop" ||
      startStop === "end" ||
      startStop === "kill" ||
      startStop === "detach"
    ) {
      ctx.addNode({ id: `${startStop}_${ctx.nodeCount}`, title: "", shape: "end" });
      return true;
    }

    const branch = clean.match(/^(if|elseif|while|switch|repeat\s+while)\s*\((.+?)\)/i);
    if (branch) {
      ctx.addNode({ title: normalisePlantUmlText(branch[2]), shape: "choice" });
      return true;
    }
    if (/^(else|case)\b/i.test(clean)) {
      const label = clean.match(/\((.+?)\)/)?.[1] || clean.split(/\s+/)[0];
      ctx.addNode({ title: normalisePlantUmlText(label), shape: "choice" });
      return true;
    }
    if (/^(endif|endswitch|endwhile|repeat|backward\b)/i.test(clean)) {
      if (/^repeat$/i.test(clean)) ctx.addNode({ title: "repeat", shape: "choice" });
      return true;
    }

    if (/^(fork|split)\b/i.test(clean)) {
      ctx.addNode({ title: clean.toLowerCase(), shape: "fork" });
      return true;
    }
    if (/^(fork again|split again|end fork|end merge|end split)\b/i.test(clean)) {
      ctx.addNode({ title: clean.toLowerCase(), shape: "join" });
      return true;
    }

    const swimlane = clean.match(/^\|(?:#([A-Za-z0-9_#]+))?([^|]+)\|$/);
    if (swimlane) {
      ctx.addNode({
        title: normalisePlantUmlText(swimlane[2]),
        shape: "state",
        stereotype: "swimlane",
      });
      return true;
    }

    const container = clean.match(
      /^(partition|group|package|rectangle|card)\s+(?:#[^\s]+\s+)?(?:"([^"]+)"|([^{]+?))\s*\{$/i,
    );
    if (container) {
      ctx.addNode({
        title: normalisePlantUmlText(container[2] || container[3] || container[1]),
        shape: "state",
        stereotype: container[1].toLowerCase(),
      });
      return true;
    }
    if (clean === "}") return true;

    const connector = clean.match(/^(?:#[A-Za-z0-9_#]+:)?\(([^)]+)\)$/);
    if (connector) {
      ctx.addNode({
        id: `connector_${slug(connector[1])}`,
        title: normalisePlantUmlText(connector[1]),
        shape: "interface",
      });
      return true;
    }

    const noteLine = clean.match(
      /^(?:floating\s+)?note\s+(?:left|right|top|bottom)?\s*:?\s*(.*)$/i,
    );
    if (noteLine) {
      const text = noteLine[1] || "note";
      ctx.addNode({ title: "note", shape: "note", members: [normalisePlantUmlText(text)] });
      return true;
    }
    if (/^end\s+note$/i.test(clean)) return true;

    const label = clean.match(/^label\s+(\S+)/i);
    if (label) {
      ctx.addNode({ id: `label_${slug(label[1])}`, title: label[1], shape: "interface" });
      return true;
    }
    const go = clean.match(/^goto\s+(\S+)/i);
    if (go) {
      ctx.addNode({ title: `goto ${go[1]}`, shape: "state" });
      return true;
    }

    if (CONTROL_WORDS.test(clean)) return true;
    return false;
  },
};

export default activitySyntaxPlugin;
