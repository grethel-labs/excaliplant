/**
 * Use-case diagram test manifest.
 * @module diagrams/use-case/tests
 */

import { BaseModuleTests } from "../base/tests.mjs";

/** @public */
export class UseCaseDiagramTests extends BaseModuleTests {
  constructor() {
    super({});
  }
}

/** @public */
export const useCaseDiagramTests = new UseCaseDiagramTests();
