/** @module diagrams/ebnf/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class EbnfDiagramSecurity extends BaseModuleSecurity {}
/** @public */
export const ebnfDiagramSecurity = new EbnfDiagramSecurity({
  capabilities: ["sanitize", "limits"],
  maxNodes: 2_000,
  maxEdges: 2_000,
});
