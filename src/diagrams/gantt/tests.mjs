/** @module diagrams/gantt/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class GanttDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/gantt/tests/gantt_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const ganttDiagramTests = new GanttDiagramTests();
