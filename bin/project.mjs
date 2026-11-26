/** Filesystem I/O for opt-in PlantUML projects and includes. */

import { opendirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LIMITS } from "../src/core/limits.mjs";
import { isPlantUmlFile, resolveProjectPath } from "../src/core/project.mjs";

const MAX_FILES = 500;
const MAX_DIRECTORY_ENTRIES = 10_000;
const MAX_PROJECT_BYTES = 16 * 1024 * 1024;

/** @param {string} root */
export function openProject(root) {
  const base = realpathSync(root);
  if (!statSync(base).isDirectory()) throw new Error(`Not a directory: ${root}`);
  /** @type {Map<string, import("../src/core/preprocess/preprocessor.mjs").ResolvedInclude>} */
  const files = new Map();
  let bytes = 0;

  /** @param {string} file */
  const relative = (file) => {
    const name = path.relative(base, file);
    if (!name || name === ".." || name.startsWith(`..${path.sep}`) || path.isAbsolute(name))
      return null;
    return name.split(path.sep).join("/");
  };

  /** @param {string} file */
  function read(file) {
    // Resolve and check every requested path before opening the canonical file.
    let real, name, size;
    try {
      real = realpathSync(file);
      name = relative(real);
      if (!name) return null;
      if (files.has(name)) return files.get(name);
      const stat = statSync(real);
      if (!stat.isFile() || stat.size > DEFAULT_LIMITS.maxInputBytes) return null;
      size = stat.size;
    } catch {
      return null;
    }
    if (files.size >= MAX_FILES || bytes + size > MAX_PROJECT_BYTES)
      throw new Error(
        `Project exceeds the limit of ${MAX_FILES} files or ${MAX_PROJECT_BYTES} bytes`,
      );
    try {
      const data = readFileSync(real);
      if (data.length > DEFAULT_LIMITS.maxInputBytes || bytes + data.length > MAX_PROJECT_BYTES)
        return null;
      const source = { path: name, text: data.toString("utf8") };
      files.set(name, source);
      bytes += data.length;
      return source;
    } catch {
      return null;
    }
  }

  /** @param {string} name */
  const readRelative = (name) => read(path.join(base, ...name.split("/")));

  /** @param {string} file */
  const sourcePath = (file) => relative(realpathSync(file));

  /** @param {{ rootFallback?: boolean }} [options] */
  function createResolver({ rootFallback = false } = {}) {
    /** @type {import("../src/core/preprocess/preprocessor.mjs").IncludeResolver} */
    const resolve = (target, { from, kind }) => {
      if (kind !== "file") return null;
      if (rootFallback && path.isAbsolute(target)) return read(target);
      const name = resolveProjectPath(from, target);
      if (!name) return null;
      const own = readRelative(name);
      if (own || !from || !rootFallback) return own;
      const fallback = resolveProjectPath(null, target);
      return fallback && fallback !== name ? readRelative(fallback) : null;
    };
    return resolve;
  }

  /** @param {string[]} selection */
  function list(selection) {
    const names = selection.length ? selection : listProjectFiles(base);
    /** @type {Map<string, import("../src/core/preprocess/preprocessor.mjs").ResolvedInclude>} */
    const chosen = new Map();
    for (const name of names) {
      const safe = resolveProjectPath(null, name);
      const file = safe && readRelative(safe);
      if (!file) throw new Error(`Cannot read PlantUML project file ${JSON.stringify(name)}`);
      chosen.set(file.path, file);
    }
    return chosen;
  }

  return { sourcePath, createResolver, list };
}

/** @param {string} base */
function listProjectFiles(base) {
  const files = [];
  const pending = [base];
  let entries = 0;
  while (pending.length) {
    const directory = pending.pop();
    const dir = opendirSync(directory);
    try {
      for (let item; (item = dir.readSync()) !== null;) {
        if (++entries > MAX_DIRECTORY_ENTRIES)
          throw new Error(`Project contains more than ${MAX_DIRECTORY_ENTRIES} directory entries`);
        if (item.name.startsWith(".")) continue;
        const file = path.join(directory, item.name);
        if (item.isDirectory() && item.name !== "node_modules") pending.push(file);
        if (item.isFile() && isPlantUmlFile(item.name)) files.push(path.relative(base, file));
        if (files.length > MAX_FILES)
          throw new Error(`Project contains more than ${MAX_FILES} files`);
      }
    } finally {
      dir.closeSync();
    }
  }
  return files.sort();
}
