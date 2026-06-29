/** @module diagrams/ditaa/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { createSpecialParseContext, finalizeDitaa } from "../shared/special_runtime.mjs";
import { normalisePlantUmlText } from "../../util/plantuml_utils.mjs";

/** @public */
export const ditaaSyntaxPlugin = {
  name: "ditaa.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const inline = line.match(/^ditaa\s*(?:\(([^)]*)\))?$/i);
    if (inline) {
      ctx.options = normalisePlantUmlText(inline[1] || "");
      return true;
    }
    if (/^(?:skinparam|scale)\b/i.test(line)) return true;
    if (ctx.asciiLines.length < 240) ctx.asciiLines.push(line);
    return true;
  },
};

/** @public */
export const DEFAULT_DITAA_PLUGINS = [ditaaSyntaxPlugin];
/** @public */
export function createDitaaParseContext() {
  const ctx = createSpecialParseContext("ditaa", "Ditaa");
  ctx.finalize = () => finalizeDitaa(ctx);
  return ctx;
}
/** @public @param {string[]} lines */
export const prepareDitaaLines = (lines) => lines;
/** @public @param {string} text */
export const detectDitaaDiagram = (text) => /@startditaa\b|^\s*ditaa\s*(?:\(|$)/im.test(text);

/** @public */
export class DitaaDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_DITAA_PLUGINS,
      createParseContext: createDitaaParseContext,
      prepareLines: prepareDitaaLines,
      detect: detectDitaaDiagram,
    });
  }
}
/** @public */
export const ditaaDiagramParser = new DitaaDiagramParser();
