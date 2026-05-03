// Deterministic plane colour generation.
// A 32-bit FNV-1a hash maps plane ids to a fixed hue. The plane stroke,
// background, and title fill are derived in HSL so subplanes / boxes can
// gently shift the same hue without picking arbitrary palettes.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Stable 32-bit FNV-1a hash used to map plane ids to hues.
 * @param {string} text Input string to hash.
 * @returns {number} Unsigned 32-bit hash value.
 */
function hash32(text) {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * Convert an HSL triple to a `#RRGGBB` string.
 * @param {number} h Hue in degrees (0–360).
 * @param {number} s Saturation in [0,1].
 * @param {number} l Lightness in [0,1].
 * @returns {string} Hex colour string in lower case.
 */
function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  /**
   * Compute one of the R/G/B channels for the current HSL.
   * @param {number} n Channel offset (0, 8 or 4 — see Wikipedia HSL→RGB).
   * @returns {string} Two-character hex value for that channel.
   */
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * @typedef {{ stroke: string, fill: string, titleFill: string }} ColorTriple
 * Hex-coded fill / stroke / title-fill colours used by one renderable.
 */

/**
 * Deterministically derive a {@link ColorTriple} from a plane id. The
 * same id always yields the same colours so re-rendering the same
 * diagram is byte-stable.
 *
 * @param {string} id Plane identifier (alias or generated slug).
 * @returns {ColorTriple} Stroke / fill / title-fill colours for the plane.
 * @public
 */
export function planeColor(id) {
  const hue = hash32(id) % 360;
  return {
    stroke: hslToHex(hue, 0.62, 0.36),
    fill: hslToHex(hue, 0.55, 0.94),
    titleFill: hslToHex(hue, 0.5, 0.86),
  };
}

/**
 * Derive a subplane's {@link ColorTriple} from its parent plane's
 * triple by darkening the fills slightly.
 *
 * @param {ColorTriple} planeColor Parent plane's colour triple.
 * @returns {ColorTriple} Slightly darker triple for the nested subplane.
 * @public
 */
export function subplaneColor(planeColor) {
  return {
    stroke: planeColor.stroke,
    fill: shiftLightness(planeColor.fill, -0.04),
    titleFill: shiftLightness(planeColor.titleFill, -0.04),
  };
}

/**
 * Derive a box's {@link ColorTriple} from its plane's colour: the
 * stroke matches the plane, the box body is white, and the title bar
 * is a subtly darker variant of the plane fill.
 *
 * @param {ColorTriple} planeColor Owning plane's colour triple.
 * @returns {ColorTriple} Triple with white body and tinted title bar.
 * @public
 */
export function boxColor(planeColor) {
  return {
    stroke: planeColor.stroke,
    fill: "#ffffff",
    titleFill: shiftLightness(planeColor.fill, -0.02),
  };
}

/**
 * Shift the lightness component of a hex colour while preserving hue / saturation.
 * @param {string} hex   Input `#RRGGBB` colour.
 * @param {number} delta Lightness delta in [-1, 1].
 * @returns {string} New `#RRGGBB` colour with clamped lightness.
 */
function shiftLightness(hex, delta) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, Math.min(1, l + delta)));
}

/**
 * Convert a `#RRGGBB` colour into its HSL triple.
 * @param {string} hex `#RRGGBB` colour string.
 * @returns {{h:number,s:number,l:number}} Hue (deg), saturation and lightness in [0,1].
 */
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
