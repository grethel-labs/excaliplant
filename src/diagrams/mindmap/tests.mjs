/** @module diagrams/mindmap/tests */
import { BaseModuleTests } from "../base/tests.mjs";
/** @public */
export class MindmapDiagramTests extends BaseModuleTests {
  constructor() {
    super({
      unit: ["src/diagrams/mindmap/tests/mindmap_components.test.mjs"],
      integration: ["tests/plantuml.test.mjs"],
      security: ["tests/security.test.mjs"],
    });
  }
}
/** @public */
export const mindmapDiagramTests = new MindmapDiagramTests();
