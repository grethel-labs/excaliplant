// Reads the committed snapshot of Excalidraw's element typings
// (skills-src/excalidraw-spec/element-types.d.ts.txt; a .txt extension keeps
// Prettier from reformatting the verbatim copy) and turns it into data and
// Markdown. Shared by scripts/skills.mjs (reference document) and
// test/skills.test.mjs (conformance of excaliplant's output).
//
// The typings are a small, regular subset of TypeScript, so a purpose-built
// scanner is enough; it is not a general TypeScript parser. Anything it does
// not understand is ignored rather than guessed.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SPEC_DIR = path.join(ROOT, "skills-src", "excalidraw-spec");

/** Display order of element types; unknown (new) types follow alphabetically. */
const TYPE_ORDER = [
  "rectangle",
  "diamond",
  "ellipse",
  "text",
  "line",
  "arrow",
  "freedraw",
  "image",
  "frame",
  "magicframe",
  "iframe",
  "embeddable",
];

/** Editor-internal element types that never appear in files. */
const INTERNAL_TYPES = new Set(["selection"]);

/**
 * @typedef {object} Member
 * @property {string} name
 * @property {boolean} optional
 * @property {string} type Type expression as written.
 * @property {string} doc Doc comment, whitespace-normalised.
 */

/**
 * Index of the bracket that closes the one opened at `start`.
 * @param {string} text
 * @param {number} start
 * @returns {number}
 */
function matchClose(text, start) {
  const pairs = { "{": "}", "[": "]", "(": ")", "<": ">" };
  const open = text[start];
  const close = /** @type {Record<string, string>} */ (pairs)[open];
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = text.indexOf(c, i + 1);
      if (i < 0) break;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else if (c === "=" && text[i + 1] === ">") {
      i++;
    } else if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  throw new Error(`Unbalanced ${open} in typings`);
}

/**
 * Split on a separator that is not nested in brackets, strings or comments.
 * @param {string} text
 * @param {string} sep One character.
 * @returns {string[]}
 */
function splitTop(text, sep) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      i = text.indexOf(c, i + 1);
      if (i < 0) break;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else if (c === "=" && text[i + 1] === ">") {
      i++;
    } else if ("{[(<".includes(c)) depth++;
    else if ("}])>".includes(c)) depth--;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(last, i));
      last = i + 1;
    }
  }
  parts.push(text.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** @param {string} s */
const normaliseDoc = (s) =>
  s
    .replace(/^\/\*\*|\*\/$/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean)
    .join(" ");

/**
 * Members of an object type body (the text between the braces).
 * @param {string} body
 * @returns {Member[]}
 */
function parseMembers(body) {
  /** @type {Member[]} */
  const members = [];
  for (const raw of splitTop(body, ";")) {
    let text = raw;
    /** @type {string[]} */
    const docs = [];
    for (;;) {
      const m = /^\/\*[\s\S]*?\*\/\s*/.exec(text);
      if (!m) break;
      docs.push(normaliseDoc(m[0].trim()));
      text = text.slice(m[0].length);
    }
    const m = /^(?:readonly\s+)?("?)([\w$]+)\1(\?)?\s*:\s*([\s\S]+)$/.exec(text.trim());
    if (!m) continue;
    members.push({
      name: m[2],
      optional: m[3] === "?",
      type: m[4].replace(/\s+/g, " ").trim(),
      doc: docs.join(" "),
    });
  }
  return members;
}

/**
 * Named type aliases of the typings: name → right-hand side.
 * @param {string} dts
 * @returns {Map<string, string>}
 */
export function parseAliases(dts) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const lines = dts.split("\n");
  /** @type {string | null} */
  let name = null;
  /** @type {string[]} */
  let buf = [];
  const flush = () => {
    if (name !== null) out.set(name, buf.join("\n").replace(/;\s*$/, "").trim());
    name = null;
    buf = [];
  };
  for (const line of lines) {
    const start = /^(?:export )?type (\w+)(?:<[^=]*>)? = ?(.*)$/.exec(line);
    if (start) {
      flush();
      name = start[1];
      buf = [start[2]];
    } else if (/^(?:\/\*\*| \*|\*\/|export |declare |import )/.test(line)) {
      // A top-level doc comment or another statement ends the alias. Members
      // are indented, and so are their own doc comments.
      flush();
    } else if (name !== null) buf.push(line);
  }
  flush();
  return out;
}

/**
 * Properties of an object-like type alias, resolving `A & B`, `Readonly<…>`
 * and `Merge<A, { … }>`. Returns `null` for unions and other non-object types.
 * @param {Map<string, string>} aliases
 * @param {string} name
 * @param {Set<string>} [seen]
 * @returns {Map<string, Member> | null}
 */
export function resolveObject(aliases, name, seen = new Set()) {
  const expr = aliases.get(name);
  if (expr === undefined || seen.has(name)) return null;
  seen.add(name);
  return resolveExpr(aliases, expr, seen);
}

/**
 * @param {Map<string, string>} aliases
 * @param {string} expr
 * @param {Set<string>} seen
 * @returns {Map<string, Member> | null}
 */
function resolveExpr(aliases, expr, seen) {
  if (splitTop(expr, "|").length > 1) return null;
  /** @type {Map<string, Member>} */
  const props = new Map();
  let found = false;
  for (const part of splitTop(expr, "&")) {
    let inner = part;
    const wrapper = /^(Readonly|Merge)</.exec(inner);
    if (wrapper) {
      const args = splitTop(
        inner.slice(wrapper[0].length, matchClose(inner, wrapper[0].length - 1)),
        ",",
      );
      const parts = args.map((a) => resolveExpr(aliases, a, new Set(seen)));
      for (const p of parts) if (p) for (const [k, v] of p) props.set(k, v);
      found ||= parts.some(Boolean);
      continue;
    }
    if (inner.startsWith("{")) {
      for (const m of parseMembers(inner.slice(1, matchClose(inner, 0)))) props.set(m.name, m);
      found = true;
      continue;
    }
    inner = inner.trim();
    if (/^\w+$/.test(inner) && aliases.has(inner)) {
      const sub = resolveObject(aliases, inner, new Set(seen));
      if (sub) {
        for (const [k, v] of sub) props.set(k, v);
        found = true;
      }
    }
  }
  return found ? props : null;
}

/**
 * String literals of a type expression (`"a" | "b"` → `["a", "b"]`).
 * @param {string} type
 * @returns {string[]}
 */
export function literals(type) {
  return [...type.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/**
 * @typedef {object} ElementSpec
 * @property {string} type Element type literal.
 * @property {Member[]} fields All fields, base fields first.
 */

/**
 * @typedef {object} Spec
 * @property {Member[]} base Fields every element has.
 * @property {ElementSpec[]} elements Per-type fields (base fields included).
 * @property {Map<string, string[]>} enums String-literal enumerations by alias name.
 * @property {Map<string, Member[]>} objects Small helper object types (bindings, …).
 */

/**
 * Derive the element specification from the typings.
 * @param {string} dts Text of `types.d.ts`.
 * @returns {Spec}
 */
export function parseSpec(dts) {
  const aliases = parseAliases(dts);
  const baseProps = resolveObject(aliases, "_ExcalidrawElementBase");
  if (!baseProps) throw new Error("Typings do not define _ExcalidrawElementBase");
  /** @type {Map<string, Map<string, Member>>} */
  const byType = new Map();
  for (const name of aliases.keys()) {
    if (!/^Excalidraw\w*Element$/.test(name)) continue;
    const props = resolveObject(aliases, name);
    const type = props?.get("type");
    if (!props || !type) continue;
    for (const lit of literals(type.type)) {
      if (INTERNAL_TYPES.has(lit)) continue;
      const merged = byType.get(lit) ?? new Map();
      for (const [k, v] of props) {
        // A declaration that narrows `type` to one literal must not widen the
        // field list of the other literal it shares a base with.
        if (k === "type") merged.set(k, { ...v, type: `"${lit}"` });
        else merged.set(k, merged.get(k) ?? v);
      }
      byType.set(lit, merged);
    }
  }
  const order = (/** @type {string} */ t) => {
    const i = TYPE_ORDER.indexOf(t);
    return i < 0 ? TYPE_ORDER.length : i;
  };
  const types = [...byType.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
  /** @type {Map<string, string[]>} */
  const enums = new Map();
  for (const [name, expr] of aliases) {
    const alts = splitTop(expr, "|");
    if (alts.length > 1 && alts.every((a) => /^"[^"]*"$/.test(a))) enums.set(name, literals(expr));
  }
  /** @type {Map<string, Member[]>} */
  const objects = new Map();
  for (const name of ["PointBinding", "FixedPointBinding", "BoundElement", "FixedSegment"]) {
    const props = resolveObject(aliases, name);
    if (props) objects.set(name, [...props.values()]);
  }
  return {
    base: [...baseProps.values()],
    elements: types.map((type) => ({
      type,
      fields: [...(byType.get(type) ?? new Map()).values()],
    })),
    enums,
    objects,
  };
}

/**
 * Names of the fields a given element type may carry.
 * @param {Spec} spec
 * @param {string} type
 * @returns {Set<string> | null} `null` for an unknown type.
 */
export function allowedFields(spec, type) {
  const el = spec.elements.find((e) => e.type === type);
  return el ? new Set([...spec.base.map((f) => f.name), ...el.fields.map((f) => f.name)]) : null;
}

/**
 * Read the committed snapshot.
 * @returns {{ spec: Spec, meta: any, constants: any, dts: string }}
 */
export function loadSnapshot() {
  const dts = readFileSync(path.join(SPEC_DIR, "element-types.d.ts.txt"), "utf8");
  const meta = JSON.parse(readFileSync(path.join(SPEC_DIR, "meta.json"), "utf8"));
  const constants = JSON.parse(readFileSync(path.join(SPEC_DIR, "constants.json"), "utf8"));
  return { spec: parseSpec(dts), meta, constants, dts };
}

/** @param {string} s */
const cell = (s) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/**
 * First sentence of a doc comment, capped so the tables stay readable.
 * @param {string} doc
 * @returns {string}
 */
function shortDoc(doc) {
  const first = doc
    .split(/(?<=\.)\s/)[0]
    .replace(/@default\s+\S+/g, "")
    .trim();
  if (first.length <= 140) return first;
  return `${first.slice(0, 137).replace(/\s+\S*$/, "")}...`;
}

/**
 * @param {Member[]} fields
 * @returns {string}
 */
function table(fields) {
  const rows = fields.map(
    (f) =>
      `| \`${f.name}${f.optional ? "?" : ""}\` | \`${cell(f.type)}\` | ${cell(shortDoc(f.doc))} |`,
  );
  return ["| Field | Type | Notes |", "| --- | --- | --- |", ...rows].join("\n");
}

/**
 * Markdown tables for the reference document.
 * @param {Spec} spec
 * @param {any} constants
 * @returns {string}
 */
export function renderTables(spec, constants) {
  const baseNames = new Set(spec.base.map((f) => f.name));
  const out = [
    "## Fields of every element",
    "",
    table(spec.base),
    "",
    "## Element types",
    "",
    `Types: ${spec.elements.map((e) => `\`${e.type}\``).join(", ")}. Fields listed here are in addition to the common fields above.`,
    "",
  ];
  for (const el of spec.elements) {
    const extra = el.fields.filter((f) => !baseNames.has(f.name) && f.name !== "type");
    out.push(
      `### ${el.type}`,
      "",
      extra.length ? table(extra) : "No fields beyond the common ones.",
      "",
    );
  }
  out.push("## Enumerations", "");
  for (const [name, values] of spec.enums) {
    out.push(`- \`${name}\`: ${values.map((v) => `\`${v}\``).join(", ")}`);
  }
  out.push(
    `- \`fontFamily\`: ${Object.entries(constants.fontFamily)
      .map(([k, v]) => `\`${v}\` ${k}`)
      .join(", ")}`,
    `- \`textAlign\`: ${constants.textAlign.map((/** @type {string} */ v) => `\`${v}\``).join(", ")}`,
    `- \`verticalAlign\`: ${constants.verticalAlign.map((/** @type {string} */ v) => `\`${v}\``).join(", ")}`,
    `- \`roundness.type\`: ${Object.entries(constants.roundnessType)
      .map(([k, v]) => `\`${v}\` ${k.toLowerCase().replace(/_/g, " ")}`)
      .join(", ")}`,
    "",
    "## Helper objects",
    "",
  );
  for (const [name, fields] of spec.objects) out.push(`### ${name}`, "", table(fields), "");
  return out.join("\n");
}
