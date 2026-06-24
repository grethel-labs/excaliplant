/**
 * Class diagram parser contract.
 * @module diagrams/class/parser
 */

import { explodeBraces, stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import { DEFAULT_GRAPH_PLUGINS, createGraphParseContext } from "../shared/graph_parser.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import {
  classJsonObjectPlugin,
  classMemberLinePlugin,
  qualifiedAssociationPlugin,
} from "./plugins/syntax.mjs";

const graphPluginsBeforeConnections = DEFAULT_GRAPH_PLUGINS.filter(
  (plugin) => plugin.name !== connectionPlugin.name,
);

/** @public */
export const DEFAULT_CLASS_PLUGINS = Object.freeze([
  ...graphPluginsBeforeConnections,
  classJsonObjectPlugin,
  qualifiedAssociationPlugin,
  classMemberLinePlugin,
  connectionPlugin,
]);

/** @public */
export function createClassParseContext() {
  const ctx = createGraphParseContext();
  ctx.diagram.kind = "class";
  ctx.setAutoVivifyConnections(true);
  return ctx;
}

/** @public */
export const prepareClassLines = explodeBraces;

/** @public */
export class ClassDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_CLASS_PLUGINS,
      createParseContext: createClassParseContext,
      prepareLines: prepareClassLines,
      detect: detectClassDiagram,
    });
  }
}

/** @public */
export const classDiagramParser = new ClassDiagramParser();

/**
 * @param {string} text Raw PlantUML source.
 * @returns {boolean}
 */
export function detectClassDiagram(text) {
  let hasObjectFamilyDeclaration = false;
  let hasComponentFamilyDeclaration = false;
  let hasUseCaseFamilyDeclaration = false;
  let hasClassFamilyDeclaration = false;
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (
      /^:([^:]+):\/?(?:\s|$)/.test(line) ||
      /^actor\//i.test(line) ||
      /^usecase\/?\b/i.test(line) ||
      /^"[^"]+"\s+as\s+\([^)]+\)/.test(line) ||
      /^\([^)]+\)\/?(?:\s+as\s+\([^)]+\))?/.test(line)
    ) {
      hasUseCaseFamilyDeclaration = true;
    }
    if (/^(?:object|map|diamond)\b/i.test(line)) hasObjectFamilyDeclaration = true;
    if (
      /^\[[^\]]+\]/.test(line) ||
      /^(?:component|package|node|frame|folder|cloud|database|queue|artifact|port|portin|portout|json)\b/i.test(
        line,
      )
    ) {
      hasComponentFamilyDeclaration = true;
    }
    if (
      /^[+#~-]?\s*(?:abstract(?:\s+class)?|class|interface|enum|annotation|record|protocol|struct|exception|metaclass|stereotype|dataclass|circle|entity)\b/i.test(
        line,
      )
    ) {
      hasClassFamilyDeclaration = true;
    }
  }
  const looksObjectDiagram = hasObjectFamilyDeclaration && !hasClassFamilyDeclaration;
  const looksComponentDiagram = hasComponentFamilyDeclaration && !hasClassFamilyDeclaration;
  const looksUseCaseDiagram = hasUseCaseFamilyDeclaration && !hasClassFamilyDeclaration;

  for (const raw of lines) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^\(\*\)\s*--?>/.test(line) || /^--?>/.test(line)) return false;
    if (looksObjectDiagram) return false;
    if (looksComponentDiagram) return false;
    if (looksUseCaseDiagram) return false;
    if (/^skinparam\s+class\b/i.test(line)) return true;
    if (/^namespace\b/i.test(line)) return true;
    if (
      /^[+#~-]?\s*(?:abstract(?:\s+class)?|class|interface|enum|annotation|record|protocol|struct|exception|metaclass|stereotype|dataclass|circle|entity|json)\b/i.test(
        line,
      )
    ) {
      return true;
    }
    if (/\s(?:<\|--|<\|\.\.|--\|>|\.\.\|>|\*--|--\*|o--|--o|\.\.>|-->)\s/.test(line)) {
      return true;
    }
    if (/^\S+\s+\[[^\]]+]\s+[-.*o<|>]+\s+\S+/.test(line)) return true;
  }
  return false;
}
