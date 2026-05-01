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
 *
 * Plugin contract:
 *
 * ```js
 * {
 *   name,
 *   tryStart?(line, ctx): null | { onLine, tryEnd },
 *   tryLine?(line, ctx): boolean,
 * }
 * ```
 */
//
// Plugin contract:
//
//   {
//     name: string,
//     // OPTIONAL — declare a multi-line block. If `tryStart` returns a
//     //   block handler, the engine routes subsequent raw-trimmed lines
//     //   into the handler until `block.tryEnd(line)` returns true.
//     //   Inside a block no other plugin sees the line.
//     tryStart?(line, ctx): null | {
//       onLine(line, ctx): void,
//       tryEnd(line, ctx): boolean,
//     },
//     // OPTIONAL — single-line handler. Return true if consumed.
//     tryLine?(line, ctx): boolean,
//   }
//
// Adding support for a new PlantUML construct = drop a new plugin file
// and add it to the registry; no engine change required.

import { stripComment, ALWAYS_SKIP } from "./utils.mjs";

/**
 * Walk `lines` once and dispatch each line to a list of plugins.
 *
 * @param {object} args
 * @param {string[]} args.lines    Raw PlantUML lines (already split).
 * @param {Array<object>} args.plugins
 *   Plugins in priority order. Each plugin must implement `tryStart`
 *   (block plugins) or `tryLine` (line plugins) — see the module-level
 *   doc block for the plugin contract.
 * @param {object} args.ctx        Mutable context object. Plugins
 *                                 attach state here; the engine never
 *                                 reads it directly.
 * @returns {object}               The same `ctx` object the caller
 *                                 passed in (for chaining).
 */
export function runEngine({ lines, plugins, ctx }) {
  let block = null;
  for (const raw of lines) {
    const line = stripComment(raw).trim();

    if (block) {
      if (block.tryEnd(line, ctx)) { block = null; continue; }
      block.onLine(line, ctx);
      continue;
    }

    if (!line) continue;
    if (ALWAYS_SKIP.some((re) => re.test(line))) continue;

    let consumed = false;
    for (const p of plugins) {
      if (p.tryStart) {
        const b = p.tryStart(line, ctx);
        if (b) { block = b; consumed = true; break; }
      }
      if (p.tryLine && p.tryLine(line, ctx)) { consumed = true; break; }
    }
    // Unknown lines are silently ignored — same tolerance as before.
    void consumed;
  }
  ctx.finalize?.();
  return ctx.result;
}
