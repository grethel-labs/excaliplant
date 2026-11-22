// Playground options: defaults, validation and the mapping onto `render()`.
// Pure functions only (no DOM), shared by the page, the worker and the tests.

export { THEME_NAMES as THEME_CHOICES } from "../../src/draw/theme.mjs";
import { THEME_NAMES as THEME_CHOICES } from "../../src/draw/theme.mjs";

/** Diagram kinds that can be forced; a test keeps this in sync with `listDiagramTypes()`. */
export const KIND_CHOICES = Object.freeze([
  "sequence",
  "class",
  "activity",
  "state",
  "component",
  "usecase",
  "deployment",
  "object",
  "timing",
  "gantt",
  "mindmap",
  "wbs",
  "json",
  "yaml",
  "archimate",
  "chen",
  "nwdiag",
  "salt",
  "ebnf",
  "regex",
  "dot",
  "chronology",
  "files",
  "chart",
  "math",
  "latex",
  "ditaa",
  "legacy-activity",
  "creole",
]);

/** Largest PlantUML text the playground accepts (UTF-8 bytes). */
export const MAX_SOURCE_BYTES = 200 * 1024;

/** Canvas area cap for PNG export (iOS Safari refuses more than 16.7 M pixels). */
export const MAX_PNG_PIXELS = 16_000_000;

/**
 * @typedef {object} PlaygroundOptions
 * @property {string} theme `auto` (follows the page) or a theme name.
 * @property {boolean} clean Clean strokes instead of hand-drawn ones.
 * @property {string} seed Seed for stroke wobble; empty uses the library default.
 * @property {"default" | "transparent" | "custom"} background
 * @property {string} backgroundColor `#rrggbb`, used when `background` is `custom`.
 * @property {boolean} strict Fail on unrecognised lines.
 * @property {number} page 0-based page of a `newpage` document.
 * @property {number} block 0-based `@start…@end` block.
 * @property {string} kind Forced diagram kind; empty detects it.
 * @property {string} defines `NAME=value` per line (preprocessor variables).
 * @property {string} filename Value of `%filename()`.
 * @property {string} date `YYYY-MM-DD` returned by `%date()`; empty means none.
 * @property {number | null} pngWidth PNG width in pixels; `null` uses the scale.
 * @property {number} pngScale PNG scale relative to the SVG size.
 */

/** @type {Readonly<PlaygroundOptions>} */
export const DEFAULT_OPTIONS = Object.freeze({
  theme: "auto",
  clean: false,
  seed: "",
  background: "default",
  backgroundColor: "#ffffff",
  strict: false,
  page: 0,
  block: 0,
  kind: "",
  defines: "",
  filename: "",
  date: "",
  pngWidth: null,
  pngScale: 2,
});

const MAX_DEFINES = 100;
const FORBIDDEN_NAMES = new Set(["__proto__", "constructor", "prototype"]);

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function int(value, min, max, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}

/**
 * Coerce anything (stored JSON, a share link) into a complete, valid options
 * object. Unknown keys are dropped and invalid values fall back to defaults.
 * @param {unknown} raw
 * @returns {PlaygroundOptions}
 */
export function normalizeOptions(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const d = DEFAULT_OPTIONS;
  const str = (/** @type {unknown} */ v, /** @type {string} */ fb, max = 200) =>
    typeof v === "string" ? v.slice(0, max) : fb;
  const date = str(o.date, "", 10);
  const pngWidth = o.pngWidth === null || o.pngWidth === undefined ? null : Number(o.pngWidth);
  const scale = Number(o.pngScale);
  return {
    theme:
      o.theme === "auto" || THEME_CHOICES.includes(/** @type {any} */ (o.theme))
        ? /** @type {string} */ (o.theme)
        : d.theme,
    clean: o.clean === true,
    seed: str(o.seed, d.seed, 100),
    background:
      o.background === "transparent" || o.background === "custom" ? o.background : "default",
    backgroundColor:
      typeof o.backgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(o.backgroundColor)
        ? o.backgroundColor.toLowerCase()
        : d.backgroundColor,
    strict: o.strict === true,
    page: int(o.page, 0, 999, 0),
    block: int(o.block, 0, 99, 0),
    kind: KIND_CHOICES.includes(/** @type {any} */ (o.kind)) ? /** @type {string} */ (o.kind) : "",
    defines: str(o.defines, "", 4000),
    filename: str(o.filename, "", 200),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : "",
    pngWidth:
      pngWidth !== null && Number.isFinite(pngWidth) ? int(pngWidth, 16, 16_000, 1600) : null,
    pngScale: Number.isFinite(scale) ? Math.min(8, Math.max(0.1, scale)) : d.pngScale,
  };
}

/**
 * Only the options that differ from the defaults (keeps share links short).
 * @param {PlaygroundOptions} options
 * @returns {Partial<PlaygroundOptions>}
 */
export function diffOptions(options) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(options)) {
    if (v !== /** @type {Record<string, unknown>} */ (DEFAULT_OPTIONS)[k]) out[k] = v;
  }
  return out;
}

/**
 * Parse the preprocessor-defines text (`NAME=value` per line; blank lines and
 * `'` comments are skipped). Mirrors the CLI's `-D NAME=value`.
 * @param {string} text
 * @returns {{ defines: Record<string, string>, errors: { line: number, text: string }[] }}
 */
export function parseDefines(text) {
  /** @type {Record<string, string>} */
  const defines = Object.create(null);
  /** @type {{ line: number, text: string }[]} */
  const errors = [];
  let count = 0;
  const lines = String(text).split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("'")) continue;
    const eq = line.indexOf("=");
    const name = (eq < 0 ? line : line.slice(0, eq)).trim();
    const value = eq < 0 ? "" : line.slice(eq + 1).trim();
    if (
      !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) ||
      FORBIDDEN_NAMES.has(name) ||
      count >= MAX_DEFINES
    ) {
      errors.push({ line: i + 1, text: line.slice(0, 80) });
      continue;
    }
    if (!(name in defines)) count++;
    defines[name] = value;
  }
  return { defines, errors };
}

/**
 * Options for `render()` (and the SVG step) from the UI state.
 * @param {PlaygroundOptions} options
 * @param {{ pageDark?: boolean }} [env] `pageDark` makes `auto` pick the dark theme.
 * @returns {{ render: Record<string, unknown>, svg: { background?: string } }}
 */
export function toRenderOptions(options, env = {}) {
  const o = normalizeOptions(options);
  /** @type {Record<string, unknown>} */
  const render = {};
  // `auto` leaves the theme to the library (default sketch, honours `!theme`)
  // on a light page and picks `dark` on a dark page.
  if (o.theme !== "auto") render.theme = o.theme;
  else if (env.pageDark) render.theme = "dark";
  if (o.clean) render.sketch = false;
  if (o.seed !== "") render.seed = o.seed;
  if (o.strict) render.strict = true;
  if (o.page > 0) render.page = o.page;
  if (o.block > 0) render.block = o.block;
  if (o.kind) render.kind = o.kind;
  const { defines } = parseDefines(o.defines);
  if (Object.keys(defines).length > 0) render.defines = defines;
  if (o.filename) render.filename = o.filename;
  if (o.date) render.date = new Date(`${o.date}T00:00:00Z`);
  /** @type {{ background?: string }} */
  const svg = {};
  if (o.background === "transparent") svg.background = "transparent";
  else if (o.background === "custom") svg.background = o.backgroundColor;
  return { render, svg };
}

/**
 * Pixel size of the PNG export. `pngWidth` wins over `pngScale` (like the CLI);
 * the result is clamped to 16–16000 px wide and to the canvas area cap.
 * @param {{ width: number, height: number }} svg Intrinsic SVG size.
 * @param {Pick<PlaygroundOptions, "pngWidth" | "pngScale">} options
 * @returns {{ width: number, height: number, reduced: boolean }}
 */
export function pngSize(svg, options) {
  const w0 = Math.max(1, svg.width || 800);
  const h0 = Math.max(1, svg.height || 600);
  const wanted = options.pngWidth ?? w0 * Math.min(8, Math.max(0.1, options.pngScale || 2));
  let width = Math.round(Math.min(16_000, Math.max(16, wanted)));
  let height = Math.max(1, Math.round((width * h0) / w0));
  let reduced = false;
  if (width * height > MAX_PNG_PIXELS) {
    const f = Math.sqrt(MAX_PNG_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * f));
    height = Math.max(1, Math.floor(height * f));
    reduced = true;
  }
  return { width, height, reduced };
}
