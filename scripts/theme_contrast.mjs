import { resolveColors } from "../src/draw/theme_registry.mjs";

function rgba(color) {
  if (color === "transparent") return [0, 0, 0, 0];
  const bytes = color
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16));
  return [bytes[0], bytes[1], bytes[2], bytes.length === 4 ? bytes[3] / 255 : 1];
}

// The configured reference backdrop is opaque, so each composed layer is opaque.
function over([r, g, b, alpha], backdrop) {
  return [r, g, b].map((channel, index) => channel * alpha + backdrop[index] * (1 - alpha));
}

function luminance(rgb) {
  const channels = rgb.map((value) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function ratio(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Validate the declared colour pairs against resolved definitions and reference backdrops. */
export function assertThemeContrast(definition) {
  const colors = resolveColors(definition.colors);
  const { backdrops, pairs } = definition.contrast;
  const canvas = colors.get("canvas.background");
  if (!canvas) throw new Error(`${definition.id}: missing canvas.background`);
  if (rgba(canvas)[3] < 1 && backdrops.length === 0)
    throw new Error(`${definition.id}: a translucent canvas requires contrast backdrops`);
  const palette = definition.palette.map((slot) => ({
    foreground: `palette.${slot}.stroke`,
    backgrounds: [],
    kind: "graphic",
  }));
  const failures = [];
  for (const pair of [...pairs, ...palette]) {
    const { foreground, backgrounds, kind } = pair;
    if (!Array.isArray(backgrounds) || !["text", "graphic"].includes(kind))
      throw new Error(`${definition.id}: invalid contrast pair for "${foreground}"`);
    for (const token of [foreground, ...backgrounds]) {
      if (!colors.has(token))
        throw new Error(`${definition.id}: unknown contrast colour "${token}"`);
    }
    const threshold = kind === "text" ? 4.5 : 3;
    for (const backdrop of backdrops.length ? backdrops : ["#ffffff"]) {
      const background = backgrounds.reduce(
        (below, token) => over(rgba(colors.get(token)), below),
        over(rgba(canvas), rgba(backdrop)),
      );
      const actual = ratio(over(rgba(colors.get(foreground)), background), background);
      if (actual < threshold) {
        const layers = ["canvas.background", ...backgrounds].join(" + ");
        failures.push(
          `${foreground} on ${layers} over ${backdrop}: ${actual.toFixed(3)}:1 < ${threshold}:1`,
        );
      }
    }
  }
  if (failures.length)
    throw new Error(`${definition.id}: theme contrast failed\n${failures.join("\n")}`);
}
