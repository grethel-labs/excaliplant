/**
 * Sequence diagram security contract.
 * @module diagrams/sequence/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class SequenceDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "diagram-arrow"],
      securityTestCases: ["sequence-xss", "sequence-limits", "sequence-fail-closed"],
    });
  }
}

/** @public */
export const sequenceDiagramSecurity = new SequenceDiagramSecurity();
