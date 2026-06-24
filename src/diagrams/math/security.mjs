/** @module diagrams/math/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class MathDiagramSecurity extends BaseModuleSecurity {}
/** @public */
export const mathDiagramSecurity = new MathDiagramSecurity({
  capabilities: ["sanitize", "limits"],
  maxNodes: 100,
  maxEdges: 100,
});
