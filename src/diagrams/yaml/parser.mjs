/** @module diagrams/yaml/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import {
  collectDataLine,
  createDataParseContext,
  detectDataDiagram,
  finalizeDataDiagram,
  prepareDataLines,
} from "../shared/data_runtime.mjs";

/** @public */
export const yamlSyntaxPlugin = {
  name: "yaml.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    return collectDataLine(ctx, line);
  },
  /** @param {Record<string, any>} ctx */
  finish(ctx) {
    return finalizeDataDiagram(ctx, "yaml");
  },
};

/** @public */
export const DEFAULT_YAML_PLUGINS = [yamlSyntaxPlugin];
/** @public @param {string} text */
export const detectYamlDiagram = (text) => detectDataDiagram(text, "@startyaml", "@endyaml");
/** @public */
/** @param {string[]} lines */
export const prepareYamlLines = (lines) => prepareDataLines(lines, "@startyaml", "@endyaml");
/** @public */
export const createYamlParseContext = () => createDataParseContext("yaml");

/** @public */
export class YamlDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_YAML_PLUGINS,
      createParseContext: createYamlParseContext,
      prepareLines: prepareYamlLines,
      detect: detectYamlDiagram,
    });
  }
}
/** @public */
export const yamlDiagramParser = new YamlDiagramParser();
