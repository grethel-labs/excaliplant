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

import { stripComment, ALWAYS_SKIP } from "./plantuml_utils.mjs";

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
 * @param {(info: {line: string, index: number}) => void} [args.onUnknownLine]
 *   Optional callback invoked for every non-skip, non-empty line that
 *   no plugin consumed. Useful for `strict`/`diagnostics` modes; the
 *   default behaviour (silent ignore) is preserved when omitted.
 * @returns {object}               Whatever `ctx.result` exposes —
 *                                 typically a `Diagram` /
 *                                 `SequenceDiagram` instance.
 * @public
 */
export function runEngine({ lines, plugins, ctx, onUnknownLine }) {
  /** @type {PluginBlock | null} */
  let block = null;
  let index = 0;
  for (const raw of lines) {
    const line = stripComment(raw).trim();

    if (block) {
      if (block.tryEnd(line, ctx)) {
        block = null;
        index++;
        continue;
      }
      block.onLine(line, ctx);
      index++;
      continue;
    }

    if (!line) {
      index++;
      continue;
    }
    if (ALWAYS_SKIP.some((re) => re.test(line))) {
      index++;
      continue;
    }

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
    if (!consumed && typeof onUnknownLine === "function") {
      onUnknownLine({ line, index });
    }
    index++;
  }
  ctx.finalize?.();
  return ctx.result;
}
