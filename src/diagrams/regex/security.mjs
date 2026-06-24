/** @module diagrams/regex/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class RegexDiagramSecurity extends BaseModuleSecurity {}
/** @public */
export const regexDiagramSecurity = new RegexDiagramSecurity({
  capabilities: ["sanitize", "limits"],
  maxNodes: 2_000,
  maxEdges: 2_000,
});
