/**
 * Base security contract for diagram modules.
 * @module diagrams/base/security
 */

import { createModuleSecurityProfile } from "../../general/platform/security_base.mjs";

/**
 * Base contract for module-owned security policy.
 * @public
 */
export class BaseModuleSecurity {
  /** @param {Partial<import("../../general/platform/security_base.mjs").ModuleSecurityProfile>} [profile] Security profile. */
  constructor(profile = {}) {
    this._profile = createModuleSecurityProfile(profile);
    Object.freeze(this);
  }

  /** @returns {import("../../general/platform/security_base.mjs").ModuleSecurityProfile} Security profile. */
  profile() {
    return this._profile;
  }
}
