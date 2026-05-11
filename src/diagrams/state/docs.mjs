/**
 * State diagram documentation manifest.
 * @module diagrams/state/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class StateDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: [
        "simple-states",
        "pseudostates",
        "composite-states",
        "concurrent-regions",
        "transitions",
        "notes",
      ],
      generatedPages: [],
      knownGaps: ["entry-exit-points", "expansion-regions", "sdl-notation"],
    });
  }
}

/** @public */
export const stateDiagramDocs = new StateDiagramDocs();
