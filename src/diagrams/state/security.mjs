/**
 * State diagram security profile.
 * @module diagrams/state/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class StateDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "diagram-arrow"],
    });
  }
}

/** @public */
export const stateDiagramSecurity = new StateDiagramSecurity();
