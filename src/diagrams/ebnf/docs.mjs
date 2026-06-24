/** @module diagrams/ebnf/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class EbnfDiagramDocs extends BaseModuleDocs {}
/** @public */
export const ebnfDiagramDocs = new EbnfDiagramDocs({
  examples: ["binary-digit", "all-elements"],
  generatedPages: [],
  knownGaps: ["full ISO EBNF repetition semantics", "compact drawing mode"],
});
