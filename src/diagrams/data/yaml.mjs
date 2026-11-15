/**
 * Small, safe YAML subset parser for `@startyaml`: block mappings and
 * sequences, flow collections, quoted/plain scalars, comments and block
 * scalars (`|`, `>`). No tags, anchors or custom types are evaluated.
 * @module diagrams/data/yaml
 */

import { ParseError } from "../../core/errors.mjs";

/** @typedef {null | boolean | number | string | any[] | Record<string, any>} YamlValue */

/**
 * @param {string} text
 * @returns {YamlValue}
 */
export function parseYaml(text) {
  const lines = text
    .split(/\r?\n/)
    .map((raw, i) => ({
      raw,
      no: i + 1,
      indent: raw.length - raw.trimStart().length,
      text: stripComment(raw).trimEnd(),
    }))
    .filter((l) => l.text.trim() !== "" && l.text.trim() !== "---" && l.text.trim() !== "...");
  let pos = 0;

  /** @param {number} indent @returns {YamlValue} */
  const block = (indent) => {
    const first = lines[pos];
    if (!first) return null;
    if (first.text.trim().startsWith("- ") || first.text.trim() === "-")
      return sequence(first.indent);
    return mapping(first.indent);
    void indent;
  };

  /** @param {number} indent */
  const sequence = (indent) => {
    /** @type {YamlValue[]} */
    const out = [];
    while (
      pos < lines.length &&
      lines[pos].indent === indent &&
      /^-(\s|$)/.test(lines[pos].text.trim())
    ) {
      const l = lines[pos];
      const rest = l.text.trim().slice(1).trim();
      if (!rest) {
        pos++;
        out.push(
          pos < lines.length && lines[pos].indent > indent ? block(lines[pos].indent) : null,
        );
      } else if (/^[^"'{[][^:]*:(\s|$)/.test(rest) || /^["'][^"']*["']\s*:(\s|$)/.test(rest)) {
        // "- key: value" starts an inline mapping
        const inner =
          l.indent +
          (l.text.length - l.text.trimStart().length - l.indent) +
          l.text.trim().indexOf(rest);
        lines[pos] = { ...l, indent: inner, text: " ".repeat(inner) + rest };
        out.push(mapping(inner));
      } else {
        pos++;
        out.push(scalarOrBlock(rest, indent));
      }
    }
    return out;
  };

  /** @param {number} indent */
  const mapping = (indent) => {
    /** @type {{ [key: string]: YamlValue }} */
    const out = Object.create(null);
    while (pos < lines.length && lines[pos].indent === indent) {
      const l = lines[pos];
      const m = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*)|\s*)$/.exec(l.text.trim());
      if (!m) throw new ParseError(`Invalid YAML mapping entry`, { line: l.no });
      const key = unquoteScalar(m[1]);
      pos++;
      const rest = (m[2] ?? "").trim();
      if (!rest) {
        if (pos < lines.length && lines[pos].indent > indent) out[key] = block(lines[pos].indent);
        else if (
          pos < lines.length &&
          lines[pos].indent === indent &&
          /^-(\s|$)/.test(lines[pos].text.trim())
        )
          out[key] = sequence(indent);
        else out[key] = null;
      } else out[key] = scalarOrBlock(rest, indent);
    }
    return out;
  };

  /** @param {string} rest @param {number} indent @returns {YamlValue} */
  const scalarOrBlock = (rest, indent) => {
    if (/^[|>][+-]?$/.test(rest)) {
      /** @type {string[]} */
      const body = [];
      while (pos < lines.length && lines[pos].indent > indent) body.push(lines[pos++].raw.trim());
      return rest.startsWith("|") ? body.join("\n") : body.join(" ");
    }
    if (rest.startsWith("[") || rest.startsWith("{")) return flow(rest);
    return scalar(rest);
  };

  return block(0);
}

/** @param {string} line */
function stripComment(line) {
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/** @param {string} s */
function unquoteScalar(s) {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/**
 * @param {string} s
 * @returns {YamlValue}
 */
function scalar(s) {
  const t = s.trim();
  if (/^["']/.test(t)) return unquoteScalar(t);
  if (/^(null|~)$/i.test(t)) return null;
  if (/^(true|yes|on)$/i.test(t)) return true;
  if (/^(false|no|off)$/i.test(t)) return false;
  if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t)) return Number(t);
  return t;
}

/**
 * Flow collections `[a, b]` / `{a: 1}`.
 * @param {string} s
 * @returns {YamlValue}
 */
function flow(s) {
  let i = 0;
  /** @returns {YamlValue} */
  const value = () => {
    while (s[i] === " ") i++;
    if (s[i] === "[") {
      i++;
      /** @type {YamlValue[]} */
      const arr = [];
      while (i < s.length && s[i] !== "]") {
        arr.push(value());
        while (s[i] === " " || s[i] === ",") i++;
      }
      i++;
      return arr;
    }
    if (s[i] === "{") {
      i++;
      /** @type {{ [key: string]: YamlValue }} */
      const obj = Object.create(null);
      while (i < s.length && s[i] !== "}") {
        while (s[i] === " " || s[i] === ",") i++;
        if (s[i] === "}") break;
        let j = i;
        while (j < s.length && s[j] !== ":" && s[j] !== "}") j++;
        const key = unquoteScalar(s.slice(i, j));
        i = j + 1;
        obj[key] = value();
        while (s[i] === " " || s[i] === ",") i++;
      }
      i++;
      return obj;
    }
    let j = i;
    let quote = "";
    while (j < s.length) {
      const c = s[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "," || c === "]" || c === "}") break;
      j++;
    }
    const tok = s.slice(i, j);
    i = j;
    return scalar(tok);
  };
  return value();
}
