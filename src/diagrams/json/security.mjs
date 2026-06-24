/** @module diagrams/json/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class JsonDiagramSecurity extends BaseModuleSecurity {}
/** @public */
export const jsonDiagramSecurity = new JsonDiagramSecurity({
  capabilities: ["sanitize", "limits"],
  maxNodes: 2_000,
  maxEdges: 2_000,
});
