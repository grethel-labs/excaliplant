/**
 * Plugin settings: defaults and validation. No Obsidian imports, so the module
 * is testable in plain Node.
 * @module config
 */

import { THEME_NAMES } from "../../../src/draw/theme.mjs";

/** Languages of fenced code blocks that are rendered. */
export const LANGUAGES = Object.freeze(["plantuml", "puml", "uml"]);

/** Theme choices in the settings dropdown; `auto` follows Obsidian's light/dark mode. */
export const THEME_CHOICES = Object.freeze(["auto", ...THEME_NAMES]);

/**
 * @typedef {object} ExcaliplantSettings
 * @property {string} theme `auto` or a theme name.
 * @property {boolean} clean Clean strokes instead of the hand-drawn look.
 * @property {string} seed Stroke-wobble seed; empty means the default.
 * @property {number} maxWidth Maximum display width in pixels; 0 means unlimited.
 * @property {boolean} transparent Transparent diagram background.
 * @property {boolean} showWarnings List parser warnings under each diagram.
 */

/** @type {Readonly<ExcaliplantSettings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  theme: "auto",
  clean: false,
  seed: "",
  maxWidth: 0,
  transparent: false,
  showWarnings: false,
});

/**
 * Coerce stored data (which may be missing, outdated or hand-edited) into valid settings.
 * @param {unknown} raw
 * @returns {ExcaliplantSettings}
 */
export function normalizeSettings(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const maxWidth = Math.round(Number(o.maxWidth));
  return {
    theme:
      typeof o.theme === "string" && THEME_CHOICES.includes(o.theme)
        ? o.theme
        : DEFAULT_SETTINGS.theme,
    clean: o.clean === true,
    seed: typeof o.seed === "string" ? o.seed.trim().slice(0, 64) : DEFAULT_SETTINGS.seed,
    maxWidth: Number.isFinite(maxWidth) ? Math.min(16_000, Math.max(0, maxWidth)) : 0,
    transparent: o.transparent === true,
    showWarnings: o.showWarnings === true,
  };
}
