/**
 * Component and deployment diagrams. Both share the PlantUML "description"
 * element vocabulary; they only differ in detection and implicit nodes.
 * @module diagrams/component
 */

import { graphModule } from "../graph/module.mjs";
import { DESCRIPTIVE_KEYWORDS } from "../graph/parse.mjs";
import { score } from "../detect.mjs";

export const componentDiagram = graphModule({
  kind: "component",
  title: "Component diagram",
  keywords: DESCRIPTIVE_KEYWORDS,
  implicit: () => null,
  detect: (lines) =>
    score(lines, [
      [/^\[[^\]]+\]/, 2],
      [/^(component|port|portin|portout)\s/i, 3],
      [/^\(\)\s*\S/, 2],
      [/^interface\s+"?[^{]*$/i, 1],
      [/\[[^\]]+\]\s*[-.]+/, 2],
      [/^(package|folder|frame|rectangle|cloud)\s.*\{\s*$/i, 0.6],
    ]),
});

export const deploymentDiagram = graphModule({
  kind: "deployment",
  title: "Deployment diagram",
  keywords: DESCRIPTIVE_KEYWORDS,
  implicit: () => null,
  detect: (lines) =>
    score(lines, [
      [/^(node|artifact|cloud|database|storage|queue|stack|card|file|frame|folder|agent|hexagon|person|process|collections)\s/i, 2],
      [/^(rectangle|package)\s/i, 0.7],
    ]),
});
