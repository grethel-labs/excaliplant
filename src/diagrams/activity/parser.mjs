/**
 * Activity diagram parser contract and detection.
 * @module diagrams/activity/parser
 */

import { stripComment } from "../../util/plantuml_utils.mjs";
import { BaseModuleParser } from "../base/parser.mjs";
import {
  activitySyntaxPlugin,
  createActivityParseContext,
  prepareActivityLines,
} from "./plugins/syntax.mjs";

/**
 * Default plugins for activity diagram parsing.
 * @type {Array<object>}
 * @public
 */
export const DEFAULT_ACTIVITY_PLUGINS = [activitySyntaxPlugin];

/** @public */
export const createActivityContext = createActivityParseContext;

/** @public */
export const prepareActivitySourceLines = prepareActivityLines;

/** @public */
export class ActivityDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_ACTIVITY_PLUGINS,
      createParseContext: createActivityContext,
      prepareLines: prepareActivitySourceLines,
      detect: detectActivityDiagram,
    });
  }
}

/** @public */
export const activityDiagramParser = new ActivityDiagramParser();

/**
 * Detect if content is an activity diagram.
 * @param {string} text PlantUML source.
 * @returns {boolean}
 * @public
 */
export function detectActivityDiagram(text) {
  const lines = String(text || "").split(/\r?\n/);
  const firstNonEmpty = lines.find((line) => stripComment(line).trim().length > 0);
  if (!firstNonEmpty) return false;
  if (/^@startactivity\b/i.test(firstNonEmpty.trim())) return true;

  for (const raw of lines.slice(0, 80)) {
    const line = stripComment(raw).trim();
    if (!line) continue;
    if (/^:.*;?\s*(?:<<[^>]+>>)?$/s.test(line)) return true;
    if (/^(?:start|stop|end|kill|detach|break)$/i.test(line)) return true;
    if (/^(?:fork|split|repeat|while|if|switch)\b/i.test(line)) {
      return true;
    }
    if (/^\|(?:#[^|]+)?[^|]+\|$/.test(line)) return true;
    if (/^(?:partition|group|package|rectangle|card)\b.*\{$/i.test(line)) return true;
    if (/^\(\*\)\s*--?>/.test(line) || /^--?>/.test(line)) return true;
  }
  return false;
}
