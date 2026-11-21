/**
 * Opt-in `!include` resolver for the MCP server. Tool arguments never name
 * files; the operator can allow one directory tree with `--include-dir`, the
 * same way as the CLI.
 * @module mcp/include
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Resolver that only reads regular files below `root` (symlinks are resolved
 * first, so links pointing out of the tree are refused) and never URLs.
 * @param {string} root
 * @param {number} maxBytes Maximum size of one included file.
 * @returns {import("../core/preprocess/preprocessor.mjs").IncludeResolver}
 */
export function createIncludeResolver(root, maxBytes) {
  const base = realpathSync(root);
  return (target, context) => {
    if (context.kind !== "file") return null;
    try {
      const resolved = realpathSync(path.resolve(base, target));
      if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
      const stat = statSync(resolved);
      if (!stat.isFile() || stat.size > maxBytes) return null;
      return readFileSync(resolved, "utf8");
    } catch {
      return null;
    }
  };
}
