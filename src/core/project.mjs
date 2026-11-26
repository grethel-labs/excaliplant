/** Entry discovery for a bounded set of PlantUML sources. */

import { ExcaliplantError } from "./errors.mjs";
import { resolveLimits } from "./limits.mjs";
import { extractBlocks } from "./source.mjs";
import { preprocess } from "./preprocess/preprocessor.mjs";

/** @param {string} path */
export function isPlantUmlFile(path) {
  return /\.(?:puml|plantuml|pu|iuml)$/i.test(path);
}

/**
 * Resolve a relative import inside a project with slash-separated paths.
 * @param {string | null} from
 * @param {string} target
 */
export function resolveProjectPath(from, target) {
  const relative = target.replaceAll("\\", "/");
  if (!relative || relative.startsWith("/") || /[:\x00-\x1f]/.test(relative)) return null;
  const parts = from ? from.split("/").slice(0, -1) : [];
  for (const part of relative.split("/")) {
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return parts.length ? parts.join("/") : null;
}

/**
 * Find standalone entries by observing the includes the preprocessor actually
 * resolves, including conditionals and variables. Only complete blocks can
 * be entries. Mutual imports remain candidates so rendering can report cycles.
 * @param {Iterable<import("./preprocess/preprocessor.mjs").ResolvedInclude>} files
 * @param {import("./preprocess/preprocessor.mjs").IncludeResolver} include
 * @param {{ defines?: Record<string, string | number | boolean>, raw?: (type: string) => boolean }} [options]
 */
export function findProjectEntries(files, include, { defines, raw } = {}) {
  const limits = resolveLimits();
  /** @type {Map<string, Set<string>>} */
  const dependencies = new Map();
  for (const file of files) {
    const blocks = extractBlocks(file.text, { completeOnly: true, maxBlocks: limits.maxBlocks });
    if (!blocks.length) continue;
    const imports = new Set();
    dependencies.set(file.path, imports);
    for (const block of blocks) {
      if (raw?.(block.type)) continue;
      try {
        preprocess(block.lines, {
          limits,
          defines,
          filename: file.path.split("/").at(-1),
          sourcePath: file.path,
          include(target, context) {
            const found = include(target, context);
            if (found && typeof found !== "string") imports.add(found.path);
            return found;
          },
        });
      } catch (error) {
        // Render the entry separately so the caller gets its normal diagnostic.
        if (!(error instanceof ExcaliplantError)) throw error;
      }
    }
  }

  const fragments = new Set();
  for (const [entry, imports] of dependencies) {
    for (const imported of imports) {
      if (imported !== entry && !dependencies.get(imported)?.has(entry)) fragments.add(imported);
    }
  }
  return [...dependencies.keys()].filter((entry) => !fragments.has(entry));
}
