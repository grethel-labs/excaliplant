/**
 * Markdown scanner: finds fenced PlantUML code blocks and already rendered
 * excaliplant regions. A single linear pass over the lines; nothing here uses
 * backtracking regexes on document-sized input.
 * @module markdown/scan
 */

/** Info-string languages that denote PlantUML. */
export const PLANTUML_LANGS = Object.freeze(["plantuml", "puml", "uml"]);

/**
 * Attributes parsed from a fence info string (theme, clean, seed, width, alt, src).
 * @typedef {object} FenceAttrs
 * @property {string} [theme]
 * @property {boolean} [clean]
 * @property {string} [seed]
 * @property {number} [width]
 * @property {string} [alt]
 * @property {string} [src] Relative path to a PlantUML source file for document rendering.
 */

/**
 * A fenced PlantUML block.
 * @typedef {object} FenceBlock
 * @property {"fence"} kind
 * @property {string} lang Lower-cased language (`plantuml`, `puml` or `uml`).
 * @property {string} source Content of the fence, without the fence lines.
 * @property {number} start Offset of the first character of the opening fence line.
 * @property {number} end Offset just after the closing fence (before its line break).
 * @property {string} fence The opening fence run (backticks or tildes).
 * @property {string} info Raw info string after the fence (trimmed).
 * @property {FenceAttrs} attrs Parsed attributes.
 * @property {number} line 1-based line of the opening fence.
 */

/**
 * A block that was rendered earlier with `keepSource` (marker comments).
 * @typedef {object} Region
 * @property {"region"} kind
 * @property {string} lang
 * @property {string} source Decoded source text.
 * @property {number} start
 * @property {number} end
 * @property {string} fence Always the empty string.
 * @property {string} info Decoded info string of the original fence.
 * @property {FenceAttrs} attrs
 * @property {number} line
 * @property {string} hash Hash stored in the begin marker.
 */

/** @typedef {FenceBlock | Region} ScanItem */

export const BEGIN_PREFIX = "<!-- excaliplant:begin";
export const END_MARKER = "<!-- excaliplant:end -->";
export const SOURCE_PREFIX = "<!-- excaliplant:source";

const MAX_ALT = 300;
const MAX_WIDTH = 16_000;

/** @param {string} c */
const isWs = (c) => c === " " || c === "\t";

/**
 * Parse the attribute part of an info string.
 * @param {string} rest Text after the language token.
 * @returns {FenceAttrs}
 */
export function parseAttrs(rest) {
  /** @type {FenceAttrs} */
  const attrs = {};
  let i = 0;
  const n = Math.min(rest.length, 2000);
  /** @param {string} c */
  const sep = (c) => isWs(c) || c === "{" || c === "}" || c === ",";
  while (i < n) {
    while (i < n && sep(rest[i])) i++;
    if (i >= n) break;
    const ks = i;
    while (i < n && !sep(rest[i]) && rest[i] !== "=") i++;
    const key = rest.slice(ks, i).toLowerCase();
    let value = /** @type {string | null} */ (null);
    if (rest[i] === "=") {
      i++;
      const q = rest[i];
      if (q === '"' || q === "'") {
        const close = rest.indexOf(q, i + 1);
        const stop = close < 0 ? rest.length : close;
        value = rest.slice(i + 1, stop);
        i = stop + 1;
      } else {
        const vs = i;
        while (i < n && !sep(rest[i])) i++;
        value = rest.slice(vs, i);
      }
    }
    switch (key) {
      case "theme":
        if (value) attrs.theme = value.slice(0, 32);
        break;
      case "clean":
        attrs.clean = value === null ? true : !["false", "0", "no", "off"].includes(value);
        break;
      case "seed":
        if (value) attrs.seed = value.slice(0, 64);
        break;
      case "src":
        attrs.src = value && value.length <= 1000 ? value : "";
        break;
      case "width": {
        const w = Number(value);
        if (value && Number.isFinite(w))
          attrs.width = Math.min(MAX_WIDTH, Math.max(16, Math.round(w)));
        break;
      }
      case "alt":
        if (value) {
          let alt = "";
          for (const ch of value.slice(0, MAX_ALT)) if (ch.charCodeAt(0) >= 0x20) alt += ch;
          if (alt) attrs.alt = alt;
        }
        break;
      default:
        break;
    }
  }
  return attrs;
}

/**
 * Split an info string into language and attributes.
 * @param {string} info
 * @returns {{ lang: string, attrs: FenceAttrs } | null} `null` when the language is not PlantUML.
 */
export function parseInfo(info) {
  const text = String(info ?? "").trim();
  let i = 0;
  while (i < text.length && !isWs(text[i]) && text[i] !== "{") i++;
  const lang = text.slice(0, i).toLowerCase();
  if (!PLANTUML_LANGS.includes(lang)) return null;
  return { lang, attrs: parseAttrs(text.slice(i)) };
}

/**
 * Make text safe inside an HTML comment: runs of `-` are percent-escaped so
 * `-->`, `--!>` and `<!--` can never occur; a literal `%25`/`%2D` is protected.
 * @param {string} text
 * @returns {string}
 */
export function encodeComment(text) {
  let out = "";
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (c === "-") {
      out += text[i - 1] === "-" || text[i + 1] === "-" ? "%2D" : "-";
    } else if (c === "%") {
      const next = text.slice(i + 1, i + 3);
      out += next === "25" || next === "2D" ? "%25" : "%";
    } else out += c;
  }
  return out;
}

/**
 * Inverse of {@link encodeComment}.
 * @param {string} text
 * @returns {string}
 */
export function decodeComment(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "%") {
      const next = text.slice(i + 1, i + 3);
      if (next === "25") {
        out += "%";
        i += 2;
        continue;
      }
      if (next === "2D") {
        out += "-";
        i += 2;
        continue;
      }
    }
    out += text[i];
  }
  return out;
}

/**
 * Parse `<!-- excaliplant:begin hash=abc -->`.
 * @param {string} line
 * @returns {string | null} The hash, or `null` when the line is not a begin marker.
 */
function parseBegin(line) {
  if (!line.startsWith(BEGIN_PREFIX) || !line.endsWith("-->")) return null;
  const mid = line.slice(BEGIN_PREFIX.length, line.length - 3).trim();
  if (!mid.startsWith("hash=")) return null;
  const hash = mid.slice(5);
  for (let i = 0; i < hash.length; i++) {
    const c = hash[i];
    if (!((c >= "0" && c <= "9") || (c >= "a" && c <= "f"))) return null;
  }
  return hash.length >= 8 && hash.length <= 64 ? hash : null;
}

/**
 * Count leading spaces (max 4 inspected).
 * @param {string} line
 */
function indentOf(line) {
  let n = 0;
  while (n < 4 && line[n] === " ") n++;
  return n;
}

/**
 * Scan a Markdown document.
 * @param {string} markdown
 * @returns {ScanItem[]} Fences and regions in document order.
 */
export function scanMarkdown(markdown) {
  /** @type {ScanItem[]} */
  const items = [];
  const n = markdown.length;
  /** @type {{ line: string, start: number, end: number, next: number }[]} */
  const lines = [];
  for (let pos = 0; pos <= n;) {
    const nl = markdown.indexOf("\n", pos);
    const lineEnd = nl < 0 ? n : nl;
    const contentEnd = lineEnd > pos && markdown[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
    lines.push({
      line: markdown.slice(pos, contentEnd),
      start: pos,
      end: contentEnd,
      next: nl < 0 ? n + 1 : nl + 1,
    });
    if (nl < 0) break;
    pos = nl + 1;
  }
  // A trailing line break yields an empty last "line"; harmless for the scan.

  /** @type {{ char: string, len: number, indent: number, info: string, startLine: number, content: string[] } | null} */
  let open = null;
  let regionsPossible = true;
  for (let li = 0; li < lines.length; li++) {
    const { line } = lines[li];
    const indent = indentOf(line);
    if (open) {
      if (indent <= 3) {
        const t = line.slice(indent);
        let k = 0;
        while (t[k] === open.char) k++;
        if (k >= open.len) {
          let rest = k;
          while (rest < t.length && isWs(t[rest])) rest++;
          if (rest === t.length) {
            const parsed = parseInfo(open.info);
            if (parsed) {
              items.push({
                kind: "fence",
                lang: parsed.lang,
                source: open.content.join("\n"),
                start: lines[open.startLine].start,
                end: lines[li].end,
                fence: open.char.repeat(open.len),
                info: open.info,
                attrs: parsed.attrs,
                line: open.startLine + 1,
              });
            }
            open = null;
            continue;
          }
        }
      }
      // Content line: strip up to the opening fence's indentation.
      let strip = 0;
      while (strip < open.indent && line[strip] === " ") strip++;
      open.content.push(line.slice(strip));
      continue;
    }
    if (indent <= 3) {
      const t = line.slice(indent);
      const ch = t[0];
      if (ch === "`" || ch === "~") {
        let k = 0;
        while (t[k] === ch) k++;
        const info = t.slice(k).trim();
        if (k >= 3 && !(ch === "`" && info.includes("`"))) {
          open = { char: ch, len: k, indent, info, startLine: li, content: [] };
          continue;
        }
      } else if (regionsPossible && ch === "<") {
        const hash = parseBegin(t.trimEnd());
        if (hash) {
          const region = scanRegion(lines, li, hash);
          if (region === "none") regionsPossible = false;
          else if (region) {
            items.push(region.item);
            li = region.lastLine;
          }
        }
      }
    }
  }
  return items;
}

/**
 * @param {{ line: string, start: number, end: number }[]} lines
 * @param {number} from Index of the begin marker line.
 * @param {string} hash
 * @returns {{ item: Region, lastLine: number } | "none" | null} `"none"` when no later
 *   region can be complete either (the scan hit the end of the document).
 */
function scanRegion(lines, from, hash) {
  let li = from + 1;
  const first = lines[li]?.line.trimEnd();
  if (first === undefined || !first.startsWith(SOURCE_PREFIX)) return null;
  const infoText = first.slice(SOURCE_PREFIX.length);
  if (infoText !== "" && !infoText.startsWith(" ")) return null;
  const info = decodeComment(infoText.trim());
  /** @type {string[]} */
  const src = [];
  li++;
  let closed = false;
  for (; li < lines.length; li++) {
    if (lines[li].line.trimEnd() === "-->") {
      closed = true;
      break;
    }
    src.push(lines[li].line);
  }
  if (!closed) return "none";
  let endLine = -1;
  for (let k = li + 1; k < lines.length; k++) {
    if (lines[k].line.trim() === END_MARKER) {
      endLine = k;
      break;
    }
  }
  if (endLine < 0) return "none";
  const parsed = parseInfo(info) ?? { lang: "plantuml", attrs: {} };
  return {
    item: {
      kind: "region",
      lang: parsed.lang,
      source: decodeComment(src.join("\n")),
      start: lines[from].start,
      end: lines[endLine].end,
      fence: "",
      info,
      attrs: parsed.attrs,
      line: from + 1,
      hash,
    },
    lastLine: endLine,
  };
}

/**
 * Find fenced PlantUML code blocks (` ``` ` or `~~~` fences with the language
 * `plantuml`, `puml` or `uml`, case-insensitive).
 *
 * Follows CommonMark fence rules: up to three spaces of indentation, closing
 * fences must use the same character and be at least as long, fences inside
 * other fences (e.g. a `markdown` example) are ignored, and unclosed fences
 * are skipped. Blocks inside regions written by `renderMarkdown` with
 * `keepSource` are not reported.
 * @param {string} markdown
 * @returns {FenceBlock[]}
 * @public
 */
export function extractBlocks(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Markdown must be a string");
  return /** @type {FenceBlock[]} */ (scanMarkdown(markdown).filter((i) => i.kind === "fence"));
}
