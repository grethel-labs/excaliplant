/** @module diagrams/chronology/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import {
  addPlanningDependency,
  addPlanningItem,
  createPlanningParseContext,
  preparePlanningLines,
} from "../shared/planning_runtime.mjs";
import { stripQuotes } from "../../util/plantuml_utils.mjs";

/** @typedef {import("../shared/planning_runtime.mjs").PlanningItemSpec} PlanningItemSpec */

/** @public */
export const chronologySyntaxPlugin = {
  name: "chronology.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const start = line.match(/^starts?\s+(?:on\s+)?(.+)$/i);
    if (start) {
      ctx.projectStart = start[1].trim();
      return true;
    }
    if (/^(?:ends?\s+(?:on\s+)?.+|scale\s+.+|printscale\s+.+)$/i.test(line)) return true;

    const dependency = line.match(
      /^\[([^\]]+)\]\s*(?:->|then|is\s+followed\s+by)\s*\[([^\]]+)\](?:\s*:\s*(.+))?$/i,
    );
    if (dependency) {
      addPlanningDependency(ctx, dependency[1], dependency[2], stripQuotes(dependency[3] || ""));
      return true;
    }

    const explicit = line.match(/^\[([^\]:]+)\s*:\s*([^\]]+)\]\s*(?:happens\s+)?(?:on\s+)?(.+)?$/i);
    if (explicit) {
      addChronologyItem(ctx, explicit[1], {
        label: stripQuotes(explicit[2]),
        date: (explicit[3] || "").trim(),
        milestone: true,
      });
      return true;
    }

    const happens = line.match(/^\[([^\]]+)\]\s+happens\s+(?:on\s+)?(.+)$/i);
    if (happens) {
      const item = parseChronologyTitle(happens[1]);
      addChronologyItem(ctx, item.title, {
        label: item.label,
        date: happens[2].trim(),
        milestone: true,
      });
      return true;
    }

    const range = line.match(/^\[([^\]]+)\]\s+(?:lasts|runs)\s+from\s+(.+?)\s+to\s+(.+)$/i);
    if (range) {
      const item = parseChronologyTitle(range[1]);
      addChronologyItem(ctx, item.title, {
        label: item.label,
        start: range[2].trim(),
        end: range[3].trim(),
      });
      return true;
    }

    return false;
  },
};

/** @param {string} raw */
function parseChronologyTitle(raw) {
  const parts = raw.split(/\s*:\s*/);
  if (parts.length < 2) return { title: raw, label: "" };
  return { title: parts[0], label: parts.slice(1).join(": ") };
}

/** @param {Record<string, any>} ctx @param {string} title @param {PlanningItemSpec} spec */
function addChronologyItem(ctx, title, spec) {
  const box = addPlanningItem(ctx, title, spec);
  if (spec.label)
    box.description = [box.description, `label: ${spec.label}`].filter(Boolean).join("\n");
  return box;
}

/** @public */
export const DEFAULT_CHRONOLOGY_PLUGINS = [chronologySyntaxPlugin];
/** @public */
export const createChronologyParseContext = () =>
  createPlanningParseContext("chronology", "Chronology");
/** @public @param {string[]} lines */
export const prepareChronologyLines = (lines) =>
  preparePlanningLines(lines, ["@startchronology", "@endchronology"]);
/** @public @param {string} text */
export const detectChronologyDiagram = (text) => /@startchronology\b/im.test(text);

/** @public */
export class ChronologyDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_CHRONOLOGY_PLUGINS,
      createParseContext: createChronologyParseContext,
      prepareLines: prepareChronologyLines,
      detect: detectChronologyDiagram,
    });
  }
}
/** @public */
export const chronologyDiagramParser = new ChronologyDiagramParser();
