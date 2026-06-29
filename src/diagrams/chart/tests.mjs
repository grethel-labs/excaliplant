/** @module diagrams/chart/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class ChartDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/chart/tests/chart_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const chartDiagramTests = new ChartDiagramTests();
