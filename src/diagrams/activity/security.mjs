/**
 * Activity diagram security profile.
 * @module diagrams/activity/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/**
 * Activity diagram security profile.
 * @public
 */
export class ActivityDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({
      maxNodes: 500,
      maxEdges: 1000,
    });
  }
}
