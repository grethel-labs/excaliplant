// Tiny line-driven parsing engine.
//
// The engine walks PlantUML lines and offers each line to a list of
// plugins in declared order. Plugins decide whether to consume the line.

/**
 * @module parser/engine
 *
 * A ~50-line line-walker. The engine itself knows nothing about
 * PlantUML syntax; that lives entirely in plugins. Block plugins
 * (multi-line notes, class bodies) take exclusive ownership of
 * subsequent lines until they release.
 */

/**
 * Block-mode handler returned by `Plugin.tryStart`. While a block is
 * active the engine routes every subsequent line into it; no other
 * plugin sees the line until `tryEnd` returns `true`.
 *
 * @typedef {object} PluginBlock
 * @property {(line: string, ctx: Record<string, any>) => void} onLine
 *   Consume one line that belongs to the open block.
 * @property {(line: string, ctx: Record<string, any>) => boolean} tryEnd
 *   Return `true` to release the block (the closing line is *not*
 *   forwarded to `onLine`).
 */

/**
 * Plugin contract used by both the component and sequence pipelines.
 * A plugin implements `tryStart` (block plugin), `tryLine` (single-line
 * plugin), or both. The first plugin in registration order that
 * consumes a line wins.
 *
 * @typedef {object} Plugin
 * @property {string} name
 *   Stable identifier — used in error messages and test fixtures.
 * @property {(line: string, ctx: Record<string, any>) => (PluginBlock | null)} [tryStart]
 *   Optional — declare a multi-line block.
 * @property {(line: string, ctx: Record<string, any>) => boolean} [tryLine]
 *   Optional — single-line handler. Return `true` if consumed.
 */

import { stripComment, ALWAYS_SKIP } from "./utils.mjs";

/**
 * Walk `lines` once and dispatch each line to a list of plugins.
 *
 * @param {object} args
 * @param {string[]} args.lines    Raw PlantUML lines (already split).
 * @param {Plugin[]} args.plugins
 *   Plugins in priority order — see {@link Plugin}.
 * @param {Record<string, any>} args.ctx        Mutable context object. Plugins
 *                                 attach state here; the engine never
 *                                 reads it directly.
 * @returns {object}               Whatever `ctx.result` exposes —
 *                                 typically a `Diagram` /
 *                                 `SequenceDiagram` instance.
 * @public
 */
export function runEngine({ lines, plugins, ctx }) {
  /** @type {PluginBlock | null} */
  let block = null;
  for (const raw of lines) {
    const line = stripComment(raw).trim();

    if (block) {
      if (block.tryEnd(line, ctx)) {
        block = null;
        continue;
      }
      block.onLine(line, ctx);
      continue;
    }

    if (!line) continue;
    if (ALWAYS_SKIP.some((re) => re.test(line))) continue;

    let consumed = false;
    for (const p of plugins) {
      if (p.tryStart) {
        const b = p.tryStart(line, ctx);
        if (b) {
          block = b;
          consumed = true;
          break;
        }
      }
      if (p.tryLine && p.tryLine(line, ctx)) {
        consumed = true;
        break;
      }
    }
    // Unknown lines are silently ignored — same tolerance as before.
    void consumed;
  }
  ctx.finalize?.();
  return ctx.result;
}
