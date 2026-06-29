/** @module diagrams/wbs/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import {
  addTreeNode,
  createTreeParseContext,
  parseHierarchyLine,
  prepareTreeLines,
} from "../shared/tree_runtime.mjs";

/** @public */
export const wbsSyntaxPlugin = {
  name: "wbs.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (/^(?:left|right|top|bottom)\s+direction$/i.test(line)) return true;
    const parsed = parseHierarchyLine(line);
    if (!parsed) return false;
    addTreeNode(ctx, parsed.level, parsed.label, "rectangle", "<<wbs>>");
    return true;
  },
};

/** @public */
export const DEFAULT_WBS_PLUGINS = [wbsSyntaxPlugin];
/** @public */
export const createWbsParseContext = () => createTreeParseContext("wbs", "WBS");
/** @public @param {string[]} lines */
export const prepareWbsLines = (lines) => prepareTreeLines(lines, ["@startwbs", "@endwbs"]);
/** @public @param {string} text */
export const detectWbsDiagram = (text) => /@startwbs\b/im.test(text);

/** @public */
export class WbsDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_WBS_PLUGINS,
      createParseContext: createWbsParseContext,
      prepareLines: prepareWbsLines,
      detect: detectWbsDiagram,
    });
  }
}
/** @public */
export const wbsDiagramParser = new WbsDiagramParser();
