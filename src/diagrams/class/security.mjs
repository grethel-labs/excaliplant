/**
 * Class diagram security contract.
 * @module diagrams/class/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class ClassDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "diagram-arrow"],
      securityTestCases: ["class-xss", "class-limits", "class-prototype-pollution"],
    });
  }
}

/** @public */
export const classDiagramSecurity = new ClassDiagramSecurity();
