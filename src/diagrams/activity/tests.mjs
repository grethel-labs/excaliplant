/**
 * Activity diagram test manifest.
 * @module diagrams/activity/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/**
 * Activity diagram test manifest.
 * @public
 */
export class ActivityDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["activity_components"],
      integration: [],
      security: [],
    });
  }
}
