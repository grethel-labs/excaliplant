/**
 * Visual themes. A theme maps semantic roles (`class`, `note`, `edge`, …) to
 * colours and stroke settings; diagram modules only ever ask for roles, which
 * keeps colour decisions in one place and makes `skinparam`/`<style>`
 * overrides uniform across diagram types.
 * @module draw/theme
 */

import { definitions } from "./themes/definitions.generated.mjs";
import { createThemeRegistry, resolveColors } from "./theme_registry.mjs";

/**
 * @typedef {object} RoleStyle
 * @property {string} [fill] Background colour or `transparent`.
 * @property {string} [stroke]
 * @property {string} [text]
 * @property {number} [strokeWidth]
 * @property {"solid" | "dashed" | "dotted"} [strokeStyle]
 * @property {number} [fontSize]
 * @property {boolean} [rounded]
 * @property {"solid" | "hachure" | "cross-hatch"} [fillStyle]
 */

/**
 * @typedef {object} Theme
 * @property {string} name
 * @property {string} background
 * @property {string} [surface] Surface for internal shapes and label backplates.
 * @property {string} ink Default stroke and text colour.
 * @property {string} muted Secondary text/line colour.
 * @property {number} fontSize
 * @property {number} roughness 0 = clean, 1 = sketchy, 2 = very sketchy.
 * @property {number} edgeRoughness Roughness of connectors; low so lines stay straight and corners crisp.
 * @property {number} strokeWidth
 * @property {"solid" | "hachure" | "cross-hatch"} fillStyle
 * @property {{ fill: string, stroke: string }[]} palette Ordered hue pairs for series/branches.
 * @property {Record<string, RoleStyle>} roles
 */

const registry = createThemeRegistry(definitions);

/** @type {WeakMap<Theme, Map<string, string>>} */
const colorValues = new WeakMap();

/** @param {Theme} theme @param {string} path */
export function themeColor(theme, path) {
  const value = colorValues.get(theme)?.get(path);
  if (value === undefined) throw new Error(`Unknown theme colour "${path}"`);
  return value;
}

/** @param {string} role */
const roleKey = (role) => role.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

/**
 * @param {string} id
 * @param {Record<string, string>} [overrides]
 * @returns {Theme}
 */
function materialize(id, overrides) {
  const definition = registry.get(id);
  const colors = resolveColors(definition.colors, overrides);
  /** @type {Record<string, RoleStyle>} */
  const roles = Object.create(null);
  /** @type {Record<string, string | number | boolean>} */
  const styles = Object.create(null);
  for (const [path, value] of [...colors, ...Object.entries(definition.styles)]) {
    if (path.startsWith("roles.")) {
      const [, role, field] = path.split(".");
      const key = roleKey(role);
      (roles[key] ??= {})[field] = value;
    } else {
      styles[path] = value;
    }
  }
  const theme = {
    name: id,
    background: colors.get("canvas.background"),
    surface: colors.get("canvas.surface"),
    ink: colors.get("colors.ink"),
    muted: colors.get("colors.muted"),
    fontSize: Number(styles.fontSize),
    strokeWidth: Number(styles.strokeWidth),
    roughness: Number(styles.roughness),
    edgeRoughness: Number(styles.edgeRoughness),
    fillStyle: /** @type {Theme["fillStyle"]} */ (styles.fillStyle),
    palette: definition.palette.map((slot) => ({
      fill: colors.get(`palette.${slot}.fill`),
      stroke: colors.get(`palette.${slot}.stroke`),
    })),
    roles,
  };
  colorValues.set(theme, colors);
  return theme;
}

/** Names of the bundled themes. */
export const THEME_NAMES = Object.freeze([...registry.keys()].filter((id) => id !== "base"));

/** @type {Readonly<Record<string, Theme>>} */
export const THEMES = Object.freeze(
  Object.assign(
    Object.create(null),
    Object.fromEntries(
      THEME_NAMES.map((id) => {
        const theme = materialize(id);
        for (const role of Object.values(theme.roles)) Object.freeze(role);
        for (const pair of theme.palette) Object.freeze(pair);
        Object.freeze(theme.roles);
        Object.freeze(theme.palette);
        return [id, Object.freeze(theme)];
      }),
    ),
  ),
);

/** Names of all addressable colours in the root theme. */
export const THEME_COLOR_NAMES = Object.freeze(Object.keys(registry.get("base").colors));

/**
 * Map PlantUML `!theme` names onto the closest bundled theme.
 * @param {string | null | undefined} name
 * @returns {string | null}
 */
export function mapPlantUmlTheme(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (THEMES[n]) return n;
  if (/(dark|black|night|cyborg|reddress-dark|hacker|spacelab-dark|sunlust)/.test(n)) return "dark";
  if (/(blueprint|amiga)/.test(n)) return "blueprint";
  if (
    /(plain|cerulean|minty|united|materia|lightgray|bluegray|mars|metal|toy|vibrant|_none_)/.test(n)
  )
    return "plain";
  if (/(sketchy|crt)/.test(n)) return "sketch";
  if (/mono|silver/.test(n)) return "mono";
  return null;
}

/**
 * Create a theme instance with per-diagram overrides.
 * @param {string | Theme | undefined} base
 * @param {{ sketch?: boolean, colors?: Record<string, string> }} [options]
 * @returns {Theme}
 */
export function createTheme(base, options = {}) {
  const id = typeof base === "string" && Object.hasOwn(THEMES, base) ? base : "sketch";
  const legacy = typeof base === "object" && base;
  const src = legacy || (options.colors ? materialize(id, options.colors) : THEMES[id]);
  /** @type {Theme} */
  const theme = {
    ...src,
    palette: src.palette.map((pair) => ({ ...pair })),
    roles: Object.assign(
      Object.create(null),
      Object.fromEntries(Object.entries(src.roles).map(([key, style]) => [key, { ...style }])),
    ),
  };
  const values = legacy
    ? resolveColors(registry.get("base").colors, options.colors)
    : colorValues.get(src);
  colorValues.set(theme, values);
  if (legacy && options.colors) {
    for (const path of Object.keys(options.colors)) {
      const value = values.get(path);
      const [, name, channel] = path.split(".");
      if (path.startsWith("roles.")) {
        (theme.roles[roleKey(name)] ??= {})[channel] = value;
      } else if (path.startsWith("palette.")) {
        const index = registry.get("base").palette.indexOf(name);
        if (!theme.palette[index])
          throw new Error(`Legacy theme has no palette entry for "${path}"`);
        theme.palette[index][channel] = value;
      } else if (path === "canvas.background") theme.background = value;
      else if (path === "canvas.surface") theme.surface = value;
      else if (path === "colors.ink") theme.ink = value;
      else if (path === "colors.muted") theme.muted = value;
    }
  }
  if (options.sketch === false) {
    theme.roughness = 0;
    theme.edgeRoughness = 0;
  }
  if (options.sketch === true && theme.roughness === 0) theme.roughness = 1;
  return theme;
}

/**
 * Resolve the style for a role, layering optional overrides on top.
 * @param {Theme} theme
 * @param {string} role
 * @param {...(Partial<RoleStyle> | null | undefined)} overrides
 * @returns {Required<Pick<RoleStyle, "fill" | "stroke" | "text" | "strokeWidth" | "strokeStyle" | "fontSize">> & RoleStyle}
 */
export function roleStyle(theme, role, ...overrides) {
  const base = theme.roles[role] ?? theme.roles.default;
  /** @type {any} */
  const s = {
    fill: "transparent",
    stroke: theme.ink,
    text: theme.ink,
    strokeWidth: theme.strokeWidth,
    strokeStyle: "solid",
    fontSize: theme.fontSize,
    ...base,
  };
  for (const o of overrides) {
    if (!o) continue;
    for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) s[k] = v;
  }
  return s;
}

/**
 * Palette entry by index (wraps around).
 * @param {Theme} theme
 * @param {number} i
 */
export function paletteAt(theme, i) {
  const p = theme.palette;
  return p[((i % p.length) + p.length) % p.length];
}
