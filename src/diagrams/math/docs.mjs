/** @module diagrams/math/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class MathDiagramDocs extends BaseModuleDocs {}
/** @public */
export const mathDiagramDocs = new MathDiagramDocs({
  examples: ["standalone-asciimath", "standalone-latex"],
  generatedPages: [],
  knownGaps: ["native formula shaping", "external JLaTeXMath rendering"],
});
