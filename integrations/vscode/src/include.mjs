/**
 * Opt-in `!include` resolver. The renderer itself never touches the file
 * system; this resolver is the only way a diagram can read a file, and only
 * below the folder named in `excaliplant.includeDir` in a trusted workspace.
 * @module vscode/include
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Resolve the configured folder: absolute as is, otherwise relative to the
 * workspace folder. Returns `null` when no folder is configured or it does not exist.
 * @param {string} dir
 * @param {string | undefined} workspaceFolder
 * @returns {string | null} Real path of an existing directory.
 */
export function resolveIncludeRoot(dir, workspaceFolder) {
  if (!dir) return null;
  const candidate = path.isAbsolute(dir)
    ? dir
    : workspaceFolder
      ? path.resolve(workspaceFolder, dir)
      : null;
  if (!candidate) return null;
  try {
    const real = realpathSync(candidate);
    return statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/**
 * Resolver that reads regular files below `root` only. Symlinks are resolved
 * first, so links pointing out of the tree are refused; URLs and the stdlib
 * are never served from disk.
 * @param {string} root Real path of the include folder.
 * @param {number} maxBytes Largest accepted file.
 * @returns {import("../../../src/core/preprocess/preprocessor.mjs").IncludeResolver}
 */
export function createIncludeResolver(root, maxBytes) {
  return (target, context) => {
    if (context.kind !== "file") return null;
    try {
      const resolved = realpathSync(path.resolve(root, target));
      if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
      const stat = statSync(resolved);
      if (!stat.isFile() || stat.size > maxBytes) return null;
      return readFileSync(resolved, "utf8");
    } catch {
      return null;
    }
  };
}
