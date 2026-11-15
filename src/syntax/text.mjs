/**
 * Quote- and bracket-aware string helpers shared by all diagram parsers.
 * Scanner-style implementations avoid regex backtracking on hostile input.
 * @module syntax/text
 */

/**
 * Remove one pair of surrounding double quotes (or single quotes).
 * @param {string} s
 * @returns {string}
 */
export function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Convert PlantUML label escapes into real text: `\n`, `\t`, `%n()`,
 * `<br>`, `\\` and `\"`. Leaves creole markup untouched.
 * @param {string} s
 * @returns {string}
 */
export function unescapeLabel(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      const n = s[i + 1];
      if (n === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (n === "t") {
        out += "\t";
        i++;
        continue;
      }
      if (n === "l" || n === "r") {
        out += "\n";
        i++;
        continue;
      }
      if (n === "\\" || n === '"') {
        out += n;
        i++;
        continue;
      }
    }
    out += c;
  }
  return out.replace(/%n\(\)/g, "\n").replace(/<br\s*\/?>/gi, "\n");
}

/**
 * Normalise a label: unquote then unescape.
 * @param {string | null | undefined} s
 * @returns {string}
 */
export function label(s) {
  if (s === null || s === undefined) return "";
  return unescapeLabel(unquote(s));
}

/**
 * Split on a separator outside of quotes and brackets.
 * @param {string} text
 * @param {string} sep Single character separator.
 * @returns {string[]}
 */
export function splitTopLevel(text, sep) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "(" || c === "[" || c === "{" || c === "<") depth++;
    else if ((c === ")" || c === "]" || c === "}" || c === ">") && depth > 0) depth--;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Index of the first unquoted occurrence of `needle`, or -1.
 * @param {string} text
 * @param {string} needle
 * @param {number} [from]
 * @returns {number}
 */
export function indexOfUnquoted(text, needle, from = 0) {
  let quoted = false;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && text.startsWith(needle, i)) return i;
  }
  return -1;
}

/**
 * Split `text : label` on the first unquoted colon that is not part of `::`.
 * @param {string} text
 * @returns {[string, string | null]}
 */
export function splitLabel(text) {
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === "[" || c === "(") depth++;
    else if ((c === "]" || c === ")") && depth > 0) depth--;
    else if (c === ":" && depth === 0 && text[i + 1] !== ":" && text[i - 1] !== ":") {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  return [text.trim(), null];
}

/**
 * Extract and remove `<<stereotype>>` groups. Returns the remaining text and
 * the list of stereotypes (a spot like `(C,#red)` is kept in the stereotype).
 * @param {string} text
 * @returns {{ rest: string, stereotypes: string[] }}
 */
export function takeStereotypes(text) {
  /** @type {string[]} */
  const stereotypes = [];
  let rest = "";
  let i = 0;
  while (i < text.length) {
    const open = indexOfUnquoted(text, "<<", i);
    if (open < 0) {
      rest += text.slice(i);
      break;
    }
    const close = text.indexOf(">>", open + 2);
    if (close < 0) {
      rest += text.slice(i);
      break;
    }
    rest += text.slice(i, open);
    stereotypes.push(text.slice(open + 2, close).trim());
    i = close + 2;
  }
  return { rest: rest.replace(/\s+/g, " ").trim(), stereotypes };
}

/**
 * Take a trailing (or anywhere) colour token `#xxx` / `#a;line:b` outside quotes.
 * @param {string} text
 * @returns {{ rest: string, color: string | null }}
 */
export function takeColor(text) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === "#" && (i === 0 || /\s/.test(text[i - 1]))) {
      let j = i;
      while (j < text.length && !/\s/.test(text[j]) && text[j] !== "{") j++;
      return { rest: (text.slice(0, i) + text.slice(j)).trim(), color: text.slice(i, j) };
    }
  }
  return { rest: text.trim(), color: null };
}

/**
 * Make a stable identifier from free text (used for implicit ids).
 * @param {string} text
 * @returns {string}
 */
export function slug(text) {
  return text.replace(/\s+/g, "_");
}

/**
 * Remove a trailing `{` (block opener) and report whether it was present.
 * @param {string} text
 * @returns {{ rest: string, opens: boolean }}
 */
export function takeBlockOpen(text) {
  const t = text.trimEnd();
  if (t.endsWith("{") && indexOfUnquoted(t, "{") === t.length - 1) {
    return { rest: t.slice(0, -1).trimEnd(), opens: true };
  }
  return { rest: t, opens: false };
}

/**
 * Truncate overly long labels to the configured limit.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function clampText(text, max) {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
