/** @module diagrams/chart/render */
import { BaseModuleRenderer } from "../base/renderer.mjs";
import { specialRenderers } from "../shared/special_runtime.mjs";
/** @public */
export const CHART_RENDERERS = specialRenderers;
/** @public */
export const chartDiagramRenderer = new BaseModuleRenderer({ renderers: CHART_RENDERERS });
/** @public */
export const ChartDiagramRenderer = chartDiagramRenderer;
