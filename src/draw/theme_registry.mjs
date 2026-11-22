import { mixColors } from "../syntax/color.mjs";

/** @typedef {{ref: string, alpha?: number} | {mix: [string, string], weight: number} | string} ColorDefinition */
/** @typedef {{id: string, extends?: string, colors?: Record<string, ColorDefinition>, styles?: Record<string, string | number | boolean>, palette?: string[], contrast?: {backdrops?: string[], pairs?: {foreground: string, backgrounds: string[], kind: "text" | "graphic"}[]}}} ThemeDefinition */

/** @param {unknown} value */
export function normalizeThemeColor(value) {
  if (typeof value !== "string") throw new TypeError("Expected a theme colour string");
  const color = value.toLowerCase();
  if (color === "transparent") return color;
  if (!/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/.test(color))
    throw new TypeError(`Invalid theme colour "${value}"`);
  if (color.length === 4) return "#" + [...color.slice(1)].map((digit) => digit.repeat(2)).join("");
  if (color.length === 9 && color.endsWith("00")) return "transparent";
  if (color.length === 9 && color.endsWith("ff")) return color.slice(0, 7);
  return color;
}

const SEGMENT = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*";
const ID = new RegExp(`^${SEGMENT}$`);
const PATH = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})+$`);

/**
 * Resolve inheritance once and retain colour expressions for per-render overrides.
 * @param {readonly ThemeDefinition[]} definitions
 */
export function createThemeRegistry(definitions) {
  /** @type {Map<string, ThemeDefinition>} */
  const byId = new Map();
  const root = definitions.find((definition) => definition.id === "base");
  if (!root) throw new Error("Missing base theme");
  for (const definition of definitions) {
    const { id, extends: parent } = definition;
    if (!ID.test(id) || byId.has(id)) throw new Error(`Invalid or duplicate theme ID "${id}"`);
    if (id === "base" && parent !== undefined)
      throw new Error("The base theme cannot extend another theme");
    for (const key of Object.keys(definition.colors ?? {})) {
      if (!PATH.test(key)) throw new Error(`Invalid colour path "${key}" in "${id}"`);
      if (id !== "base" && !Object.hasOwn(root.colors ?? {}, key))
        throw new Error(`Colour "${key}" in "${id}" is missing from base`);
    }
    byId.set(id, definition);
  }

  /** @type {Map<string, Required<Omit<ThemeDefinition, "extends">>>} */
  const resolved = new Map();
  /** @param {string} id @param {string[]} chain */
  function visit(id, chain) {
    if (resolved.has(id)) return resolved.get(id);
    if (chain.includes(id))
      throw new Error(`Theme inheritance cycle: ${[...chain, id].join(" → ")}`);
    const definition = byId.get(id);
    if (!definition) throw new Error(`Unknown parent theme: ${[...chain, id].join(" → ")}`);
    const parent = id === "base" ? undefined : visit(definition.extends ?? "base", [...chain, id]);
    const palette = definition.palette ?? parent?.palette;
    if (!Array.isArray(palette) || palette.length === 0 || new Set(palette).size !== palette.length)
      throw new Error(`Invalid palette for "${id}"`);
    const contrast = {
      backdrops: definition.contrast?.backdrops ?? parent?.contrast.backdrops ?? [],
      pairs: [...(parent?.contrast.pairs ?? []), ...(definition.contrast?.pairs ?? [])],
    };
    for (const background of contrast.backdrops) {
      if (normalizeThemeColor(background).length !== 7)
        throw new Error(`Contrast backdrop must be opaque in "${id}"`);
    }
    const result = {
      id,
      colors: { ...parent?.colors, ...definition.colors },
      styles: { ...parent?.styles, ...definition.styles },
      palette: [...palette],
      contrast,
    };
    const colors = resolveColors(result.colors);
    for (const name of palette) {
      for (const channel of ["fill", "stroke"]) {
        if (!ID.test(name) || !colors.has(`palette.${name}.${channel}`))
          throw new Error(`Unknown palette colour "${name}.${channel}" in "${id}"`);
      }
    }
    resolved.set(id, result);
    return result;
  }

  for (const id of byId.keys()) visit(id, []);
  return resolved;
}

/**
 * Evaluate references after host overrides, with full dependency chains in errors.
 * @param {Record<string, ColorDefinition>} definitions
 * @param {Record<string, string>} [overrides]
 */
export function resolveColors(definitions, overrides = {}) {
  const inputs = new Map(Object.entries(definitions));
  for (const [key, value] of Object.entries(overrides)) {
    if (!inputs.has(key)) throw new Error(`Unknown theme colour "${key}"`);
    try {
      inputs.set(key, normalizeThemeColor(value));
    } catch (error) {
      throw new TypeError(`Invalid override for "${key}"`, { cause: error });
    }
  }
  /** @type {Map<string, string>} */
  const values = new Map();

  /** @param {string} key @param {string[]} chain @returns {string} */
  function visit(key, chain) {
    const cached = values.get(key);
    if (cached !== undefined) return cached;
    const path = [...chain, key];
    if (chain.includes(key)) throw new Error(`Theme colour cycle: ${path.join(" → ")}`);
    if (!inputs.has(key)) throw new Error(`Unknown theme colour: ${path.join(" → ")}`);
    const input = inputs.get(key);
    let value;
    if (typeof input === "string") {
      value = normalizeThemeColor(input);
    } else if (
      input &&
      "ref" in input &&
      typeof input.ref === "string" &&
      Object.keys(input).every((field) => field === "ref" || field === "alpha")
    ) {
      value = visit(input.ref, path);
      if (input.alpha !== undefined) {
        const alpha = input.alpha;
        if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
          throw new Error(`Invalid alpha for "${key}"`);
        const rgb = value === "transparent" ? "#000000" : value.slice(0, 7);
        value = normalizeThemeColor(
          rgb +
            Math.round(alpha * 255)
              .toString(16)
              .padStart(2, "0"),
        );
      }
    } else if (
      input &&
      "mix" in input &&
      Array.isArray(input.mix) &&
      input.mix.length === 2 &&
      input.mix.every((name) => typeof name === "string") &&
      Object.keys(input).every((field) => field === "mix" || field === "weight") &&
      Number.isFinite(input.weight) &&
      input.weight >= 0 &&
      input.weight <= 1
    ) {
      value = mixColors(visit(input.mix[0], path), visit(input.mix[1], path), input.weight);
    } else {
      throw new Error(`Invalid definition for theme colour "${key}"`);
    }
    values.set(key, value);
    return value;
  }
  for (const key of inputs.keys()) visit(key, []);
  return values;
}
