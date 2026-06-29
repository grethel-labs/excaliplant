/** @module diagrams/archimate/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { createGraphParseContext } from "../shared/graph_parser.mjs";
import { normalisePlantUmlText, slug, stripQuotes } from "../../util/plantuml_utils.mjs";

/** @public */
export const archimateSyntaxPlugin = {
  name: "archimate.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (/^!/.test(line) || /^legend\b/i.test(line) || /^endlegend$/i.test(line)) return true;
    const arch = line.match(
      /^archimate(?:\s+#([A-Za-z]+))?\s+(.+?)(?:\s+as\s+([A-Za-z_$][\w$.-]*))?(?:\s+<<([^>]+)>>)?$/i,
    );
    if (arch) {
      const title = normalisePlantUmlText(stripQuotes(arch[2].trim()));
      const id = arch[3] || slug(title);
      ctx.addBox({
        id,
        title,
        description: arch[1] || "Archimate",
        shape: "component",
        stereotype: arch[4] || arch[1] || "archimate",
      });
      return true;
    }
    const junction = line.match(/^(Junction_(?:And|Or))\s+([A-Za-z_$][\w$.-]*)$/i);
    if (junction) {
      ctx.addBox({
        id: junction[2],
        title: junction[2],
        shape: "interface",
        stereotype: junction[1],
      });
      return true;
    }
    const rect = line.match(/^rectangle\s+([A-Za-z_$][\w$.-]*)(?:\s+#([A-Za-z]+))?/i);
    if (rect) {
      ctx.addBox({ id: rect[1], title: rect[1], shape: "rectangle", stereotype: rect[2] || "" });
      return true;
    }
    const rel = line.match(
      /^([A-Za-z_$][\w$.-]*)\s+[-.a-zA-Z]*>\s+([A-Za-z_$][\w$.-]*)(?:\s*:\s*(.+))?$/,
    );
    if (rel) {
      ctx.setAutoVivifyConnections(true, "component");
      ctx.queueConnection({
        fromId: rel[1],
        toId: rel[2],
        label: normalisePlantUmlText(stripQuotes(rel[3] || "")),
        directionHint: "right",
        allowVivify: true,
      });
      return true;
    }
    return false;
  },
};

/** @public */
export const DEFAULT_ARCHIMATE_PLUGINS = [archimateSyntaxPlugin];

/** @public */
export function createArchimateParseContext() {
  const ctx = createGraphParseContext();
  ctx.diagram.kind = "archimate";
  ctx.setAutoVivifyConnections(true, "component");
  return ctx;
}

/** @public @param {string[]} lines */
export function prepareArchimateLines(lines) {
  return lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return !["@startuml", "@enduml", "@startarchimate", "@endarchimate"].includes(trimmed);
  });
}

/** @public @param {string} text */
export function detectArchimateDiagram(text) {
  return /@startarchimate\b|^\s*archimate\b|^\s*Junction_(?:And|Or)\b/im.test(text);
}

/** @public */
export class ArchimateDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_ARCHIMATE_PLUGINS,
      createParseContext: createArchimateParseContext,
      prepareLines: prepareArchimateLines,
      detect: detectArchimateDiagram,
    });
  }
}
/** @public */
export const archimateDiagramParser = new ArchimateDiagramParser();
