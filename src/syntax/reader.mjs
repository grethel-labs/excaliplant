/**
 * Line cursor used by every diagram parser. Parsers pull lines one at a time
 * and may read nested blocks themselves, which keeps block handling local to
 * the rule that understands it.
 * @module syntax/reader
 */

/** @typedef {import("../core/source.mjs").SourceLine} SourceLine */

/** @public */
export class LineReader {
  /** @param {SourceLine[]} lines */
  constructor(lines) {
    this.lines = lines;
    this.pos = 0;
  }

  /** @returns {boolean} */
  get done() {
    return this.pos >= this.lines.length;
  }

  /** @returns {SourceLine | undefined} */
  peek() {
    return this.lines[this.pos];
  }

  /** @returns {SourceLine} */
  next() {
    return this.lines[this.pos++];
  }

  /**
   * Read lines until one matches `end` (consumed, not returned).
   * @param {RegExp} end
   * @returns {SourceLine[]}
   */
  until(end) {
    /** @type {SourceLine[]} */
    const out = [];
    while (!this.done) {
      const l = this.next();
      if (end.test(l.text)) return out;
      out.push(l);
    }
    return out;
  }

  /**
   * Read a `{ … }` body after an opening brace, honouring nested braces and
   * quotes. Returns the body lines without the closing brace line.
   * @returns {SourceLine[]}
   */
  braceBlock() {
    /** @type {SourceLine[]} */
    const out = [];
    let depth = 1;
    while (!this.done) {
      const l = this.next();
      const delta = braceDelta(l.text);
      if (depth + delta <= 0 && /^\s*}/.test(l.text)) return out;
      depth += delta;
      out.push(l);
    }
    return out;
  }
}

/**
 * Net change of brace depth on a line, ignoring quoted text.
 * @param {string} text
 * @returns {number}
 */
export function braceDelta(text) {
  let d = 0;
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === "{") d++;
    else if (!quoted && c === "}") d--;
  }
  return d;
}

/**
 * Generic rule-driven line parser. Rules are tried in order; the first one
 * returning `true` consumes the line. Unmatched lines are reported to the
 * diagnostics collector.
 * @template C
 * @typedef {(line: string, ctx: C, reader: LineReader, src: SourceLine) => boolean | void} Rule
 */

/**
 * @template C
 * @param {SourceLine[]} lines
 * @param {Rule<C>[]} rules
 * @param {C} ctx
 * @param {{ unknown: (text: string, line: number) => void }} diagnostics
 */
export function runRules(lines, rules, ctx, diagnostics) {
  const reader = new LineReader(lines);
  while (!reader.done) {
    const src = reader.next();
    const text = src.text.trim();
    if (!text) continue;
    let handled = false;
    for (const rule of rules) {
      if (rule(text, ctx, reader, src)) {
        handled = true;
        break;
      }
    }
    if (!handled) diagnostics.unknown(text, src.line);
  }
}
