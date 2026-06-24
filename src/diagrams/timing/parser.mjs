/**
 * Timing diagram parser contract and detection.
 * @module diagrams/timing/parser
 */

import { BaseModuleParser } from "../base/parser.mjs";
import {
  createTimingParseContext,
  detectTimingDiagram,
  prepareTimingLines,
  timingSyntaxPlugin,
} from "./plugins/syntax.mjs";

/** @public */
export const DEFAULT_TIMING_PLUGINS = [timingSyntaxPlugin];

/** @public */
export class TimingDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_TIMING_PLUGINS,
      createParseContext: createTimingParseContext,
      prepareLines: prepareTimingLines,
      detect: detectTimingDiagram,
    });
  }
}

/** @public */
export const timingDiagramParser = new TimingDiagramParser();

export { createTimingParseContext, detectTimingDiagram, prepareTimingLines };
