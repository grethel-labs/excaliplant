/** @module diagrams/salt/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class SaltDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({ capabilities: ["sanitize", "limits"], maxNodes: 2_000, maxEdges: 500 });
  }
}
/** @public */
export const saltDiagramSecurity = new SaltDiagramSecurity();
