/**
 * Component diagram security contract.
 * @module diagrams/component/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class ComponentDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "diagram-arrow"],
      securityTestCases: ["component-xss", "component-limits", "component-prototype-pollution"],
    });
  }
}

/** @public */
export const componentDiagramSecurity = new ComponentDiagramSecurity();
