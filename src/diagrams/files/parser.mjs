/** @module diagrams/files/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { addFilePath, createTreeParseContext, prepareTreeLines } from "../shared/tree_runtime.mjs";

/** @public */
export const filesSyntaxPlugin = {
  name: "files.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const trimmed = line.trim();
    if (!trimmed || /^title\s+/i.test(trimmed)) return true;
    if (!trimmed.startsWith("/")) return false;
    addFilePath(ctx, trimmed);
    return true;
  },
};
/** @public */
export const DEFAULT_FILES_PLUGINS = [filesSyntaxPlugin];
/** @public */
export const createFilesParseContext = () => createTreeParseContext("files", "Files");
/** @public @param {string[]} lines */
export const prepareFilesLines = (lines) => prepareTreeLines(lines, ["@startfiles", "@endfiles"]);
/** @public @param {string} text */
export const detectFilesDiagram = (text) => /@startfiles\b/im.test(text);

/** @public */
export class FilesDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_FILES_PLUGINS,
      createParseContext: createFilesParseContext,
      prepareLines: prepareFilesLines,
      detect: detectFilesDiagram,
    });
  }
}
/** @public */
export const filesDiagramParser = new FilesDiagramParser();
