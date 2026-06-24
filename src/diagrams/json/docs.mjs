/** @module diagrams/json/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class JsonDiagramDocs extends BaseModuleDocs {}
/** @public */
export const jsonDiagramDocs = new JsonDiagramDocs({
  examples: ["object-array", "highlight"],
  generatedPages: [],
  knownGaps: ["full PlantUML data table styling"],
});
