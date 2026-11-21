/**
 * Reads the `excaliplant.*` settings and turns them into render options.
 * @module vscode/config
 */

import { DEFAULT_LIMITS, THEME_NAMES } from "./engine.mjs";

/** Limits a setting may override; anything else in `excaliplant.limits` is ignored. */
const LIMIT_KEYS = Object.freeze([
  "maxInputBytes",
  "maxLines",
  "maxNodes",
  "maxEdges",
  "maxElements",
  "maxTextLength",
  "maxBlocks",
]);

/**
 * VS Code colour theme kinds (`vscode.ColorThemeKind`): Light 1, Dark 2,
 * HighContrast 3, HighContrastLight 4.
 * @param {number | undefined} kind
 * @returns {boolean}
 */
export function isDarkKind(kind) {
  return kind === 2 || kind === 3;
}

/**
 * Settings that matter for rendering.
 * @typedef {object} ExcaliplantSettings
 * @property {string} theme Resolved theme name (never `auto`).
 * @property {boolean} clean
 * @property {boolean} markdownEnabled
 * @property {string} assetsDir
 * @property {string} includeDir Empty when `!include` is off.
 * @property {Record<string, number>} limits Only the overridden limits.
 * @property {boolean} trusted
 */

/**
 * Read the current settings. Include and limit overrides are dropped in an
 * untrusted workspace (VS Code also ignores workspace-level values of these
 * settings there, see `restrictedConfigurations`; this is the second line).
 * @param {any} vscode
 * @param {any} [resource] Document URI for resource-scoped settings.
 * @returns {ExcaliplantSettings}
 */
export function readSettings(vscode, resource) {
  const cfg = vscode.workspace.getConfiguration("excaliplant", resource);
  const trusted = vscode.workspace.isTrusted !== false;
  const rawTheme = String(cfg.get("theme", "auto"));
  const dark = isDarkKind(vscode.window?.activeColorTheme?.kind);
  const theme =
    rawTheme === "auto"
      ? dark
        ? "dark"
        : "sketch"
      : THEME_NAMES.includes(rawTheme)
        ? rawTheme
        : "sketch";

  /** @type {Record<string, number>} */
  const limits = Object.create(null);
  const rawLimits = cfg.get("limits", {});
  if (trusted && rawLimits && typeof rawLimits === "object") {
    for (const key of LIMIT_KEYS) {
      const value = /** @type {any} */ (rawLimits)[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        limits[key] = Math.min(
          value,
          DEFAULT_LIMITS[/** @type {keyof typeof DEFAULT_LIMITS} */ (key)] * 32,
        );
      }
    }
  }
  return {
    theme,
    clean: cfg.get("clean", false) === true,
    markdownEnabled: cfg.get("markdown.enabled", true) !== false,
    assetsDir: String(cfg.get("markdown.assetsDir", "assets") || "assets"),
    includeDir: trusted ? String(cfg.get("includeDir", "") || "").trim() : "",
    limits: { ...limits },
    trusted,
  };
}
