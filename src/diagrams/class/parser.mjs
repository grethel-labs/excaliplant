/**
 * Class diagram parser contract.
 * @module diagrams/class/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";

/** @public */
export const DEFAULT_CLASS_PLUGINS = DEFAULT_GRAPH_PLUGINS;

/** @public */
export const createClassParseContext = createGraphParseContext;

/** @public */
export const prepareClassLines = explodeBraces;

/** @public */
export class ClassDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_CLASS_PLUGINS,
      createParseContext: createClassParseContext,
      prepareLines: prepareClassLines,
      detect: detectClassDiagram,
    });
  }
}

/** @public */
export const classDiagramParser = new ClassDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectClassDiagram(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^skinparam\s+class\b/i.test(line)) return true;
    if (/^namespace\b/i.test(line)) return true;
    if (
      /^(?:abstract(?:\s+class)?|class|interface|enum|annotation|record|protocol|struct|exception|metaclass|stereotype|dataclass|circle)\b/i.test(
        line,
      )
    ) {
      return true;
    }
  }
  return false;
}
