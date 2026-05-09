/**
 * Use-case diagram parser contract.
 * @module diagrams/use-case/parser
 */

import { BaseModuleParser } from "../base/parser.mjs";
import { createComponentContext } from "../shared/graph_context.mjs";
import { actorPlugin } from "./plugins/actors.mjs";
import { usecasePlugin } from "./plugins/usecases.mjs";
import { useCaseRelationshipPlugin } from "./plugins/relationships.mjs";
import { useCaseContainerPlugin } from "./plugins/containers.mjs";
import { useCaseNotePlugin } from "./plugins/notes.mjs";
import { connectionPlugin } from "../shared/graph_plugins/connections.mjs";
import { graphFilterPlugin } from "../shared/graph_plugins/filters.mjs";
import { createTitlePlugin } from "../shared/common_plugins/title.mjs";
import { collectBlockLines, unescapeLabel } from "../../util/plantuml_utils.mjs";

/**
 * `title …` line for use-case diagrams.
 * @type {import("../../util/parser_engine.mjs").Plugin}
 */
const useCaseTitlePlugin = createTitlePlugin("use-case.title");

/**
 * Closing `}` for any open container.
 * @type {import("../../util/parser_engine.mjs").Plugin}
 */
const useCaseCloseBracePlugin = {
  name: "use-case.close",
  tryLine(line, ctx) {
    if (line !== "}") return false;
    ctx.closeContainer();
    return true;
  },
};

/**
 * Skinparam plugin for use-case diagrams.
 * @type {import("../../util/parser_engine.mjs").Plugin}
 */
const useCaseSkinparamPlugin = {
  name: "use-case.skinparam",
  tryLine(line) {
    return /^skinparam\b/i.test(line);
  },
  tryStart(line) {
    if (!/^skinparam\b.*\{$/i.test(line)) return null;
    return {
      onLine() {},
      tryEnd(blockLine) {
        return blockLine === "}";
      },
    };
  },
};

/**
 * Direction hints for use-case diagrams.
 * @type {import("../../util/parser_engine.mjs").Plugin}
 */
const useCaseDirectionPlugin = {
  name: "use-case.direction",
  tryLine(line, ctx) {
    const m = line.match(/^(left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i);
    if (!m) return false;
    ctx.diagram.layoutDirection = /^left/i.test(m[1]) ? "RIGHT" : "DOWN";
    return true;
  },
};

/**
 * Presentation commands for use-case diagrams.
 * @type {import("../../util/parser_engine.mjs").Plugin}
 */
const useCasePresentationPlugin = {
  name: "use-case.presentation",
  tryLine(line, ctx) {
    const caption = line.match(/^caption\s+(.+)$/i);
    if (caption) {
      ctx.diagram.caption = unescapeLabel(caption[1].trim());
      return true;
    }
    const header = line.match(/^header\s+(.+)$/i);
    if (header) {
      ctx.diagram.header = unescapeLabel(header[1].trim());
      return true;
    }
    const footer = line.match(/^footer\s+(.+)$/i);
    if (footer) {
      ctx.diagram.footer = unescapeLabel(footer[1].trim());
      return true;
    }
    const mainframe = line.match(/^mainframe\s+(.+)$/i);
    if (mainframe) {
      ctx.diagram.mainframe = unescapeLabel(mainframe[1].trim());
      return true;
    }
    return /^allowmixing\b/i.test(line);
  },
  tryStart(line) {
    if (!/^legend\b/i.test(line)) return null;
    return collectBlockLines(/^end\s+legend$/i, (lines, ctx) => {
      ctx.diagram.legend = lines.join("\n");
    });
  },
};

/**
 * Filter plugin for use-case diagrams.
 * @type {import("../../util/parser_engine.mjs").Plugin}
 */
const useCaseFilterPlugin = {
  name: "use-case.filter",
  tryLine(line) {
    return /^(?:hide|show)\s+\w+/i.test(line);
  },
  tryStart(line) {
    const m = line.match(/^remove\s*\{/i);
    if (!m) return null;
    return {
      onLine() {},
      tryEnd(blockLine) {
        return blockLine === "}";
      },
    };
  },
};

/**
 * Detects if source is a use-case diagram.
 * @param {string} source - PlantUML source
 * @returns {boolean}
 */
export function detectUseCaseDiagram(source) {
  const trimmed = source.trim();
  if (/^@startusecase\b/m.test(trimmed)) return true;
  if (!/^@startuml\b/m.test(trimmed)) return false;

  // Check for use-case specific patterns
  const useCasePatterns = [
    /\(:[^)]+\)/, // (Use case) notation
    /:actor:/i, // :Actor: notation
    /\bactor\b/i, // actor keyword
    /\busecase\b/i, // usecase keyword
    /\(First usecase\)/i, // Common use-case example
    /\bactorStyle\b/i, // actorStyle skinparam
  ];

  return useCasePatterns.some((pattern) => pattern.test(trimmed));
}

/** @public */
export const DEFAULT_USE_CASE_PLUGINS = Object.freeze([
  useCaseTitlePlugin,
  useCaseSkinparamPlugin,
  useCaseDirectionPlugin,
  useCasePresentationPlugin,
  useCaseCloseBracePlugin,
  useCaseFilterPlugin,
  actorPlugin,
  usecasePlugin,
  useCaseContainerPlugin,
  useCaseNotePlugin,
  useCaseRelationshipPlugin,
  connectionPlugin,
]);

/**
 * Create a parse context for use-case diagrams.
 * @returns {object}
 */
export function createUseCaseParseContext() {
  return createComponentContext();
}

/**
 * Prepare lines for parsing (normalize, strip comments, etc.).
 * @param {string[]} lines
 * @returns {string[]}
 */
export function prepareUseCaseLines(lines) {
  return lines;
}

/** @public */
export class UseCaseDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_USE_CASE_PLUGINS,
      createParseContext: createUseCaseParseContext,
      prepareLines: prepareUseCaseLines,
      detect: detectUseCaseDiagram,
    });
  }
}

/** @public */
export const useCaseDiagramParser = new UseCaseDiagramParser();
