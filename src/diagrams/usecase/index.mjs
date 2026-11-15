/**
 * Use case diagrams.
 * @module diagrams/usecase
 */

import { graphModule } from "../graph/module.mjs";
import { DESCRIPTIVE_KEYWORDS, endpointForm } from "../graph/parse.mjs";
import { score } from "../detect.mjs";

export default graphModule({
  kind: "usecase",
  title: "Use case diagram",
  keywords: DESCRIPTIVE_KEYWORDS,
  // Plain undeclared names in use case diagrams are actors.
  implicit: (token) => {
    const ep = endpointForm(token);
    return ep.form === "plain" || ep.form === "quoted"
      ? { id: ep.name, label: ep.name, keyword: "actor" }
      : null;
  },
  detect: (lines) =>
    score(lines, [
      [/^\([^)]+\)/, 2],
      [/^usecase\s/i, 3],
      [/^:[^:]+:/, 2],
      [/[-.]+>?\s*\([^)]+\)/, 2],
      [/^actor\/?\s/i, 0.6],
    ]),
});
