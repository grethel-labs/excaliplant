/**
 * Rule-file flavours for tools that have no skill concept (or only a rules
 * mechanism): the same short guidance, wrapped in each tool's frontmatter.
 * @module skills/rules
 */

/** One-line trigger description used by tools that let the model decide. */
export const RULE_DESCRIPTION =
  "Use when asked to draw or convert PlantUML, UML or other diagrams to Excalidraw, SVG or PNG with excaliplant.";

/**
 * Wrap the rule body for one tool.
 * @param {"cursor" | "windsurf" | "plain" | "copilot"} format
 * @param {string} body Rule text without frontmatter.
 * @returns {string}
 */
export function renderRule(format, body) {
  const text = body.replace(/^\s+/, "").replace(/\s*$/, "\n");
  switch (format) {
    case "cursor":
      // No globs and alwaysApply: false makes it an "Agent Requested" rule.
      return `---\ndescription: ${RULE_DESCRIPTION}\nalwaysApply: false\n---\n\n${text}`;
    case "windsurf":
      return `---\ntrigger: model_decision\ndescription: ${RULE_DESCRIPTION}\n---\n\n${text}`;
    case "copilot":
      return `---\napplyTo: "**"\n---\n\n${text}`;
    default:
      return text;
  }
}
