/** @module diagrams/yaml/security */
import { BaseModuleSecurity } from "../base/security.mjs";
/** @public */
export class YamlDiagramSecurity extends BaseModuleSecurity {}
/** @public */
export const yamlDiagramSecurity = new YamlDiagramSecurity({
  capabilities: ["sanitize", "limits"],
  maxNodes: 2_000,
  maxEdges: 2_000,
});
