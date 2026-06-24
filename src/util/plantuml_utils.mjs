// Shared helpers used by the parser engine and all plugins.
//
// Keeping these here lets each plugin file stay tiny and self-contained;
// adding a new plugin never forces a change to the engine.

/**
 * Matches a PlantUML stereotype like `<<service>>`. Capturing group 1
 * yields the unwrapped tag.
 * @public
 */
export const STEREOTYPE = /<<\s*([^>]+?)\s*>>/;

/**
 * Matches a top-level `title …` line. Capturing group 1 yields the
 * raw title text (still possibly quoted).
 * @public
 */
export const TITLE_LINE = /^title\s+(.+)$/;

/**
 * Lines we always silently skip. Plugins can extend this via the
 * engine's `skip` array if needed.
 * @public
 */
export const ALWAYS_SKIP = [
  /^@start[a-z0-9_]*\b/i,
  /^@end[a-z0-9_]*\b/i,
  /^!/,
  /^scale\b/i,
  /^zoom\b/i,
  /^page\b/i,
  /^split\b/i,
];

/**
 * Strip a trailing PlantUML line comment (`'…`), preserving any `'`
 * that appears inside a string literal.
 *
 * @param {string} line Raw input line, possibly containing a `'…` comment.
 * @returns {string} The line with the comment removed (empty string if the entire line is a comment).
 * @public
 */
export function stripComment(line) {
  // PlantUML: `'` starts a line comment, but inside a `"..."` string
  // literal the apostrophe is just a regular character. Walk the line
  // tracking quote state so labels like `"Bob 's service"` survive.
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === "'") {
      if (i === 0) return "";
      const prev = line[i - 1];
      if (/\s/.test(prev)) return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Strip PlantUML block comments (`/' ... '/`) across a full source.
 *
 * Block comment markers are recognized only outside double-quoted string
 * literals. Unterminated block comments consume the rest of the source, which
 * matches PlantUML's comment intent and keeps strict parsing from interpreting
 * commented attacker-controlled text as active syntax.
 *
 * @param {string[]} lines Raw, line-split PlantUML source.
 * @returns {string[]} New line array with block-comment contents removed.
 * @public
 */
export function stripBlockComments(lines) {
  /** @type {string[]} */
  const out = [];
  let inBlockComment = false;

  for (const raw of lines) {
    let line = "";
    let inQuotes = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const next = raw[i + 1];

      if (inBlockComment) {
        if (ch === "'" && next === "/") {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = !inQuotes;
        line += ch;
        continue;
      }

      if (!inQuotes && ch === "/" && next === "'") {
        inBlockComment = true;
        i++;
        continue;
      }

      line += ch;
    }

    out.push(line);
  }

  return out;
}

/**
 * Remove a single matching pair of surrounding double quotes.
 *
 * @param {string} s String that may be wrapped in `"…"`.
 * @returns {string} The unwrapped string, or `s` unchanged if not quoted.
 * @public
 */
export function stripQuotes(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/**
 * Convert any string to an identifier-safe slug. Preserves Unicode
 * letters and digits (e.g. `ümlaut`, `日本`) while collapsing every
 * other character to `_`. Falls back to a hashed identifier if the
 * input has no letters/digits at all so that connections never lose
 * their endpoint id.
 *
 * @param {string} s Free-form text to sluggify.
 * @returns {string} Lower-case, underscore-separated identifier.
 * @public
 */
export function slug(s) {
  const raw = String(s).toLowerCase();
  const cleaned = raw.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
  if (cleaned) return cleaned;
  // No letters/digits at all – derive a stable fallback so that
  // `[***]` and similar still produce a usable id.
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `id_${(h >>> 0).toString(36)}`;
}

/**
 * Replace the literal escape sequence `\n` in a label with a real
 * newline. Tolerates `null` / `undefined`.
 *
 * @param {string|null|undefined} s Raw label as it appears in the PlantUML source.
 * @returns {string} Label with `\n` expanded to real line breaks.
 * @public
 */
export function unescapeLabel(s) {
  return String(s ?? "").replace(/\\n/g, "\n");
}

/**
 * Convert PlantUML Creole and legacy HTML-like text to safe readable
 * plain text. This intentionally does not preserve rich styling; it keeps
 * the visible content deterministic for Excalidraw/SVG/PNG while stripping
 * known formatting tags and notation.
 *
 * @param {string|null|undefined} value Raw PlantUML text.
 * @returns {string} Plain display text.
 * @public
 */
export function normalisePlantUmlText(value) {
  let text = unescapeLabel(value);
  text = decodePlantUmlUnicode(text);
  text = text.replace(/<:([#\w-]+:)?([a-z0-9_+-]+):>/gi, ":$2:");
  text = text.replace(/<&([a-z0-9_+-]+)>/gi, "$1");
  text = text.replace(/<\/?(?:b|i|u|s|w|plain|code)\b[^>]*>/gi, "");
  text = text.replace(/<\/?(?:color|back|size|font)\b(?::[^>]*)?>/gi, "");
  text = text.replace(/<\/?(?:script|style|img|svg|text)\b[^>]*>/gi, "");
  text = text.replace(/\{scale[:=][^}]+}/gi, "");
  text = text.replace(/(^|\n)\s*(={1,6})\s*([^\n=].*?)(?:\s*\2)?(?=\n|$)/g, "$1$3");
  text = text.replace(/(^|\n)([ \t]*)([*#]+)\s+/g, (_m, br, indent, marker) => {
    const depth = Math.max(0, marker.length - 1);
    return `${br}${indent}${"  ".repeat(depth)}- `;
  });
  text = text.replace(/(^|\n)([ \t]*)\|_\s*/g, "$1$2- ");
  text = text
    .split("\n")
    .map((line) => normalisePlantUmlTextLine(line))
    .join("\n");
  text = text.replace(/~([*_/"'`~\\\-[\]{}<>|#=:])/g, "$1");
  for (let i = 0; i < 4; i++) {
    const next = text
      .replace(/\*\*([^*\n](?:.*?[^*])?)\*\*/g, "$1")
      .replace(/\/\/([^/\n](?:.*?[^/])?)\/\//g, "$1")
      .replace(/""([^"\n](?:.*?[^"])?)""/g, "$1")
      .replace(/--([^\n-](?:.*?[^\n-])?)--/g, "$1")
      .replace(/__([^_\n](?:.*?[^_])?)__/g, "$1")
      .replace(/~~([^~\n](?:.*?[^~])?)~~/g, "$1");
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * @param {string} line
 * @returns {string}
 */
function normalisePlantUmlTextLine(line) {
  const trimmed = line.trim();
  if (/^(?:-{4,}|={4,}|_{4,})$/.test(trimmed)) return "";
  const titledLine = trimmed.match(/^(?:={2,}|-{2,}|_{2,}|\.\.)(.*?)(?:={2,}|-{2,}|_{2,}|\.\.)$/);
  if (titledLine && titledLine[1].trim()) return titledLine[1].trim();
  if (!/^\s*(?:<#[^>]+>)?\|/i.test(line)) {
    return line;
  }
  return line
    .split("|")
    .map((cell) =>
      cell
        .trim()
        .replace(/^<#[^>]+>/i, "")
        .replace(/^=/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" | ");
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodePlantUmlUnicode(text) {
  return text
    .replace(/<U\+([0-9a-f]{1,6})>/gi, (_m, hex) => codePointToString(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => codePointToString(Number.parseInt(dec, 10)));
}

/**
 * @param {number} codePoint
 * @returns {string}
 */
function codePointToString(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return "";
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return "";
  }
}

/**
 * Extract the first PlantUML link marker from a text label.
 *
 * Supported forms:
 * - `[[https://example.invalid]]`
 * - `[[https://example.invalid Label]]`
 * - `[[https://example.invalid{Tooltip} Label]]`
 * - `[[{Tooltip} Label]]`
 *
 * The returned `text` replaces the marker with its display label while
 * preserving surrounding text. Unsafe URLs are dropped from `link` but kept
 * readable as display text.
 *
 * @param {string|null|undefined} value Raw label text.
 * @returns {{text:string,link:string,tooltip:string}} Plain label plus optional safe link metadata.
 * @public
 */
export function extractPlantUmlLink(value) {
  const source = String(value ?? "");
  const marker = findLinkMarker(source);
  if (!marker) return { text: source, link: "", tooltip: "" };
  const parsed = parseLinkContent(marker.content);
  const display = parsed.label || parsed.href || parsed.tooltip || "";
  return {
    text: `${source.slice(0, marker.start)}${display}${source.slice(marker.end)}`,
    link: sanitizePlantUmlLink(parsed.href),
    tooltip: parsed.tooltip,
  };
}

const PLANTUML_COLOR_NAMES = new Set([
  "antiquewhite",
  "aqua",
  "black",
  "blue",
  "cornflowerblue",
  "darksalmon",
  "deepskyblue",
  "dodgerblue",
  "gold",
  "green",
  "greenyellow",
  "lightblue",
  "lightgray",
  "lightgrey",
  "lightgreen",
  "lightgoldenrodyellow",
  "lightpink",
  "lightyellow",
  "pink",
  "purple",
  "red",
  "wheat",
  "white",
]);

/**
 * Validate the small PlantUML colour token subset this project renders.
 * Allows hex colours and a fixed set of known named colours, with or
 * without PlantUML's optional leading `#` for names.
 *
 * @param {string|null|undefined} value Raw PlantUML colour token.
 * @returns {string} Safe token to store in the model, or empty when denied.
 * @public
 */
export function sanitizePlantUmlColor(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const gradient = splitPlantUmlGradient(raw);
  if (gradient) return sanitizePlantUmlColor(gradient[0]);
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(raw)) return raw;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  const named = raw.replace(/^#/, "").toLowerCase();
  return PLANTUML_COLOR_NAMES.has(named) ? raw : "";
}

/**
 * PlantUML allows gradient fills as two colours separated by a direction
 * marker (`|`, `/`, `\` or `-`). The renderer currently stores a single safe
 * colour, so callers use the first valid stop as a deterministic fallback.
 * Hyphen is ambiguous with named colours; split it only when both sides look
 * like concrete colour tokens.
 * @param {string} raw
 * @returns {[string, string]|null}
 */
function splitPlantUmlGradient(raw) {
  const simple = raw.match(/^(.+?)([|/\\])(.+)$/);
  if (simple) return [simple[1].trim(), simple[3].trim()];
  const hyphen = raw.match(/^([#A-Za-z0-9]+)-([#A-Za-z0-9]+)$/);
  if (!hyphen) return null;
  return [hyphen[1].trim(), hyphen[2].trim()];
}

/**
 * @param {string} source
 * @returns {{start:number,end:number,content:string}|null}
 */
function findLinkMarker(source) {
  const start = source.indexOf("[[");
  if (start < 0) return null;
  const triple = source[start + 2] === "[";
  const openLength = triple ? 3 : 2;
  const close = triple ? "]]]" : "]]";
  const end = source.indexOf(close, start + openLength);
  if (end < 0) return null;
  return {
    start,
    end: end + close.length,
    content: source.slice(start + openLength, end).trim(),
  };
}

/**
 * @param {string} content Link marker body without surrounding brackets.
 * @returns {{href:string,tooltip:string,label:string}}
 */
function parseLinkContent(content) {
  let rest = content.trim();
  let href = "";
  let tooltip = "";

  if (rest.startsWith("{")) {
    const tip = readBalancedBrace(rest, 0);
    if (tip) {
      tooltip = tip.value;
      rest = rest.slice(tip.end).trim();
    }
  } else if (rest.startsWith('"')) {
    const quoted = readQuoted(rest, 0);
    if (quoted) {
      href = quoted.value;
      rest = rest.slice(quoted.end).trim();
    }
  } else {
    let end = 0;
    while (end < rest.length && !/\s/.test(rest[end]) && rest[end] !== "{") end++;
    href = rest.slice(0, end);
    rest = rest.slice(end).trim();
  }

  if (!tooltip && rest.startsWith("{")) {
    const tip = readBalancedBrace(rest, 0);
    if (tip) {
      tooltip = tip.value;
      rest = rest.slice(tip.end).trim();
    }
  }

  return { href, tooltip, label: rest.trim() };
}

/**
 * @param {string} value
 * @param {number} start
 * @returns {{value:string,end:number}|null}
 */
function readQuoted(value, start) {
  if (value[start] !== '"') return null;
  let out = "";
  for (let i = start + 1; i < value.length; i++) {
    if (value[i] === '"' && value[i - 1] !== "\\") return { value: out, end: i + 1 };
    out += value[i];
  }
  return null;
}

/**
 * @param {string} value
 * @param {number} start
 * @returns {{value:string,end:number}|null}
 */
function readBalancedBrace(value, start) {
  if (value[start] !== "{") return null;
  let depth = 0;
  let out = "";
  for (let i = start; i < value.length; i++) {
    const ch = value[i];
    if (ch === "{") {
      if (depth > 0) out += ch;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0) return { value: out, end: i + 1 };
      out += ch;
      continue;
    }
    out += ch;
  }
  return null;
}

/**
 * @param {string} raw Raw URL token.
 * @returns {string} Safe Excalidraw link value, or empty when denied.
 */
function sanitizePlantUmlLink(raw) {
  const href = String(raw || "").trim();
  if (!href) return "";
  let parsed;
  try {
    parsed = new URL(href, "https://plantuml.invalid/");
  } catch {
    return "";
  }
  const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(href);
  if (isRelative) return href;
  return /^(?:https?:|mailto:)$/i.test(parsed.protocol) ? href : "";
}

/**
 * Collect lines for parser block plugins until `endPattern` matches.
 *
 * @param {RegExp} endPattern Regex that recognizes the terminating line.
 * @param {(lines: string[], ctx: any) => void} onEnd Callback invoked with the collected body lines.
 * @returns {{onLine(line: string): void, tryEnd(line: string, ctx: any): boolean}} Parser-engine block handlers.
 * @public
 */
export function collectBlockLines(endPattern, onEnd) {
  /** @type {string[]} */
  const lines = [];
  return {
    onLine(line) {
      lines.push(line);
    },
    tryEnd(line, ctx) {
      if (!endPattern.test(line)) return false;
      onEnd(lines, ctx);
      return true;
    },
  };
}

/**
 * Normalise inline `{ … }` so that `frame "F" as f { [a] [b] }` parses
 * cleanly. Splits each line on `{` and `}` boundaries OUTSIDE quoted
 * strings, then re-attaches a lone `{` to the preceding header line.
 *
 * @param {string[]} lines Raw, already line-split PlantUML source.
 * @returns {string[]} New array with every brace on its own (or attached to its header) line.
 * @public
 */
export function explodeBraces(lines) {
  /** @type {string[]} */
  const out = [];
  for (const raw of lines) {
    let buf = "";
    let inStr = false;
    let inLink = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      const next = raw[i + 1];
      if (c === '"') {
        inStr = !inStr;
        buf += c;
        continue;
      }
      if (!inStr && !inLink && c === "[" && next === "[") {
        inLink = true;
        buf += c;
        continue;
      }
      if (inLink) {
        buf += c;
        if (c === "]" && next === "]") {
          buf += next;
          i++;
          inLink = false;
        }
        continue;
      }
      // Preserve PlantUML class-diagram modifier tags (`{abstract}`,
      // `{static}`, `{field}`, `{method}`, …) as part of the surrounding
      // line. These are written `{word}` and must not be split off as
      // their own brace lines, otherwise members like `+{abstract} foo()`
      // disintegrate.
      if (!inStr && c === "{") {
        const m = raw.slice(i).match(/^\{([A-Za-z_][\w-]*)\}/);
        if (m) {
          buf += m[0];
          i += m[0].length - 1;
          continue;
        }
      }
      if (!inStr && (c === "{" || c === "}")) {
        if (buf.trim()) out.push(buf);
        out.push(c);
        buf = "";
        continue;
      }
      buf += c;
    }
    if (buf.trim() || (!buf && raw === "")) out.push(buf);
  }
  /** @type {string[]} */
  const stitched = [];
  for (const ln of out) {
    if (ln === "{" && stitched.length) {
      const prevIdx = stitched.length - 1;
      /** @type {string} */
      const prev = stitched[prevIdx];
      if (prev && !prev.endsWith("{") && prev.trim() && prev.trim() !== "}") {
        stitched[prevIdx] = `${prev.trimEnd()} {`;
        continue;
      }
    }
    stitched.push(ln);
  }
  return stitched;
}

/**
 * Map a PlantUML shape keyword to the canonical model shape name.
 * Unknown keywords fall back to `"rectangle"`.
 *
 * @param {string} kw PlantUML shape keyword (e.g. `component`, `actor`).
 * @returns {string} One of the canonical model shapes — always defined.
 * @public
 */
export function normaliseShape(kw) {
  switch (kw) {
    case "component":
      return "component";
    case "actor":
      return "actor";
    case "usecase":
      return "usecase";
    case "database":
      return "database";
    case "queue":
      return "queue";
    case "node":
      return "node";
    case "cloud":
      return "cloud";
    case "interface":
    case "protocol":
    case "circle":
      return "interface";
    case "entity":
      return "entity";
    case "class":
    case "annotation":
    case "record":
    case "struct":
    case "exception":
    case "metaclass":
    case "stereotype":
    case "dataclass":
      return "class";
    case "enum":
      return "enum";
    case "rectangle":
    case "artifact":
      return "rectangle";
    case "boundary":
      return "interface";
    case "control":
      return "interface";
    case "agent":
      return "agent";
    case "file":
      return "file";
    case "folder":
      return "folder";
    case "storage":
      return "storage";
    case "card":
      return "card";
    case "hexagon":
      return "hexagon";
    case "stack":
      return "stack";
    case "person":
      return "person";
    case "process":
      return "component";
    case "action":
      return "state";
    case "label":
      return "label";
    case "frame":
      return "frame";
    case "package":
      return "package";
    case "collections":
      return "collections";
    default:
      return "rectangle";
  }
}

/**
 * Decode a PlantUML connection operator (e.g. `-->`, `<|--`, `o--`)
 * into its structural fields: kind, dashed-ness, reversed direction
 * and start/end arrowhead. Returns `null` if the operator is not
 * recognised.
 *
 * @param {string} op Raw arrow operator as it appears between two endpoints.
 * @returns {{
 *   kind: "default"|"dependency"|"inheritance"|"realization"|"composition"|"aggregation",
 *   dashed: boolean,
 *   reversed: boolean,
 *   startArrowhead: string|null,
 *   endArrowhead:   string|null,
 *   directionHint:  string|null,
 *   hidden?: boolean,
 * } | null} Structural breakdown of the operator, or `null` when unrecognised.
 * @public
 */
export function classifyArrow(op) {
  const styleText = [...op.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1])
    .join(",")
    .toLowerCase();
  op = op.replace(/\[[^\]]+\]/g, "");
  let directionHint = null;
  const dirMatch = op.match(/-(up|down|left|right)-/i);
  if (dirMatch) {
    directionHint = dirMatch[1].toLowerCase();
    op = op.replace(/-(?:up|down|left|right)-/i, "--");
  }

  const bidir = /<.*>/.test(op);
  const startsWithLeft = op.startsWith("<");
  const endsWithRight = op.endsWith(">");
  const reversed = startsWithLeft && !endsWithRight;
  const dashed = op.includes(".") || /(?:^|,)dashed(?:,|$)/.test(styleText);
  const hidden = /(?:^|,)hidden(?:,|$)/.test(styleText);

  if (op.includes("|>") || op.includes("<|")) {
    return {
      kind: dashed ? "realization" : "inheritance",
      dashed,
      reversed: op.includes("<|") && !op.includes("|>"),
      startArrowhead: null,
      endArrowhead: "triangle_outline",
      directionHint,
      hidden,
    };
  }
  if (op.startsWith("*") || op.endsWith("*")) {
    return {
      kind: "composition",
      dashed,
      reversed: op.endsWith("*"),
      startArrowhead: "diamond",
      endArrowhead: null,
      directionHint,
      hidden,
    };
  }
  if (op.startsWith("o") || op.endsWith("o")) {
    return {
      kind: "aggregation",
      dashed,
      reversed: op.endsWith("o"),
      startArrowhead: "diamond_outline",
      endArrowhead: null,
      directionHint,
      hidden,
    };
  }
  if (!/[-.]/.test(op)) return null;

  return {
    kind: dashed ? "dependency" : "default",
    dashed,
    reversed,
    startArrowhead: bidir ? "arrow" : null,
    endArrowhead: endsWithRight || bidir ? "arrow" : reversed ? null : "arrow",
    directionHint,
    hidden,
  };
}
