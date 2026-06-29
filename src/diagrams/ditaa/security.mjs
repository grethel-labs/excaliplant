/** @module diagrams/ditaa/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class DitaaDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({ capabilities: ["sanitize", "limits"], maxNodes: 1_000, maxEdges: 1_000 });
  }
}
/** @public */
export const ditaaDiagramSecurity = new DitaaDiagramSecurity();
