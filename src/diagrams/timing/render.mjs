/**
 * Timing diagram renderer contract.
 * @module diagrams/timing/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";
import { exportTimingDiagram } from "./render_excalidraw.mjs";

/** @public */
export const TIMING_RENDERERS = Object.freeze({ excalidraw: exportTimingDiagram });

/** @public */
export class TimingDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({
      renderers: {
        excalidraw: (model, opts) =>
          exportTimingDiagram(
            /** @type {import("../../general/model/diagram.mjs").TimingDiagram} */ (model),
            opts,
          ),
      },
    });
  }
}

/** @public */
export const timingDiagramRenderer = new TimingDiagramRenderer();
