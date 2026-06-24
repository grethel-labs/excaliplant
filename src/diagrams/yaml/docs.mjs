/** @module diagrams/yaml/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class YamlDiagramDocs extends BaseModuleDocs {}
/** @public */
export const yamlDiagramDocs = new YamlDiagramDocs({
  examples: ["mapping-sequence", "unicode-keys"],
  generatedPages: [],
  knownGaps: ["anchors and advanced YAML schema tags"],
});
