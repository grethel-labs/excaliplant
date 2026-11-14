/**
 * Apply `skinparam` and `<style>` values (collected in {@link DiagramMeta.skin})
 * to a theme. Only sanitised colours and clamped numbers reach the theme.
 * @module syntax/skin
 */

import { parseColor } from "./color.mjs";

/** PlantUML element names → theme roles. */
const ELEMENT_ROLES = new Map(
  Object.entries({
    class: ["class"],
    abstract: ["abstract"],
    abstractclass: ["abstract"],
    interface: ["interface"],
    enum: ["enum"],
    annotation: ["annotation"],
    entity: ["entity"],
    object: ["object"],
    map: ["map"],
    json: ["json"],
    component: ["component"],
    node: ["node"],
    database: ["database"],
    storage: ["storage"],
    queue: ["queue"],
    cloud: ["cloud"],
    artifact: ["artifact"],
    file: ["file"],
    card: ["card"],
    usecase: ["usecase"],
    actor: ["actor"],
    boundary: ["boundary"],
    control: ["control"],
    rectangle: ["default"],
    agent: ["default"],
    folder: ["package"],
    frame: ["package"],
    package: ["package"],
    note: ["note"],
    arrow: ["edge", "message"],
    participant: ["participant"],
    sequenceparticipant: ["participant"],
    sequencelifeline: ["lifeline"],
    lifeline: ["lifeline"],
    sequencegroup: ["fragment"],
    group: ["fragment"],
    sequencebox: ["participantBox"],
    box: ["participantBox"],
    sequencedivider: ["divider"],
    sequencereference: ["reference"],
    state: ["state"],
    activity: ["action"],
    action: ["action"],
    activitydiamond: ["decision"],
    diamond: ["decision"],
    partition: ["partition"],
    swimlane: ["swimlane"],
    legend: ["legend"],
    title: ["title"],
    caption: ["caption"],
    header: ["header"],
    footer: ["footer"],
    archimate: ["default"],
  }),
);

/** All shape roles affected by the generic `element` selector. */
const ALL_NODE_ROLES = [
  "default",
  "class",
  "abstract",
  "interface",
  "enum",
  "annotation",
  "entity",
  "object",
  "map",
  "component",
  "node",
  "database",
  "storage",
  "queue",
  "cloud",
  "artifact",
  "file",
  "card",
  "usecase",
  "participant",
  "state",
  "action",
];

const PROPERTIES = new Map(
  Object.entries({
    backgroundcolor: "fill",
    bordercolor: "stroke",
    linecolor: "stroke",
    color: "stroke",
    fontcolor: "text",
    fontsize: "fontSize",
    borderthickness: "strokeWidth",
    linethickness: "strokeWidth",
    thickness: "strokeWidth",
    linestyle: "strokeStyle",
    borderstyle: "strokeStyle",
    roundcorner: "rounded",
  }),
);

/**
 * @param {string} key
 * @returns {{ element: string, prop: string } | null}
 */
function splitKey(key) {
  const dot = key.lastIndexOf(".");
  if (dot >= 0) return { element: key.slice(0, dot), prop: key.slice(dot + 1) };
  for (const prop of PROPERTIES.keys()) {
    if (key.endsWith(prop)) return { element: key.slice(0, -prop.length), prop };
  }
  return null;
}

/**
 * @param {string} prop Theme property.
 * @param {string} raw Raw skin value.
 */
function convert(prop, raw) {
  if (prop === "fill" || prop === "stroke" || prop === "text") return parseColor(raw);
  if (prop === "fontSize") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(6, Math.min(72, n)) : null;
  }
  if (prop === "strokeWidth") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0.5, Math.min(12, n)) : null;
  }
  if (prop === "strokeStyle") return /dot/i.test(raw) ? "dotted" : /[-\d]|dash/i.test(raw) ? "dashed" : "solid";
  if (prop === "rounded") return Number(raw) > 0;
  return null;
}

/**
 * Apply skin values to a theme in place.
 * @param {import("../draw/theme.mjs").Theme} theme
 * @param {Map<string, string>} skin
 */
export function applySkin(theme, skin) {
  for (const [key, raw] of skin) {
    if (key === "backgroundcolor" || key === "document.backgroundcolor" || key === "root.backgroundcolor") {
      const c = parseColor(raw);
      if (c) theme.background = c === "transparent" ? "#ffffff" : c;
      continue;
    }
    if (key === "monochrome" && /^(true|reverse)$/i.test(raw)) {
      const reverse = /reverse/i.test(raw);
      const ink = reverse ? "#ffffff" : "#1e1e1e";
      const paper = reverse ? "#000000" : "#ffffff";
      theme.background = paper;
      theme.ink = ink;
      for (const r of Object.values(theme.roles)) {
        if (r.fill && r.fill !== "transparent") r.fill = paper;
        if (r.stroke && r.stroke !== "transparent") r.stroke = ink;
        r.text = ink;
      }
      theme.palette = theme.palette.map(() => ({ fill: paper, stroke: ink }));
      continue;
    }
    if (key === "defaultfontsize" || key === "element.fontsize") {
      const v = convert("fontSize", raw);
      if (typeof v === "number") theme.fontSize = v;
      continue;
    }
    if (key === "defaultfontcolor") {
      const c = parseColor(raw);
      if (c) for (const r of Object.values(theme.roles)) r.text = c;
      continue;
    }
    if (key === "arrowfontcolor") {
      const c = parseColor(raw);
      if (c) theme.roles.edge.text = theme.roles.edgeLabel.text = theme.roles.message.text = c;
      continue;
    }
    if (key === "arrowcolor" || key === "arrow.linecolor") {
      const c = parseColor(raw);
      if (c) theme.roles.edge.stroke = theme.roles.message.stroke = c;
      continue;
    }
    const parts = splitKey(key);
    if (!parts) continue;
    const prop = PROPERTIES.get(parts.prop);
    if (!prop) continue;
    const value = convert(prop, raw);
    if (value === null || value === undefined) continue;
    const element = parts.element.replace(/[^a-z]/g, "");
    const targets = element === "element" || element === "default" || element === "" ? ALL_NODE_ROLES : (ELEMENT_ROLES.get(element) ?? []);
    for (const role of targets) {
      const r = theme.roles[role];
      if (r) /** @type {any} */ (r)[prop] = value;
    }
  }
}
