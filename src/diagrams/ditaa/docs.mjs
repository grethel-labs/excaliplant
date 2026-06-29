/** @module diagrams/ditaa/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class DitaaDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["ascii-canvas", "inline-options"],
      generatedPages: [],
      knownGaps: ["native Ditaa raster effect fidelity", "ASCII connector semantic extraction"],
    });
  }
}
/** @public */
export const ditaaDiagramDocs = new DitaaDiagramDocs();
