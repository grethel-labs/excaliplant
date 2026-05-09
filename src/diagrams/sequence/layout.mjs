/**
 * Sequence diagram layout adapter.
 * @module diagrams/sequence/layout
 */

import { layoutSequenceDiagram as layoutSequenceModel } from "./layout_engine.mjs";
import { BaseModuleLayout } from "../base/layout.mjs";

/**
 * @param {object} model Sequence model.
 * @returns {Promise<object>}
 */
export async function layoutSequenceDiagram(model) {
  await layoutSequenceModel(/** @type {any} */ (model));
  return model;
}

/** @public */
export class SequenceDiagramLayout extends BaseModuleLayout {
  constructor() {
    super({ layoutStrategy: "sequenceTimeline", layout: layoutSequenceDiagram });
  }
}

/** @public */
export const sequenceDiagramLayout = new SequenceDiagramLayout();
