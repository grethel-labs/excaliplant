/**
 * Use-case diagram security profile.
 * @module diagrams/use-case/security
 */

import { BaseModuleSecurity } from "../base/security.mjs";

/** @public */
export class UseCaseDiagramSecurity extends BaseModuleSecurity {
  constructor() {
    super({});
  }
}

/** @public */
export const useCaseDiagramSecurity = new UseCaseDiagramSecurity();
