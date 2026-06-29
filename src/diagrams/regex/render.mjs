/**
 * Regex diagram renderer adapters.
 * @module diagrams/regex/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { railroadRenderers } from "../shared/railroad_runtime.mjs";

/** @public */
export const REGEX_RENDERERS = railroadRenderers;

/** @public */
export class RegexDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({ renderers: REGEX_RENDERERS });
  }
}

/** @public */
export const regexDiagramRenderer = new RegexDiagramRenderer();
