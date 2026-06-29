/** @module diagrams/nwdiag/docs */
import { BaseModuleDocs } from "../base/docs.mjs";
/** @public */
export class NwdiagDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: ["single-network", "multi-network"],
      generatedPages: [],
      knownGaps: ["packetdiag bit fields", "rackdiag physical rack slots"],
    });
  }
}
/** @public */
export const nwdiagDiagramDocs = new NwdiagDiagramDocs();
