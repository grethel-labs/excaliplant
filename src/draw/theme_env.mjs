import { THEME_COLOR_NAMES } from "./theme.mjs";

const prefix = "EXCALIPLANT_COLOR__";
const names = new Map(
  THEME_COLOR_NAMES.map((path) => [
    prefix + path.toUpperCase().replaceAll("-", "_").replaceAll(".", "__"),
    path,
  ]),
);

/** @param {Record<string, string | undefined>} environment */
export function readThemeEnvironment(environment) {
  /** @type {Record<string, string>} */
  const colors = Object.create(null);
  for (const [key, value] of Object.entries(environment)) {
    if (!key.startsWith(prefix) || value === undefined) continue;
    const path = names.get(key);
    if (!path) throw new Error(`Unknown theme colour environment variable "${key}"`);
    colors[path] = value;
  }
  return Object.keys(colors).length ? colors : undefined;
}
