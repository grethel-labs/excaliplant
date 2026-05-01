// Tiny line-driven parsing engine.
//
// The engine walks PlantUML lines and offers each line to a list of
// plugins in declared order. Plugins decide whether to consume the line.
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
