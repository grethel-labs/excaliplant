/** Portable paths for local PlantUML projects. */

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
