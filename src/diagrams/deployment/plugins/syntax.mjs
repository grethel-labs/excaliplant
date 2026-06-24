/**
 * Deployment-diagram specific syntax plugins.
 * @module diagrams/deployment/plugins/syntax
 */

import {
  normalisePlantUmlText,
  normaliseShape,
  stripQuotes,
} from "../../../util/plantuml_utils.mjs";

const LONG_DESCRIPTION_START =
  /^(actor|agent|artifact|boundary|card|circle|cloud|collections|component|control|database|entity|file|folder|frame|hexagon|interface|label|node|package|person|process|queue|rectangle|stack|storage|usecase)\s+("[^"]+"|[A-Za-z_$][\w$.-]*)\s+\[\s*$/i;

/**
 * Official deployment long descriptions:
 *
 * ```plantuml
 * folder folder [
 * long description
 * ]
 * ```
 *
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const deploymentLongDescriptionPlugin = {
  name: "deployment.longDescription",
  tryStart(line, ctx) {
    const match = line.match(LONG_DESCRIPTION_START);
    if (!match) return null;
    const [, keyword, rawId] = match;
    const id = stripQuotes(rawId);
    /** @type {string[]} */
    const lines = [];
    return {
      onLine(bodyLine) {
        lines.push(bodyLine);
      },
      tryEnd(bodyLine) {
        if (bodyLine !== "]") return false;
        ctx.addBox({
          id,
          title: normalisePlantUmlText(id),
          description: normalisePlantUmlText(lines.join("\n")),
          shape: normaliseShape(keyword.toLowerCase()),
        });
        return true;
      },
    };
  },
};
