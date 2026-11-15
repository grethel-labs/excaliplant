/**
 * Visual themes. A theme maps semantic roles (`class`, `note`, `edge`, …) to
 * colours and stroke settings; diagram modules only ever ask for roles, which
 * keeps colour decisions in one place and makes `skinparam`/`<style>`
 * overrides uniform across diagram types.
 * @module draw/theme
 */

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
 * @property {string} ink Default stroke and text colour.
 * @property {string} muted Secondary text/line colour.
 * @property {number} fontSize
 * @property {number} roughness 0 = clean, 1 = sketchy, 2 = very sketchy.
 * @property {number} strokeWidth
 * @property {"solid" | "hachure" | "cross-hatch"} fillStyle
 * @property {{ fill: string, stroke: string }[]} palette Ordered hue pairs for series/branches.
 * @property {Record<string, RoleStyle>} roles
 */

/** Light hue pairs (fill, stroke) based on Excalidraw's open-color palette. */
const LIGHT = {
  blue: { fill: "#d0ebff", stroke: "#1971c2" },
  green: { fill: "#d3f9d8", stroke: "#2f9e44" },
  yellow: { fill: "#fff3bf", stroke: "#e67700" },
  violet: { fill: "#e5dbff", stroke: "#6741d9" },
  red: { fill: "#ffe3e3", stroke: "#c92a2a" },
  cyan: { fill: "#c5f6fa", stroke: "#0c8599" },
  orange: { fill: "#ffe8cc", stroke: "#d9480f" },
  grape: { fill: "#f3d9fa", stroke: "#9c36b5" },
  teal: { fill: "#c3fae8", stroke: "#099268" },
  gray: { fill: "#f1f3f5", stroke: "#495057" },
  pink: { fill: "#ffdeeb", stroke: "#c2255c" },
  lime: { fill: "#e9fac8", stroke: "#5c940d" },
};

const DARK = {
  blue: { fill: "#1c3d5a", stroke: "#74c0fc" },
  green: { fill: "#1f4227", stroke: "#8ce99a" },
  yellow: { fill: "#4a3f12", stroke: "#ffd43b" },
  violet: { fill: "#352a5c", stroke: "#b197fc" },
  red: { fill: "#5c2121", stroke: "#ffa8a8" },
  cyan: { fill: "#163f45", stroke: "#66d9e8" },
  orange: { fill: "#4f2e14", stroke: "#ffa94d" },
  grape: { fill: "#45224d", stroke: "#e599f7" },
  teal: { fill: "#143f35", stroke: "#63e6be" },
  gray: { fill: "#2b2f33", stroke: "#adb5bd" },
  pink: { fill: "#4d1f33", stroke: "#faa2c1" },
  lime: { fill: "#2f3d14", stroke: "#c0eb75" },
};

/**
 * @param {Record<string, { fill: string, stroke: string }>} h
 * @param {string} ink
 * @param {string} muted
 * @param {string} paper
 * @returns {Record<string, RoleStyle>}
 */
function roles(h, ink, muted, paper) {
  return {
    default: { ...h.blue, text: ink },
    // UML structure
    class: { ...h.blue, text: ink },
    abstract: { ...h.violet, text: ink },
    interface: { ...h.green, text: ink },
    enum: { ...h.yellow, text: ink },
    annotation: { ...h.grape, text: ink },
    entity: { ...h.cyan, text: ink },
    object: { ...h.blue, text: ink },
    map: { ...h.teal, text: ink },
    json: { ...h.gray, text: ink },
    // component / deployment
    component: { ...h.blue, text: ink },
    node: { ...h.teal, text: ink },
    database: { ...h.orange, text: ink },
    storage: { ...h.orange, text: ink },
    queue: { ...h.orange, text: ink },
    cloud: { ...h.cyan, text: ink },
    artifact: { ...h.gray, text: ink },
    file: { ...h.gray, text: ink },
    card: { ...h.yellow, text: ink },
    usecase: { ...h.violet, text: ink },
    actor: { fill: "transparent", stroke: ink, text: ink },
    boundary: { ...h.red, text: ink },
    control: { ...h.red, text: ink },
    label: { fill: "transparent", stroke: "transparent", text: ink },
    container: { fill: "transparent", stroke: muted, text: ink, strokeWidth: 1 },
    package: { fill: "transparent", stroke: muted, text: ink, strokeWidth: 1 },
    note: { fill: h.yellow.fill, stroke: h.yellow.stroke, text: ink, strokeWidth: 1 },
    edge: { stroke: muted, text: ink, strokeWidth: 2 },
    edgeLabel: { fill: paper, stroke: "transparent", text: ink },
    // sequence
    participant: { ...h.blue, text: ink },
    lifeline: { stroke: muted, strokeStyle: "dashed", strokeWidth: 1 },
    activation: { fill: h.gray.fill, stroke: ink, strokeWidth: 1 },
    message: { stroke: ink, text: ink, strokeWidth: 2 },
    fragment: { fill: "transparent", stroke: h.violet.stroke, text: ink, strokeWidth: 1 },
    fragmentTag: { fill: h.violet.fill, stroke: h.violet.stroke, text: ink },
    divider: { fill: paper, stroke: muted, text: ink, strokeWidth: 1 },
    reference: { fill: paper, stroke: ink, text: ink, strokeWidth: 1 },
    participantBox: { fill: h.gray.fill, stroke: muted, text: ink, strokeWidth: 1 },
    // state & activity
    state: { ...h.blue, text: ink },
    compositeState: { fill: "transparent", stroke: h.blue.stroke, text: ink },
    pseudo: { fill: ink, stroke: ink, text: ink },
    action: { ...h.blue, text: ink },
    decision: { ...h.yellow, text: ink },
    bar: { fill: ink, stroke: ink },
    swimlane: { fill: "transparent", stroke: muted, text: ink, strokeWidth: 1 },
    partition: { fill: "transparent", stroke: muted, text: ink, strokeWidth: 1 },
    // generic chrome
    title: { text: ink, fontSize: 26 },
    caption: { text: muted, fontSize: 14 },
    header: { text: muted, fontSize: 13 },
    footer: { text: muted, fontSize: 13 },
    legend: { fill: h.gray.fill, stroke: muted, text: ink, strokeWidth: 1 },
    mainframe: { fill: "transparent", stroke: ink, text: ink, strokeWidth: 1 },
    grid: { stroke: muted, strokeWidth: 1, strokeStyle: "dotted" },
    axis: { stroke: ink, strokeWidth: 1, text: ink },
    highlight: { ...h.red, text: ink },
    muted: { fill: h.gray.fill, stroke: muted, text: muted },
  };
}

/** @type {Record<string, Theme>} */
export const THEMES = {
  sketch: {
    name: "sketch",
    background: "#ffffff",
    ink: "#1e1e1e",
    muted: "#495057",
    fontSize: 16,
    roughness: 1,
    strokeWidth: 2,
    fillStyle: "solid",
    palette: Object.values(LIGHT),
    roles: roles(LIGHT, "#1e1e1e", "#495057", "#ffffff"),
  },
  plain: {
    name: "plain",
    background: "#ffffff",
    ink: "#1e1e1e",
    muted: "#495057",
    fontSize: 16,
    roughness: 0,
    strokeWidth: 1.5,
    fillStyle: "solid",
    palette: Object.values(LIGHT),
    roles: roles(LIGHT, "#1e1e1e", "#495057", "#ffffff"),
  },
  hachure: {
    name: "hachure",
    background: "#ffffff",
    ink: "#1e1e1e",
    muted: "#495057",
    fontSize: 16,
    roughness: 1,
    strokeWidth: 2,
    fillStyle: "hachure",
    palette: Object.values(LIGHT),
    roles: roles(
      Object.fromEntries(
        Object.entries(LIGHT).map(([k, v]) => [k, { fill: v.stroke, stroke: v.stroke }]),
      ),
      "#1e1e1e",
      "#495057",
      "#ffffff",
    ),
  },
  mono: {
    name: "mono",
    background: "#ffffff",
    ink: "#1e1e1e",
    muted: "#495057",
    fontSize: 16,
    roughness: 1,
    strokeWidth: 2,
    fillStyle: "solid",
    palette: Array(6).fill({ fill: "#ffffff", stroke: "#1e1e1e" }),
    roles: roles(
      Object.fromEntries(
        Object.keys(LIGHT).map((k) => [k, { fill: "#ffffff", stroke: "#1e1e1e" }]),
      ),
      "#1e1e1e",
      "#495057",
      "#ffffff",
    ),
  },
  dark: {
    name: "dark",
    background: "#121212",
    ink: "#e9ecef",
    muted: "#adb5bd",
    fontSize: 16,
    roughness: 1,
    strokeWidth: 2,
    fillStyle: "solid",
    palette: Object.values(DARK),
    roles: roles(DARK, "#e9ecef", "#adb5bd", "#121212"),
  },
  blueprint: {
    name: "blueprint",
    background: "#0b3d91",
    ink: "#ffffff",
    muted: "#c5d7f7",
    fontSize: 16,
    roughness: 1,
    strokeWidth: 2,
    fillStyle: "solid",
    palette: Array(6).fill({ fill: "#0e4aa8", stroke: "#ffffff" }),
    roles: roles(
      Object.fromEntries(
        Object.keys(LIGHT).map((k) => [k, { fill: "#0e4aa8", stroke: "#ffffff" }]),
      ),
      "#ffffff",
      "#c5d7f7",
      "#0b3d91",
    ),
  },
};

/** Names of the bundled themes. */
export const THEME_NAMES = Object.freeze(Object.keys(THEMES));

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
 * @param {{ sketch?: boolean }} [options]
 * @returns {Theme}
 */
export function createTheme(base, options = {}) {
  const src =
    typeof base === "object" && base
      ? base
      : (THEMES[/** @type {string} */ (base) ?? "sketch"] ?? THEMES.sketch);
  /** @type {Theme} */
  const theme = {
    ...src,
    palette: src.palette.slice(),
    roles: Object.fromEntries(Object.entries(src.roles).map(([k, v]) => [k, { ...v }])),
  };
  if (options.sketch === false) theme.roughness = 0;
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
