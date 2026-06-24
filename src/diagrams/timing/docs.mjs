/**
 * Timing diagram documentation manifest.
 * @module diagrams/timing/docs
 */

import { BaseModuleDocs } from "../base/docs.mjs";

/** @public */
export class TimingDiagramDocs extends BaseModuleDocs {
  constructor() {
    super({
      examples: [
        "official-web-browser",
        "official-clock-binary",
        "messages-constraints-notes",
        "analog-highlight",
      ],
      generatedPages: [],
      knownGaps: ["day-scale-axis-formatting", "advanced teoz timing macros"],
    });
  }
}

/** @public */
export const timingDiagramDocs = new TimingDiagramDocs();
