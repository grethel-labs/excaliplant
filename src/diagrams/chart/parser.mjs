/** @module diagrams/chart/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { createSpecialParseContext, finalizeChart } from "../shared/special_runtime.mjs";
import { normalisePlantUmlText, stripQuotes } from "../../util/plantuml_utils.mjs";

/** @public */
export const chartSyntaxPlugin = {
  name: "chart.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (!ctx.chart) ctx.chart = { axes: [], series: [], options: [] };
    const hAxis = line.match(/^h-axis\s+(.+)$/i);
    if (hAxis) {
      ctx.chart.axes.push(`h-axis: ${normalisePlantUmlText(hAxis[1])}`);
      return true;
    }
    const vAxis = line.match(/^v-axis\s+(.+)$/i);
    if (vAxis) {
      ctx.chart.axes.push(`v-axis: ${normalisePlantUmlText(vAxis[1])}`);
      return true;
    }
    const option = line.match(/^(stackMode|legend|grid|annotation|title)\s+(.+)$/i);
    if (option) {
      ctx.chart.options.push(`${option[1]}: ${normalisePlantUmlText(option[2])}`);
      return true;
    }
    const series = line.match(
      /^(bar|line|area|scatter)\s+("[^"]+"|\S+)\s+\[([^\]]*)\](?:\s+(#[A-Fa-f0-9]{3,8}))?$/i,
    );
    if (series) {
      ctx.chart.series.push({
        kind: series[1].toLowerCase(),
        name: normalisePlantUmlText(stripQuotes(series[2])),
        values: parseValues(series[3]),
        color: series[4] || "",
      });
      return true;
    }
    return /^(?:@startchart|@endchart)\b/i.test(line);
  },
};

/** @param {string} raw */
function parseValues(raw) {
  return raw
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value))
    .slice(0, 512);
}

/** @public */
export const DEFAULT_CHART_PLUGINS = [chartSyntaxPlugin];
/** @public */
export function createChartParseContext() {
  const ctx = createSpecialParseContext("chart", "Chart");
  ctx.chart = { axes: [], series: [], options: [] };
  ctx.finalize = () => finalizeChart(ctx);
  return ctx;
}
/** @public @param {string[]} lines */
export const prepareChartLines = (lines) => lines;
/** @public @param {string} text */
export const detectChartDiagram = (text) => /@startchart\b/im.test(text);

/** @public */
export class ChartDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_CHART_PLUGINS,
      createParseContext: createChartParseContext,
      prepareLines: prepareChartLines,
      detect: detectChartDiagram,
    });
  }
}
/** @public */
export const chartDiagramParser = new ChartDiagramParser();
