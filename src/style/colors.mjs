// Deterministic plane colour generation.
// A 32-bit FNV-1a hash maps plane ids to a fixed hue. The plane stroke,
// background, and title fill are derived in HSL so subplanes / boxes can
// gently shift the same hue without picking arbitrary palettes.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hash32(text) {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function planeColor(id) {
  const hue = hash32(id) % 360;
  return {
    stroke: hslToHex(hue, 0.62, 0.36),
    fill: hslToHex(hue, 0.55, 0.94),
    titleFill: hslToHex(hue, 0.50, 0.86),
  };
}

export function subplaneColor(planeColor) {
  return {
    stroke: planeColor.stroke,
    fill: shiftLightness(planeColor.fill, -0.04),
    titleFill: shiftLightness(planeColor.titleFill, -0.04),
  };
}

export function boxColor(planeColor) {
  return {
    stroke: planeColor.stroke,
    fill: "#ffffff",
    titleFill: shiftLightness(planeColor.fill, -0.02),
  };
}

function shiftLightness(hex, delta) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, Math.min(1, l + delta)));
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}
