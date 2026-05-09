/**
 * Object diagram security contract.
 * @module diagrams/object/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class ObjectDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "diagram-arrow"],
      securityTestCases: ["object-xss", "object-limits"],
    });
  }
}

/** @public */
export const objectDiagramSecurity = new ObjectDiagramSecurity();
