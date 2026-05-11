/**
 * Activity diagram parser contract and detection.
 * @module diagrams/activity/parser
 */

import { BaseModuleParser } from "../base/parser.mjs";
import { activitySyntaxPlugin } from "./plugins/syntax.mjs";

/**
 * Default plugins for activity diagram parsing.
 * @type {Array<object>}
 */
export const DEFAULT_ACTIVITY_PLUGINS = [activitySyntaxPlugin];

/**
 * Detect if content is an activity diagram.
 * @param {string[]} lines - PlantUML source lines
 * @returns {boolean}
 */
function detectActivity(lines) {
  // Ensure lines is an array
  if (!Array.isArray(lines)) {
    return false;
  }

  // Check for activity-specific directives or syntax patterns
  const firstNonEmpty = lines.find((l) => l.trim().length > 0);
  if (!firstNonEmpty) return false;

  const trimmed = firstNonEmpty.trim().toLowerCase();
  if (trimmed.startsWith("@startactivity")) return true;

  // Check for activity-specific keywords in first 20 lines
  const activityKeywords = [
    /^start\s*$/i,
    /^stop\s*$/i,
    /^end\s*$/i,
    /^:.*;\s*$/i,
    /^if\s+\(/i,
    /^while\s+\(/i,
    /^repeat\s*$/i,
    /^fork\s*$/i,
    /^split\s*$/i,
    /^\|[^|]+\|\s*$/i, // Swimlane syntax
  ];

  const sample = lines.slice(0, 20).join("\n");
  return activityKeywords.some((pattern) => pattern.test(sample));
}

/**
 * Activity diagram parser contract.
 * @public
 */
export class ActivityDiagramParser extends BaseModuleParser {
  constructor() {
    super({
      plugins: DEFAULT_ACTIVITY_PLUGINS,
      detect: (/** @type {string} */ text) => {
        const lines = text.split("\n");
        return detectActivity(lines);
      },
    });
  }
}

/**
 * Detect if content is an activity diagram.
 * @param {string[]} lines - PlantUML source lines
 * @returns {boolean}
 */
export function detectActivityDiagram(lines) {
  return detectActivity(lines);
}
