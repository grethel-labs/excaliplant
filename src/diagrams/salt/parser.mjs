/** @module diagrams/salt/parser */
import { BaseModuleParser } from "../base/parser.mjs";
import { createGraphParseContext } from "../shared/graph_parser.mjs";
import { normalisePlantUmlText, slug, stripQuotes } from "../../util/plantuml_utils.mjs";

/** @public */
export const saltSyntaxPlugin = {
  name: "salt.syntax",
  /** @param {string} line @param {Record<string, any>} ctx */
  tryLine(line, ctx) {
    if (/^\{[+*#\-.!<|}]?$/.test(line) || line === "}" || line === ".") return true;
    const control = parseSaltControl(line);
    const id = `salt_${ctx.saltIndex++}_${slug(control.text || control.kind)}`;
    ctx.addBox({
      id,
      title: control.title,
      description: control.description,
      shape: control.shape,
      stereotype: control.stereotype,
    });
    return true;
  },
};

/** @public */
export const DEFAULT_SALT_PLUGINS = [saltSyntaxPlugin];

/** @public */
export function createSaltParseContext() {
  const ctx = /** @type {Record<string, any>} */ (createGraphParseContext());
  ctx.diagram.kind = "salt";
  ctx.saltIndex = 0;
  ctx.openContainer({ id: "salt_ui", title: "Salt wireframe", kind: "frame" });
  return ctx;
}

/** @public @param {string[]} lines */
export function prepareSaltLines(lines) {
  return lines.filter((line) => {
    const trimmed = line.trim().toLowerCase();
    return !["@startsalt", "@endsalt", "@enduml", "salt"].includes(trimmed);
  });
}

/** @public @param {string} text */
export function detectSaltDiagram(text) {
  return /@startsalt\b|^\s*salt\s*$/im.test(text);
}

/** @public */
export class SaltDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_SALT_PLUGINS,
      createParseContext: createSaltParseContext,
      prepareLines: prepareSaltLines,
      detect: detectSaltDiagram,
    });
  }
}

/** @public */
export const saltDiagramParser = new SaltDiagramParser();

/** @param {string} line */
function parseSaltControl(line) {
  const trimmed = line.trim();
  const button = trimmed.match(/^\[([^\]]+)\]$/);
  if (button) return control("button", stripQuotes(button[1]), "component", "<<button>>");
  const checkbox = trimmed.match(/^\[(X|\s)?\]\s*(.*)$/i);
  if (checkbox)
    return control(
      "checkbox",
      checkbox[2] || "checkbox",
      "rectangle",
      checkbox[1] ? "<<checked>>" : "<<unchecked>>",
    );
  const radio = trimmed.match(/^\((X|\s)?\)\s*(.*)$/i);
  if (radio)
    return control(
      "radio",
      radio[2] || "radio",
      "interface",
      radio[1] ? "<<checked>>" : "<<unchecked>>",
    );
  const input = trimmed.match(/^"([^"]*)"$/);
  if (input) return control("input", input[1].trim() || "text field", "rectangle", "<<input>>");
  const dropdown = trimmed.match(/^\^([^^]+)\^$/);
  if (dropdown) return control("dropdown", dropdown[1], "queue", "<<dropdown>>");
  const tab = trimmed.match(/^\/([^/]+)\/$/);
  if (tab) return control("tab", tab[1], "rectangle", "<<tab>>");
  if (/^[|+]/.test(trimmed))
    return control("grid", trimmed.replace(/^[|+]\s*/, ""), "map", "<<grid>>");
  return control("label", trimmed, "note", "<<label>>");
}

/** @param {string} kind @param {string} text @param {string} shape @param {string} stereotype */
function control(kind, text, shape, stereotype) {
  const safe = normalisePlantUmlText(text);
  return {
    kind,
    text: safe,
    title: safe || kind,
    description: kind,
    shape,
    stereotype,
  };
}
