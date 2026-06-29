/** @module diagrams/json/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import {
  collectDataLine,
  createDataParseContext,
  detectDataDiagram,
  finalizeDataDiagram,
  prepareDataLines,
} from "../shared/data_runtime.mjs";

/** @public */
export const jsonSyntaxPlugin = {
  name: "json.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    return collectDataLine(ctx, line);
  },
  /** @param {Record<string, any>} ctx */
  finish(ctx) {
    return finalizeDataDiagram(ctx, "json");
  },
};

/** @public */
export const DEFAULT_JSON_PLUGINS = [jsonSyntaxPlugin];
/** @public @param {string} text */
export const detectJsonDiagram = (text) => detectDataDiagram(text, "@startjson", "@endjson");
/** @public */
/** @param {string[]} lines */
export const prepareJsonLines = (lines) => prepareDataLines(lines, "@startjson", "@endjson");
/** @public */
export const createJsonParseContext = () => createDataParseContext("json");

/** @public */
export class JsonDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_JSON_PLUGINS,
      createParseContext: createJsonParseContext,
      prepareLines: prepareJsonLines,
      detect: detectJsonDiagram,
    });
  }
}

/** @public */
export const jsonDiagramParser = new JsonDiagramParser();
