/** @module diagrams/ie/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class IeDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({ capabilities: ["sanitize", "limits"], maxNodes: 5_000, maxEdges: 5_000 });
  }
}
/** @public */
export const ieDiagramSecurity = new IeDiagramSecurity();
