/**
 * PlantUML colour language: HTML colour names, hex notations, gradients and the
 * inline colour specification `#back;line:red;line.dashed;text:blue`.
 * All results are normalised `#rrggbb` (or `#rrggbbaa`) strings, so they are
 * safe to place in SVG attributes.
 * @module syntax/color
 */

// prettier-ignore
const NAMED = new Map(Object.entries({
  aliceblue:"f0f8ff",antiquewhite:"faebd7",aqua:"00ffff",aquamarine:"7fffd4",azure:"f0ffff",beige:"f5f5dc",
  bisque:"ffe4c4",black:"000000",blanchedalmond:"ffebcd",blue:"0000ff",blueviolet:"8a2be2",brown:"a52a2a",
  burlywood:"deb887",cadetblue:"5f9ea0",chartreuse:"7fff00",chocolate:"d2691e",coral:"ff7f50",
  cornflowerblue:"6495ed",cornsilk:"fff8dc",crimson:"dc143c",cyan:"00ffff",darkblue:"00008b",darkcyan:"008b8b",
  darkgoldenrod:"b8860b",darkgray:"a9a9a9",darkgreen:"006400",darkgrey:"a9a9a9",darkkhaki:"bdb76b",
  darkmagenta:"8b008b",darkolivegreen:"556b2f",darkorange:"ff8c00",darkorchid:"9932cc",darkred:"8b0000",
  darksalmon:"e9967a",darkseagreen:"8fbc8f",darkslateblue:"483d8b",darkslategray:"2f4f4f",
  darkslategrey:"2f4f4f",darkturquoise:"00ced1",darkviolet:"9400d3",deeppink:"ff1493",deepskyblue:"00bfff",
  dimgray:"696969",dimgrey:"696969",dodgerblue:"1e90ff",firebrick:"b22222",floralwhite:"fffaf0",
  forestgreen:"228b22",fuchsia:"ff00ff",gainsboro:"dcdcdc",ghostwhite:"f8f8ff",gold:"ffd700",
  goldenrod:"daa520",gray:"808080",green:"008000",greenyellow:"adff2f",grey:"808080",honeydew:"f0fff0",
  hotpink:"ff69b4",indianred:"cd5c5c",indigo:"4b0082",ivory:"fffff0",khaki:"f0e68c",lavender:"e6e6fa",
  lavenderblush:"fff0f5",lawngreen:"7cfc00",lemonchiffon:"fffacd",lightblue:"add8e6",lightcoral:"f08080",
  lightcyan:"e0ffff",lightgoldenrodyellow:"fafad2",lightgray:"d3d3d3",lightgreen:"90ee90",lightgrey:"d3d3d3",
  lightpink:"ffb6c1",lightsalmon:"ffa07a",lightseagreen:"20b2aa",lightskyblue:"87cefa",
  lightslategray:"778899",lightslategrey:"778899",lightsteelblue:"b0c4de",lightyellow:"ffffe0",lime:"00ff00",
  limegreen:"32cd32",linen:"faf0e6",magenta:"ff00ff",maroon:"800000",mediumaquamarine:"66cdaa",
  mediumblue:"0000cd",mediumorchid:"ba55d3",mediumpurple:"9370db",mediumseagreen:"3cb371",
  mediumslateblue:"7b68ee",mediumspringgreen:"00fa9a",mediumturquoise:"48d1cc",mediumvioletred:"c71585",
  midnightblue:"191970",mintcream:"f5fffa",mistyrose:"ffe4e1",moccasin:"ffe4b5",navajowhite:"ffdead",
  navy:"000080",oldlace:"fdf5e6",olive:"808000",olivedrab:"6b8e23",orange:"ffa500",orangered:"ff4500",
  orchid:"da70d6",palegoldenrod:"eee8aa",palegreen:"98fb98",paleturquoise:"afeeee",palevioletred:"db7093",
  papayawhip:"ffefd5",peachpuff:"ffdab9",peru:"cd853f",pink:"ffc0cb",plum:"dda0dd",powderblue:"b0e0e6",
  purple:"800080",rebeccapurple:"663399",red:"ff0000",rosybrown:"bc8f8f",royalblue:"4169e1",
  saddlebrown:"8b4513",salmon:"fa8072",sandybrown:"f4a460",seagreen:"2e8b57",seashell:"fff5ee",
  sienna:"a0522d",silver:"c0c0c0",skyblue:"87ceeb",slateblue:"6a5acd",slategray:"708090",
  slategrey:"708090",snow:"fffafa",springgreen:"00ff7f",steelblue:"4682b4",tan:"d2b48c",teal:"008080",
  thistle:"d8bfd8",tomato:"ff6347",turquoise:"40e0d0",violet:"ee82ee",wheat:"f5deb3",white:"ffffff",
  whitesmoke:"f5f5f5",yellow:"ffff00",yellowgreen:"9acd32",
  // PlantUML archimate / application palette names.
  application:"c2f0ff",business:"ffffcc",implementation:"e5ffe5",motivation:"ccccff",physical:"97ff97",
  strategy:"f8e7c0",technology:"c9ffc9",
}));

/** Colour value used to request "no colour". */
export const TRANSPARENT = "transparent";

/**
 * Parse a single colour token (`red`, `#red`, `#f00`, `#ff0000`, `#ff000080`,
 * `transparent`). Gradients (`#a/b`, `#a|b`, `#a-b`, `#a\b`) resolve to their
 * first colour.
 * @param {string | null | undefined} input
 * @returns {string | null} Normalised colour or null when not a colour.
 */
export function parseColor(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/^#+/, "");
  const grad = /^([^/|\\-]+)[/|\\-]/.exec(s);
  if (grad && !/^[0-9a-f]{3,8}$/i.test(s)) s = grad[1];
  const lower = s.toLowerCase();
  if (lower === "transparent" || lower === "none") return TRANSPARENT;
  const named = NAMED.get(lower);
  if (named) return `#${named}`;
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${[...lower].map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/i.test(s) || /^[0-9a-f]{8}$/i.test(s)) return `#${lower}`;
  return null;
}

/**
 * Whether a token looks like a colour (used to disambiguate `#tag` syntax).
 * @param {string} token
 */
export function isColor(token) {
  return parseColor(token) !== null;
}

/**
 * @param {number} n 24-bit integer.
 * @returns {string}
 */
export function toHex(n) {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** @param {string} hex */
function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Linear mix of two colours.
 * @param {string} a
 * @param {string} b
 * @param {number} t 0 → a, 1 → b.
 * @returns {string}
 */
export function mixColors(a, b, t) {
  const ca = rgb(parseColor(a) ?? "#000000");
  const cb = rgb(parseColor(b) ?? "#000000");
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Relative luminance in `[0, 1]`.
 * @param {string} color
 */
export function luminance(color) {
  const c = parseColor(color);
  if (!c || c === TRANSPARENT) return 1;
  const [r, g, b] = rgb(c).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @typedef {object} ColorSpec
 * @property {string} [fill]
 * @property {string} [stroke]
 * @property {string} [text]
 * @property {"solid" | "dashed" | "dotted"} [strokeStyle]
 * @property {number} [strokeWidth]
 * @property {boolean} [hidden]
 */

/**
 * Parse an inline colour specification as written after element declarations:
 * `#pink`, `#pink;line:red;line.bold;text:blue`, `##[dashed]blue`,
 * `#back:pink;line:red`.
 * @param {string | null | undefined} input
 * @returns {ColorSpec}
 */
export function parseColorSpec(input) {
  /** @type {ColorSpec} */
  const spec = {};
  if (!input) return spec;
  let s = input.trim();
  const lineOnly = /^##(?:\[(\w+)\])?(.*)$/.exec(s);
  if (lineOnly) {
    applyLineStyle(spec, lineOnly[1]);
    const c = parseColor(lineOnly[2]);
    if (c) spec.stroke = c;
    return spec;
  }
  s = s.replace(/^#/, "");
  for (const part of s.split(/[;]/)) {
    const p = part.trim();
    if (!p) continue;
    const kv = /^(back|line|text|border)(?:\.(\w+))?\s*(?::\s*#?(.*))?$/i.exec(p);
    if (kv) {
      const key = kv[1].toLowerCase();
      const value = kv[3] ? parseColor(kv[3]) : null;
      if (kv[2]) applyLineStyle(spec, kv[2]);
      if (!value) continue;
      if (key === "back") spec.fill = value;
      else if (key === "line" || key === "border") spec.stroke = value;
      else spec.text = value;
      continue;
    }
    const c = parseColor(p);
    if (c && spec.fill === undefined) spec.fill = c;
  }
  return spec;
}

/**
 * @param {ColorSpec} spec
 * @param {string | undefined} style
 */
function applyLineStyle(spec, style) {
  if (!style) return;
  const s = style.toLowerCase();
  if (s === "dashed") spec.strokeStyle = "dashed";
  else if (s === "dotted") spec.strokeStyle = "dotted";
  else if (s === "bold") spec.strokeWidth = 3;
  else if (s === "hidden") spec.hidden = true;
  else if (s === "plain") spec.strokeStyle = "solid";
}
