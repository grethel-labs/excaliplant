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
  /^@startuml/,
  /^@enduml/,
  /^!/,
  /^hide\s+(?!(?:footbox|unlinked)\b)/i,
  /^show\s/,
  /^scale\s/,
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
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === '"') {
        inStr = !inStr;
        buf += c;
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
    case "node":
      return "node";
    case "cloud":
      return "cloud";
    case "interface":
      return "interface";
    case "entity":
      return "entity";
    case "class":
      return "class";
    case "enum":
      return "enum";
    case "rectangle":
      return "rectangle";
    case "boundary":
      return "interface";
    case "control":
      return "interface";
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
 * } | null} Structural breakdown of the operator, or `null` when unrecognised.
 * @public
 */
export function classifyArrow(op) {
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
  const dashed = op.includes(".");

  if (op.includes("|>") || op.includes("<|")) {
    return {
      kind: dashed ? "realization" : "inheritance",
      dashed,
      reversed: op.includes("<|") && !op.includes("|>"),
      startArrowhead: null,
      endArrowhead: "triangle_outline",
      directionHint,
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
  };
}
