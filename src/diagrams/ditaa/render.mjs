/** @module diagrams/ditaa/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { specialRenderers } from "../shared/special_runtime.mjs";
/** @public */
export const DITAA_RENDERERS = specialRenderers;
/** @public */
export const ditaaDiagramRenderer = new BaseModuleRenderer({ renderers: DITAA_RENDERERS });
/** @public */
export const DitaaDiagramRenderer = ditaaDiagramRenderer;
