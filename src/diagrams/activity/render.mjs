/**
 * Activity diagram renderer.
 * @module diagrams/activity/render
 */

import { BaseModuleRenderer } from "../base/renderer.mjs";

/**
 * Activity diagram renderer contract.
 * @public
 */
export class ActivityDiagramRenderer extends BaseModuleRenderer {
  constructor() {
    super({
      renderers: {
        excalidraw: (diagram, options = {}) => {
          // TODO: Implement activity diagram rendering
          // This includes:
          // - Action shapes (rounded rectangles)
          // - Decision diamonds
          // - Start/Stop symbols
          // - Fork/Split bars
          // - Swimlanes
          // - Arrows with labels

          // For now, return empty elements array
          return {
            elements: [],
            appState: {},
            files: {},
          };
        },
      },
    });
  }
}
