/**
 * Activity diagram renderer.
 * @module diagrams/activity/render
 */

import { exportDiagram } from "../../general/render/excalidraw.mjs";
import { BaseModuleRenderer } from "../base/renderer.mjs";

/**
 * Activity diagram renderer contract.
 * @public
 */
export class ActivityDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({
      renderers: {
        excalidraw: (diagram, options = {}) =>
          exportDiagram(
            /** @type {import("../../general/model/diagram.mjs").Diagram} */ (diagram),
            options,
          ),
      },
    });
  }
}
