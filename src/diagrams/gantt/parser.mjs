/** @module diagrams/gantt/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import {
  addPlanningDependency,
  addPlanningItem,
  createPlanningParseContext,
  preparePlanningLines,
} from "../shared/planning_runtime.mjs";
import { stripQuotes } from "../../util/plantuml_utils.mjs";

/** @public */
export const ganttSyntaxPlugin = {
  name: "gantt.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const start = line.match(/^Project\s+starts\s+(.+)$/i);
    if (start) {
      ctx.projectStart = start[1].trim();
      return true;
    }
    if (/^--.*--$/.test(line) || /^(?:saturday|sunday|printscale|language)\b/i.test(line))
      return true;
    const task = line.match(/^\[([^\]]+)\]\s+(?:requires|lasts)\s+(.+)$/i);
    if (task) {
      addPlanningItem(ctx, task[1], { duration: task[2].trim(), projectStart: ctx.projectStart });
      return true;
    }
    const starts = line.match(/^\[([^\]]+)\]\s+starts\s+(.+)$/i);
    if (starts) {
      addPlanningItem(ctx, starts[1], { start: starts[2].trim() });
      return true;
    }
    const ends = line.match(/^\[([^\]]+)\]\s+ends\s+(.+)$/i);
    if (ends) {
      addPlanningItem(ctx, ends[1], { end: ends[2].trim() });
      return true;
    }
    const milestone = line.match(/^\[([^\]]+)\]\s+happens\s+(.+)$/i);
    if (milestone) {
      addPlanningItem(ctx, milestone[1], { date: milestone[2].trim(), milestone: true });
      return true;
    }
    const dep = line.match(
      /^\[([^\]]+)\]\s+(?:then|is\s+followed\s+by)\s+\[([^\]]+)\](?:\s*:\s*(.+))?$/i,
    );
    if (dep) {
      addPlanningDependency(ctx, dep[1], dep[2], stripQuotes(dep[3] || ""));
      return true;
    }
    return false;
  },
};

/** @public */
export const DEFAULT_GANTT_PLUGINS = [ganttSyntaxPlugin];
/** @public */
export const createGanttParseContext = () => createPlanningParseContext("gantt", "Gantt");
/** @public @param {string[]} lines */
export const prepareGanttLines = (lines) =>
  preparePlanningLines(lines, ["@startgantt", "@endgantt"]);
/** @public @param {string} text */
export const detectGanttDiagram = (text) => /@startgantt\b/im.test(text);

/** @public */
export class GanttDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_GANTT_PLUGINS,
      createParseContext: createGanttParseContext,
      prepareLines: prepareGanttLines,
      detect: detectGanttDiagram,
    });
  }
}
/** @public */
export const ganttDiagramParser = new GanttDiagramParser();
