/**
 * Scoring helper for `@startuml` diagram detection. Each module lists
 * weighted line patterns; the module with the highest total wins.
 * @module diagrams/detect
 */

/** @typedef {import("../core/source.mjs").SourceLine} SourceLine */

/**
 * @param {SourceLine[]} lines
 * @param {[RegExp, number][]} patterns
 * @param {number} [scan] Maximum lines to inspect.
 * @returns {number}
 */
export function score(lines, patterns, scan = 400) {
  let total = 0;
  const n = Math.min(lines.length, scan);
  for (let i = 0; i < n; i++) {
    const t = lines[i].text.trim();
    if (!t) continue;
    for (const [re, w] of patterns) {
      if (re.test(t)) {
        total += w;
        break;
      }
    }
  }
  return total;
}
