/**
 * Builtin `%functions` of the PlantUML preprocessor. Functions that would leak
 * host information (`%getenv`, `%load_json` …) are intentionally inert, and
 * `%date` is deterministic unless the caller passes a date.
 * @module core/preprocess/builtins
 */

import { stringify, truthy } from "./expression.mjs";
import { parseColor, toHex, mixColors, luminance } from "../../syntax/color.mjs";

/** @typedef {import("./expression.mjs").PValue} PValue */

/**
 * @typedef {object} BuiltinHost
 * @property {(name: string) => PValue | undefined} getVariable
 * @property {(name: string, value: PValue) => void} setVariable
 * @property {(name: string) => boolean} hasCallable
 * @property {(name: string, args: PValue[]) => PValue} callUser
 * @property {Date | null} date Fixed date for `%date()`, or null for empty output.
 * @property {string} filename
 */

/** @param {PValue} v */
const str = (v) => stringify(v);
/** @param {PValue} v */
const int = (v) => {
  const n = parseInt(stringify(v), 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param {string} hex
 * @param {number} amount -100…100
 */
function shade(hex, amount) {
  const c = parseColor(hex);
  if (!c) return hex;
  const target = amount >= 0 ? "#ffffff" : "#000000";
  return mixColors(c, target, Math.min(1, Math.abs(amount) / 100));
}

/** @type {Record<string, (args: PValue[], host: BuiltinHost) => PValue>} */
export const BUILTINS = {
  strlen: ([s]) => str(s).length,
  substr: ([s, start, len]) => {
    const text = str(s);
    const a = int(start);
    return len === undefined ? text.slice(a) : text.slice(a, a + int(len));
  },
  strpos: ([s, needle]) => str(s).indexOf(str(needle)),
  upper: ([s]) => str(s).toUpperCase(),
  lower: ([s]) => str(s).toLowerCase(),
  string: ([v]) => str(v),
  intval: ([v]) => int(v),
  boolval: ([v]) => truthy(v),
  true: () => true,
  false: () => false,
  not: ([v]) => !truthy(v),
  newline: () => "\n",
  chr: ([n]) => String.fromCodePoint(Math.max(0, Math.min(0x10ffff, int(n)))),
  ord: ([s]) => str(s).codePointAt(0) ?? 0,
  dec2hex: ([n]) => int(n).toString(16),
  hex2dec: ([s]) => parseInt(str(s), 16) || 0,
  size: ([v]) => {
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === "object") return Object.keys(v).length;
    return str(v).length;
  },
  splitstr: ([s, sep]) => str(s).split(str(sep)),
  splitstr_regex: ([s]) => [str(s)],
  str2json: ([s]) => {
    try {
      return JSON.parse(str(s));
    } catch {
      return null;
    }
  },
  json_key_exists: ([obj, key]) =>
    !!obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, str(key)),
  get_json_key: ([obj, key]) =>
    obj && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, str(key))
      ? /** @type {any} */ (obj)[str(key)]
      : null,
  get_json_type: ([v]) =>
    Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "object" ? "object" : typeof v,
  variable_exists: ([name], host) => host.getVariable(normaliseVar(str(name))) !== undefined,
  get_variable_value: ([name], host) => host.getVariable(normaliseVar(str(name))) ?? "",
  set_variable_value: ([name, value], host) => {
    host.setVariable(normaliseVar(str(name)), value);
    return "";
  },
  function_exists: ([name], host) => host.hasCallable(str(name)),
  call_user_func: ([name, ...args], host) => host.callUser(str(name), args),
  invoke_procedure: ([name, ...args], host) => host.callUser(str(name), args),
  date: ([format], host) => (host.date ? formatDate(host.date, format ? str(format) : "") : ""),
  filename: (_args, host) => host.filename,
  dirpath: () => "",
  filenameNoExtension: (_args, host) => host.filename.replace(/\.[^.]*$/, ""),
  getenv: () => "",
  version: () => "excaliplant",
  feature: () => false,
  random: () => 0,
  load_json: () => null,
  darken: ([c, amount]) => shade(str(c), -int(amount)),
  lighten: ([c, amount]) => shade(str(c), int(amount)),
  reverse_color: ([c]) => {
    const p = parseColor(str(c));
    if (!p) return str(c);
    const n = parseInt(p.slice(1, 7), 16);
    return toHex(0xffffff - n);
  },
  is_dark: ([c]) => {
    const p = parseColor(str(c));
    return p ? luminance(p) < 0.5 : false;
  },
  is_light: ([c]) => {
    const p = parseColor(str(c));
    return p ? luminance(p) >= 0.5 : true;
  },
};

/** @param {string} name */
function normaliseVar(name) {
  return name.startsWith("$") ? name : `$${name}`;
}

/**
 * Minimal `SimpleDateFormat`-style formatting (yyyy, MM, dd, HH, mm, ss).
 * @param {Date} d
 * @param {string} format
 */
function formatDate(d, format) {
  if (!format) return d.toISOString();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return format
    .replace(/yyyy/g, String(d.getUTCFullYear()))
    .replace(/MM/g, pad(d.getUTCMonth() + 1))
    .replace(/dd/g, pad(d.getUTCDate()))
    .replace(/HH/g, pad(d.getUTCHours()))
    .replace(/mm/g, pad(d.getUTCMinutes()))
    .replace(/ss/g, pad(d.getUTCSeconds()));
}
