/**
 * Timing diagram security profile.
 * @module diagrams/timing/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class TimingDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      capabilities: ["sanitize", "limits", "inline-text", "style-cascade"],
    });
  }
}

/** @public */
export const timingDiagramSecurity = new TimingDiagramSecurity();
