/**
 * Timing diagram test manifest.
 * @module diagrams/timing/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class TimingDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/timing/tests/timing_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}

/** @public */
export const timingDiagramTests = new TimingDiagramTests();
