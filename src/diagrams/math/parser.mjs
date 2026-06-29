/** @module diagrams/math/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { Box, Diagram, Plane } from "../../general/model/diagram.mjs";
import { normalisePlantUmlText, slug } from "../../util/plantuml_utils.mjs";

/** @public */
export const mathSyntaxPlugin = {
  name: "math.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^title\s+/i.test(trimmed)) {
      ctx.diagram.title = normalisePlantUmlText(trimmed.replace(/^title\s+/i, ""));
      return true;
    }
    ctx.body.push(line);
    return true;
  },
  /** @param {Record<string, any>} ctx */
  finish(ctx) {
    const formula = normalisePlantUmlText(ctx.body.join("\n").trim());
    const title = ctx.mode === "latex" ? "LaTeX formula" : "AsciiMath formula";
    ctx.plane.addBox(
      new Box({
        id: `${ctx.mode}-${slug(formula || "formula")}`,
        title,
        description: formula,
        shape: "note",
      }),
    );
    return ctx.diagram;
  },
};

/** @public */
export const DEFAULT_MATH_PLUGINS = [mathSyntaxPlugin];

/** @public @param {string} text */
export function detectMathDiagram(text) {
  const lower = text.toLowerCase();
  return lower.includes("@startmath") || lower.includes("@startlatex");
}

/** @public @param {string[]} lines */
export function prepareMathLines(lines) {
  return lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return !["@startmath", "@endmath", "@startlatex", "@endlatex", "@enduml"].includes(trimmed);
  });
}

/** @public */
export function createMathParseContext() {
  const diagram = new Diagram();
  diagram.kind = "math";
  const plane = diagram.addPlane(new Plane({ id: "math-plane", title: "Math" }));
  /** @type {Record<string, any>} */
  const ctx = { diagram, plane, body: [], mode: "math" };
  ctx.finalize = () => {
    const formula = normalisePlantUmlText(ctx.body.join("\n").trim());
    const title = ctx.mode === "latex" ? "LaTeX formula" : "AsciiMath formula";
    ctx.plane.addBox(
      new Box({
        id: `${ctx.mode}-${slug(formula || "formula")}`,
        title,
        description: formula,
        shape: "note",
      }),
    );
    ctx.result = ctx.diagram;
  };
  return ctx;
}

/** @public */
export class MathDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_MATH_PLUGINS,
      createParseContext: createMathParseContext,
      prepareLines: prepareMathLines,
      detect: detectMathDiagram,
    });
  }

  createParseContext() {
    const ctx = super.createParseContext();
    return ctx;
  }
}

/** @public */
export const mathDiagramParser = new MathDiagramParser();
