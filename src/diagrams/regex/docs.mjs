/** @module diagrams/regex/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class RegexDiagramDocs extends BaseModuleDocs {}
/** @public */
export const regexDiagramDocs = new RegexDiagramDocs({
  examples: ["literals-and-classes", "groups-and-repetition"],
  generatedPages: [],
  knownGaps: ["full regex engine parity", "localized descriptive names"],
});
