/** @module diagrams/mindmap/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import {
  addTreeNode,
  createTreeParseContext,
  parseHierarchyLine,
  prepareTreeLines,
} from "../shared/tree_runtime.mjs";

/** @public */
export const mindmapSyntaxPlugin = {
  name: "mindmap.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (/^(?:left|right|top|bottom)\s+side$/i.test(line)) return true;
    const parsed = parseHierarchyLine(line);
    if (!parsed) return false;
    addTreeNode(ctx, parsed.level, parsed.label, "rectangle", "<<mindmap>>");
    return true;
  },
};

/** @public */
export const DEFAULT_MINDMAP_PLUGINS = [mindmapSyntaxPlugin];
/** @public */
export const createMindmapParseContext = () => createTreeParseContext("mindmap", "Mindmap");
/** @public @param {string[]} lines */
export const prepareMindmapLines = (lines) =>
  prepareTreeLines(lines, ["@startmindmap", "@endmindmap"]);
/** @public @param {string} text */
export const detectMindmapDiagram = (text) => /@startmindmap\b/im.test(text);

/** @public */
export class MindmapDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_MINDMAP_PLUGINS,
      createParseContext: createMindmapParseContext,
      prepareLines: prepareMindmapLines,
      detect: detectMindmapDiagram,
    });
  }
}
/** @public */
export const mindmapDiagramParser = new MindmapDiagramParser();
