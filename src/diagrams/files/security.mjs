/** @module diagrams/files/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class FilesDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({ capabilities: ["sanitize", "limits"], maxNodes: 10_000, maxEdges: 10_000 });
  }
}
/** @public */
export const filesDiagramSecurity = new FilesDiagramSecurity();
