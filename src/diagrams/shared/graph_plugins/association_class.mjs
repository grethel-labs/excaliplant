// UML association-class shorthand: `(A, B) .. AssociationClass`.

import { unescapeLabel } from "../../../util/plantuml_utils.mjs";

const ASSOCIATION_CLASS_LINE =
  /^\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)\s+([-.]+)\s+(?:(?:class\s+)?"([^"]+)"(?:\s+as\s+(\S+))?|(\S+))(?:\s*:\s*(.+))?$/i;

/**
 * Parse PlantUML association-class declarations.
 *
 * The model has no edge-to-edge attachment yet, so the association
 * class is represented as a class box connected to both association
 * endpoints with dashed metadata edges.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const associationClassPlugin = {
  name: "component.associationClass",
  tryLine(line, ctx) {
    const m = line.match(ASSOCIATION_CLASS_LINE);
    if (!m) return false;
    const [, leftId, rightId, op, quotedTitle, alias, bareId, label] = m;
    const classId = alias || bareId || quotedTitle;
    const title = quotedTitle || bareId || alias;
    ctx.addBox({
      id: classId,
      title: unescapeLabel(title),
      shape: "class",
      stereotype: "association",
    });
    const dashed = op.includes(".");
    for (const endpoint of [leftId.trim(), rightId.trim()]) {
      ctx.queueConnection({
        fromId: classId,
        toId: endpoint,
        label: unescapeLabel(label?.trim() || ""),
        kind: "association-class",
        dashed,
        reversed: false,
        startArrowhead: null,
        endArrowhead: null,
        directionHint: null,
        allowVivify: true,
      });
    }
    return true;
  },
};
