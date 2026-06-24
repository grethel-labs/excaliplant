/**
 * Shared parser/runtime helpers for PlantUML JSON/YAML data diagrams.
 * @module diagrams/shared/data_runtime
 */

import { Box, Connection, Diagram, Plane } from "../../general/model/diagram.mjs";
import { slug, stripQuotes } from "../../util/plantuml_utils.mjs";
import { GRAPH_RENDERERS, layoutGraphModel } from "./graph_runtime.mjs";

const MAX_DATA_NODES = 2_000;

/** @public */
export const dataRenderers = GRAPH_RENDERERS;

/** @public */
export const layoutDataDiagram = layoutGraphModel;

/** @param {string} text @param {string} startDirective @param {string} endDirective */
export function detectDataDiagram(text, startDirective, endDirective) {
  const lower = text.toLowerCase();
  return lower.includes(startDirective) || lower.includes(endDirective);
}

/** @param {string[]} lines @param {string} startDirective @param {string} endDirective */
export function prepareDataLines(lines, startDirective, endDirective) {
  return lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return trimmed !== startDirective && trimmed !== endDirective && trimmed !== "@enduml";
  });
}

/** @param {"json"|"yaml"} kind */
export function createDataParseContext(kind) {
  const diagram = new Diagram();
  diagram.kind = kind;
  const plane = diagram.addPlane(new Plane({ id: `${kind}-plane`, title: kind.toUpperCase() }));
  /** @type {Record<string, any>} */
  const ctx = {
    diagram,
    plane,
    kind,
    title: "",
    body: [],
    highlights: [],
    styles: [],
    inStyle: false,
  };
  ctx.finalize = () => {
    ctx.result = finalizeDataDiagram(ctx, kind);
  };
  return ctx;
}

/** @param {Record<string, any>} ctx @param {string} line */
export function collectDataLine(ctx, line) {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^title\s+/i.test(trimmed)) {
    ctx.title = trimmed.replace(/^title\s+/i, "").trim();
    ctx.diagram.title = ctx.title;
    return true;
  }
  if (/^<style>/i.test(trimmed) || ctx.inStyle) {
    ctx.styles.push(line);
    ctx.inStyle = !/<\/style>/i.test(trimmed);
    return true;
  }
  const highlight = parseHighlight(trimmed);
  if (highlight) {
    ctx.highlights.push(highlight);
    return true;
  }
  ctx.body.push(line);
  return true;
}

/** @param {Record<string, any>} ctx @param {"json"|"yaml"} kind */
export function finalizeDataDiagram(ctx, kind) {
  const data = kind === "json" ? parseJson(ctx.body) : parseYaml(ctx.body);
  buildDataGraph(ctx, data, kind);
  return ctx.diagram;
}

/** @param {string[]} lines */
function parseJson(lines) {
  const text = lines.join("\n").trim();
  if (!text) return null;
  return JSON.parse(text);
}

/** @param {string[]} lines */
export function parseYaml(lines) {
  const meaningful = lines.filter((line) => line.trim() && !/^\s*#/.test(line));
  const [value] = parseYamlBlock(meaningful, 0, 0);
  return value;
}

/** @param {string[]} lines @param {number} index @param {number} indent @returns {[any, number]} */
function parseYamlBlock(lines, index, indent) {
  if (index >= lines.length) return [null, index];
  const first = lines[index];
  const firstIndent = countIndent(first);
  if (firstIndent < indent) return [null, index];
  if (first.trimStart().startsWith("- ")) return parseYamlSequence(lines, index, firstIndent);
  return parseYamlMap(lines, index, firstIndent);
}

/** @param {string[]} lines @param {number} index @param {number} indent @returns {[any[], number]} */
function parseYamlSequence(lines, index, indent) {
  const out = [];
  while (index < lines.length) {
    const line = lines[index];
    const currentIndent = countIndent(line);
    const trimmed = line.trimStart();
    if (currentIndent !== indent || !trimmed.startsWith("- ")) break;
    const valueText = trimmed.slice(2).trim();
    if (valueText) out.push(parseYamlScalar(valueText));
    else {
      const [child, next] = parseYamlBlock(lines, index + 1, indent + 2);
      out.push(child);
      index = next - 1;
    }
    index++;
  }
  return [out, index];
}

/** @param {string[]} lines @param {number} index @param {number} indent @returns {[Record<string, any>, number]} */
function parseYamlMap(lines, index, indent) {
  /** @type {Record<string, any>} */
  const out = Object.create(null);
  while (index < lines.length) {
    const line = lines[index];
    const currentIndent = countIndent(line);
    if (currentIndent < indent) break;
    if (currentIndent > indent) {
      index++;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) break;
    const colon = trimmed.indexOf(":");
    if (colon < 0) {
      out[trimmed] = "";
      index++;
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (rest) {
      out[key] = parseYamlScalar(rest);
      index++;
    } else {
      const [child, next] = parseYamlBlock(lines, index + 1, indent + 2);
      if (child === null && lines[index + 1]?.trimStart().startsWith("- ")) {
        const [sequenceChild, sequenceNext] = parseYamlBlock(lines, index + 1, 0);
        out[key] = sequenceChild;
        index = sequenceNext;
        continue;
      }
      out[key] = child;
      index = next;
    }
  }
  return [out, index];
}

/** @param {string} value */
function parseYamlScalar(value) {
  const unquoted = stripQuotes(value);
  if (/^(?:true|false)$/i.test(unquoted)) return /^true$/i.test(unquoted);
  if (/^null$/i.test(unquoted)) return null;
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(unquoted)) return Number(unquoted);
  return unquoted;
}

/** @param {string} line */
function countIndent(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

/** @param {string} line */
function parseHighlight(line) {
  const match = line.match(/^#highlight\s+(.+?)(?:\s+<<([^>]+)>>)?$/i);
  if (!match) return null;
  const path = [];
  for (const part of match[1].split(/\s*\/\s*/)) {
    const trimmed = part.trim();
    if (trimmed) path.push(stripQuotes(trimmed));
  }
  return { path, style: match[2] || "" };
}

/** @param {Record<string, any>} ctx @param {any} data @param {"json"|"yaml"} kind */
function buildDataGraph(ctx, data, kind) {
  const highlighted = new Set(
    ctx.highlights.map((/** @type {{path:string[]}} */ h) => h.path.join("/")),
  );
  let count = 0;
  const root = addDataBox(ctx, "root", data, [], highlighted, count++);
  walkData(ctx, root, data, [], highlighted, count);
  if (ctx.title) ctx.plane.title = `${kind.toUpperCase()}: ${ctx.title}`;
}

/** @param {Record<string, any>} ctx @param {Box} parent @param {any} value @param {string[]} path @param {Set<string>} highlighted @param {number} count */
function walkData(ctx, parent, value, path, highlighted, count) {
  if (count > MAX_DATA_NODES) throw new RangeError("data diagram exceeds max node count");
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const childPath = [...path, String(index)];
      const child = addDataBox(ctx, `[${index}]`, item, childPath, highlighted, count + index);
      connect(ctx, parent, child);
      if (isContainer(item)) walkData(ctx, child, item, childPath, highlighted, count + index + 1);
    });
  } else if (isRecord(value)) {
    Object.keys(value).forEach((key, index) => {
      const childPath = [...path, key];
      const child = addDataBox(ctx, key, value[key], childPath, highlighted, count + index);
      connect(ctx, parent, child);
      if (isContainer(value[key]))
        walkData(ctx, child, value[key], childPath, highlighted, count + index + 1);
    });
  }
}

/** @param {Record<string, any>} ctx @param {string} key @param {any} value @param {string[]} path @param {Set<string>} highlighted @param {number} index */
function addDataBox(ctx, key, value, path, highlighted, index) {
  const pathKey = path.join("/");
  const isHit = highlighted.has(pathKey);
  const box = new Box({
    id: `${ctx.kind}-${index}-${slug(pathKey || "root")}`,
    title: key,
    description: describeValue(value),
    shape: isContainer(value) ? "map" : "rectangle",
    stereotype: isHit ? "<<highlight>>" : "",
  });
  ctx.plane.addBox(box);
  return box;
}

/** @param {Record<string, any>} ctx @param {Box} from @param {Box} to */
function connect(ctx, from, to) {
  ctx.diagram.addConnection(
    new Connection({
      id: `${from.id}-to-${to.id}`,
      from,
      to,
      directionHint: "right",
    }),
  );
}

/** @param {any} value */
function describeValue(value) {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (isRecord(value)) return `object(${Object.keys(value).length})`;
  if (value === null) return "null";
  return String(value);
}

/** @param {any} value */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {any} value */
function isContainer(value) {
  return Array.isArray(value) || isRecord(value);
}
