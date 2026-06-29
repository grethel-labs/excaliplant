/** @module diagrams/archimate/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class ArchimateDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({ capabilities: ["sanitize", "limits"], maxNodes: 2_000, maxEdges: 2_000 });
  }
}
/** @public */
export const archimateDiagramSecurity = new ArchimateDiagramSecurity();
