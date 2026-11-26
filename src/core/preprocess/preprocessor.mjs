/**
 * PlantUML preprocessor.
 *
 * Implements variables (`!$x = …`), legacy macros (`!define`, `!definelong`),
 * conditionals (`!if`, `!ifdef`, `!ifndef`), loops (`!while`, `!foreach`),
 * procedures/functions with default and keyword arguments, `!include` through
 * a caller-supplied resolver, `!theme`, `!pragma`, `!log` and `!assert`.
 *
 * Every step is budgeted by {@link import("../limits.mjs").Limits} so hostile
 * input cannot loop forever or explode the output.
 * @module core/preprocess/preprocessor
 */

import { ParseError, LimitError } from "../errors.mjs";
import { Diagnostics } from "../diagnostics.mjs";
import { DEFAULT_LIMITS } from "../limits.mjs";
import { extractBlocks, stripComments } from "../source.mjs";
import { parseExpression, evaluate, stringify, truthy } from "./expression.mjs";
import { BUILTINS } from "./builtins.mjs";
import { STDLIB } from "./stdlib.mjs";

/** @typedef {import("../source.mjs").SourceLine} SourceLine */
/** @typedef {import("./expression.mjs").PValue} PValue */

/**
 * Text and its canonical path within the caller's namespace. Nested includes
 * receive that path as `from`; bare strings retain the requested target as `from`.
 * @typedef {{ text: string, path: string }} ResolvedInclude
 */

/**
 * Resolve an `!include` target, or return null when it is unavailable.
 * @typedef {(target: string, context: { from: string | null, kind: "file" | "stdlib" | "url" }) => string | ResolvedInclude | null} IncludeResolver
 */

/**
 * @typedef {object} PreprocessOptions
 * @property {IncludeResolver} [include] Resolver for `!include`. Without it, only the bundled stdlib resolves.
 * @property {string} [sourcePath] Entry path in the resolver's namespace.
 * @property {boolean} [strictIncludes] Fail on missing or cyclic includes.
 * @property {Record<string, string | number | boolean>} [defines] Predefined `$variables`.
 * @property {import("../limits.mjs").Limits} [limits]
 * @property {Diagnostics} [diagnostics]
 * @property {Date | null} [date] Date returned by `%date()`.
 * @property {string} [filename] Value of `%filename()`.
 */

/**
 * @typedef {object} PreprocessResult
 * @property {SourceLine[]} lines
 * @property {string | null} theme Name from the last `!theme` directive.
 * @property {Map<string, string>} pragmas
 */

/**
 * @typedef {object} Callable
 * @property {"procedure" | "function"} kind
 * @property {{ name: string, def: string | null }[]} params
 * @property {SourceLine[]} body
 * @property {string | null} inlineReturn Expression of a one-line function.
 */

/** @typedef {{ params: string[] | null, body: string }} Macro */

class ReturnSignal {
  /** @param {PValue} value */
  constructor(value) {
    this.value = value;
  }
}

const DIRECTIVE_RE = /^\s*!\s*([a-z_]+)\b\s*(.*)$/i;
const ASSIGN_RE = /^\s*!\s*(?:(global|local)\s+)?(\$\w+)\s*(\?=|=)\s*(.*)$/i;
const CALL_LINE_RE = /^\s*(\$?[A-Za-z_]\w*)\s*\((.*)\)\s*(\{)?\s*$/;
const BLOCK_OPENERS = new Map([
  ["if", "endif"],
  ["ifdef", "endif"],
  ["ifndef", "endif"],
  ["while", "endwhile"],
  ["foreach", "endfor"],
  ["procedure", "endprocedure"],
  ["function", "endfunction"],
  ["definelong", "enddefinelong"],
]);

/**
 * Run the preprocessor over a list of lines.
 * @param {SourceLine[]} lines
 * @param {PreprocessOptions} [options]
 * @returns {PreprocessResult}
 * @public
 */
export function preprocess(lines, options = {}) {
  return new Preprocessor(options).run(lines);
}

/**
 * Convenience wrapper operating on plain text (used by tests and the CLI).
 * @param {string} text
 * @param {PreprocessOptions} [options]
 * @returns {string}
 * @public
 */
export function preprocessText(text, options = {}) {
  const lines = text.split(/\r?\n/).map((t, i) => ({ text: t, line: i + 1 }));
  return preprocess(stripComments(lines), options)
    .lines.map((l) => l.text)
    .join("\n");
}

class Preprocessor {
  /** @param {PreprocessOptions} options */
  constructor(options) {
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.diagnostics = options.diagnostics ?? new Diagnostics();
    this.resolver = options.include ?? null;
    this.strictIncludes = options.strictIncludes === true;
    this.includeBytes = 0;
    this.encoder = new TextEncoder();
    this.date = options.date ?? null;
    this.filename = options.filename ?? "";
    /** @type {Map<string, PValue>} */
    this.globals = new Map();
    for (const [k, v] of Object.entries(options.defines ?? {})) {
      this.globals.set(k.startsWith("$") ? k : `$${k}`, v);
    }
    /** @type {Map<string, PValue>[]} */
    this.scopes = [];
    /** @type {Map<string, Macro>} */
    this.macros = new Map();
    /** @type {Map<string, Callable>} */
    this.callables = new Map();
    /** @type {Set<string>} */
    this.included = new Set();
    this.steps = 0;
    this.depth = 0;
    /** @type {string | null} */
    this.theme = null;
    /** @type {Map<string, string>} */
    this.pragmas = new Map();
    /** @type {SourceLine[]} */
    this.out = [];
    /** @type {string | null} */
    this.currentFile = options.sourcePath ?? null;
    this.activeFiles = new Set(this.currentFile === null ? [] : [this.currentFile]);
  }

  /**
   * @param {SourceLine[]} lines
   * @returns {PreprocessResult}
   */
  run(lines) {
    this.exec(lines, this.out);
    return { lines: this.out, theme: this.theme, pragmas: this.pragmas };
  }

  // ── variables ────────────────────────────────────────────────────────

  /** @param {string} name */
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return this.globals.get(name);
  }

  /**
   * @param {string} name
   * @param {PValue} value
   * @param {"global" | "local" | null} [where]
   */
  assign(name, value, where = null) {
    if (typeof value === "string" && value.length > this.limits.maxLineLength * 4) {
      throw new LimitError(
        `Preprocessor variable ${name} exceeds ${this.limits.maxLineLength * 4} characters`,
      );
    }
    const local = this.scopes[this.scopes.length - 1];
    if (where === "global" || !local) this.globals.set(name, value);
    else if (where === "local" || local.has(name)) local.set(name, value);
    else if (this.globals.has(name)) this.globals.set(name, value);
    else local.set(name, value);
  }

  /** @returns {import("./expression.mjs").EvalContext} */
  get evalContext() {
    return {
      lookup: (name) => this.lookup(name),
      call: (name, args, named) => this.callValue(name, args, named),
    };
  }

  /**
   * @param {string} src
   * @param {number} line
   * @returns {PValue}
   */
  eval(src, line) {
    try {
      return evaluate(parseExpression(this.substituteMacros(src)), this.evalContext);
    } catch (err) {
      if (err instanceof ReturnSignal || err instanceof LimitError) throw err;
      if (err instanceof RangeError) throw new LimitError("Preprocessor value too large", { line });
      throw new ParseError(
        `Invalid preprocessor expression "${src}": ${/** @type {Error} */ (err).message}`,
        {
          line,
          cause: err,
        },
      );
    }
  }

  // ── execution ────────────────────────────────────────────────────────

  tick() {
    if (++this.steps > this.limits.maxPreprocessSteps) {
      throw new LimitError(`Preprocessor exceeded ${this.limits.maxPreprocessSteps} steps`);
    }
  }

  /**
   * @param {SourceLine[]} lines
   * @param {SourceLine[]} out
   */
  exec(lines, out) {
    for (let i = 0; i < lines.length; i++) {
      this.tick();
      const src = lines[i];
      const assign = ASSIGN_RE.exec(src.text);
      if (assign) {
        const [, where, name, op, expr] = assign;
        if (op === "?=" && this.lookup(name) !== undefined) continue;
        this.assign(
          name,
          this.eval(expr, src.line),
          /** @type {any} */ (where?.toLowerCase() ?? null),
        );
        continue;
      }
      const d = DIRECTIVE_RE.exec(src.text);
      if (!d) {
        this.emitText(src, out);
        continue;
      }
      let keyword = d[1].toLowerCase();
      let rest = d[2];
      if (keyword === "unquoted" || keyword === "final") {
        const inner = /^\s*(procedure|function)\b\s*(.*)$/i.exec(rest);
        if (inner) {
          keyword = inner[1].toLowerCase();
          rest = inner[2];
        }
      }
      if (BLOCK_OPENERS.has(keyword) && !(keyword === "function" && /!return\b/i.test(rest))) {
        const end = this.findBlockEnd(lines, i, keyword);
        this.execBlock(keyword, rest, lines.slice(i + 1, end), lines[i], out);
        i = end;
        continue;
      }
      this.execDirective(keyword, rest, src, out);
    }
  }

  /**
   * Find the index of the line that closes the block opened at `start`.
   * @param {SourceLine[]} lines
   * @param {number} start
   * @param {string} keyword
   */
  findBlockEnd(lines, start, keyword) {
    const closer = /** @type {string} */ (BLOCK_OPENERS.get(keyword));
    let depth = 0;
    for (let j = start + 1; j < lines.length; j++) {
      const m = DIRECTIVE_RE.exec(lines[j].text);
      if (!m) continue;
      let k = m[1].toLowerCase();
      if (k === "unquoted" || k === "final") k = (/^\s*(\w+)/.exec(m[2])?.[1] ?? "").toLowerCase();
      const opener = BLOCK_OPENERS.get(k);
      if (opener === closer && !(k === "function" && /!return\b/i.test(m[2]))) depth++;
      else if (k === closer || (closer === "endfor" && k === "endforeach")) {
        if (depth === 0) return j;
        depth--;
      }
    }
    throw new ParseError(`Missing !${closer}`, { line: lines[start].line });
  }

  /**
   * @param {string} keyword
   * @param {string} rest
   * @param {SourceLine[]} body
   * @param {SourceLine} head
   * @param {SourceLine[]} out
   */
  execBlock(keyword, rest, body, head, out) {
    switch (keyword) {
      case "if":
      case "ifdef":
      case "ifndef":
        return this.execIf(keyword, rest, body, head, out);
      case "while": {
        let n = 0;
        while (truthy(this.eval(rest, head.line))) {
          if (++n > this.limits.maxLoopIterations)
            throw new LimitError("!while loop exceeded iteration limit", head);
          this.exec(body, out);
        }
        return;
      }
      case "foreach": {
        const m = /^(\$\w+)\s+in\s+(.+)$/i.exec(rest.trim());
        if (!m) throw new ParseError("Invalid !foreach", { line: head.line });
        const value = this.eval(m[2], head.line);
        const items = Array.isArray(value)
          ? value
          : value && typeof value === "object"
            ? Object.keys(value)
            : stringify(value).split(",");
        if (items.length > this.limits.maxLoopIterations)
          throw new LimitError("!foreach exceeded iteration limit", head);
        for (const item of items) {
          this.assign(m[1], item);
          this.exec(body, out);
        }
        return;
      }
      case "procedure":
      case "function":
        return this.defineCallable(
          /** @type {"procedure" | "function"} */ (keyword),
          rest,
          body,
          head,
        );
      case "definelong": {
        const m = /^(\w+)\s*(?:\(([^)]*)\))?\s*$/.exec(rest.trim());
        if (!m) throw new ParseError("Invalid !definelong", { line: head.line });
        this.macros.set(m[1], {
          params: m[2] !== undefined ? splitArgs(m[2]).map((p) => p.trim()) : null,
          body: body.map((l) => l.text).join("\n"),
        });
        return;
      }
    }
  }

  /**
   * @param {string} keyword
   * @param {string} rest
   * @param {SourceLine[]} body
   * @param {SourceLine} head
   * @param {SourceLine[]} out
   */
  execIf(keyword, rest, body, head, out) {
    /** @type {{ cond: (() => boolean) | null, lines: SourceLine[] }[]} */
    const branches = [{ cond: () => this.condition(keyword, rest, head.line), lines: [] }];
    let depth = 0;
    for (const l of body) {
      const m = DIRECTIVE_RE.exec(l.text);
      const k = m?.[1].toLowerCase();
      if (k && (k === "if" || k === "ifdef" || k === "ifndef")) depth++;
      else if (k === "endif") depth--;
      else if (depth === 0 && k === "elseif") {
        const expr = /** @type {RegExpExecArray} */ (m)[2];
        branches.push({ cond: () => truthy(this.eval(expr, l.line)), lines: [] });
        continue;
      } else if (depth === 0 && k === "else") {
        branches.push({ cond: null, lines: [] });
        continue;
      }
      branches[branches.length - 1].lines.push(l);
    }
    for (const b of branches) {
      if (b.cond === null || b.cond()) {
        this.exec(b.lines, out);
        return;
      }
    }
  }

  /**
   * @param {string} keyword
   * @param {string} rest
   * @param {number} line
   */
  condition(keyword, rest, line) {
    if (keyword === "if") return truthy(this.eval(rest, line));
    const name = rest.trim();
    const defined =
      this.macros.has(name) ||
      this.lookup(name.startsWith("$") ? name : `$${name}`) !== undefined ||
      this.lookup(name) !== undefined ||
      this.callables.has(name);
    return keyword === "ifdef" ? defined : !defined;
  }

  /**
   * @param {"procedure" | "function"} kind
   * @param {string} rest
   * @param {SourceLine[]} body
   * @param {SourceLine} head
   */
  defineCallable(kind, rest, body, head) {
    const m = /^(\$?[A-Za-z_]\w*)\s*\((.*?)\)\s*(.*)$/.exec(rest.trim());
    if (!m) throw new ParseError(`Invalid !${kind} declaration`, { line: head.line });
    const params = splitArgs(m[2])
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const eq = p.indexOf("=");
        return eq < 0
          ? { name: p, def: null }
          : { name: p.slice(0, eq).trim(), def: p.slice(eq + 1).trim() };
      });
    const inline = /^!return\s+(.*)$/i.exec(m[3].trim());
    this.callables.set(m[1], { kind, params, body, inlineReturn: inline ? inline[1] : null });
  }

  /**
   * @param {string} keyword
   * @param {string} rest
   * @param {SourceLine} src
   * @param {SourceLine[]} out
   */
  execDirective(keyword, rest, src, out) {
    switch (keyword) {
      case "function": // one-line function: !function $f($a) !return $a + 1
        return this.defineCallable("function", rest, [], src);
      case "return":
        throw new ReturnSignal(this.eval(rest, src.line));
      case "define": {
        const m = /^(\w+)(?:\(([^)]*)\))?\s*(.*)$/.exec(rest.trim());
        if (!m) throw new ParseError("Invalid !define", { line: src.line });
        this.macros.set(m[1], {
          params: m[2] !== undefined ? splitArgs(m[2]).map((p) => p.trim()) : null,
          body: m[3],
        });
        return;
      }
      case "undef":
        this.macros.delete(rest.trim());
        this.globals.delete(rest.trim());
        return;
      case "include":
      case "include_many":
      case "include_once":
      case "includesub":
        return this.include(keyword, rest.trim(), src, out);
      case "includeurl":
      case "import":
        this.diagnostics.warn(`!${keyword} is not supported for security reasons`, src.line);
        return;
      case "startsub":
      case "endsub":
      case "dump_memory":
      case "option":
        return;
      case "theme":
        this.theme = /^\s*([\w-]+)/.exec(rest)?.[1] ?? null;
        return;
      case "pragma": {
        const m = /^(\S+)\s*(.*)$/.exec(rest.trim());
        if (m) this.pragmas.set(m[1].toLowerCase(), m[2].trim());
        return;
      }
      case "log":
        this.diagnostics.info(this.substitute(rest), src.line);
        return;
      case "assert": {
        const [cond, ...msg] = splitTopLevel(rest, ":");
        if (!truthy(this.eval(cond, src.line))) {
          throw new ParseError(`Assertion failed: ${msg.join(":").trim() || cond.trim()}`, {
            line: src.line,
          });
        }
        return;
      }
      case "else":
      case "elseif":
      case "endif":
      case "endwhile":
      case "endfor":
      case "endforeach":
      case "endprocedure":
      case "endfunction":
      case "enddefinelong":
        throw new ParseError(`Unexpected !${keyword}`, { line: src.line });
      default:
        this.diagnostics.warn(`Unknown preprocessor directive !${keyword}`, src.line);
    }
  }

  // ── includes ─────────────────────────────────────────────────────────

  /**
   * @param {string} keyword
   * @param {string} target
   * @param {SourceLine} src
   * @param {SourceLine[]} out
   */
  include(keyword, target, src, out) {
    let spec = this.substitute(target).trim();
    let part = /** @type {string | null} */ (null);
    const bang = spec.lastIndexOf("!");
    if (bang > 0) {
      part = spec.slice(bang + 1);
      spec = spec.slice(0, bang);
    }
    const isStdlib = spec.startsWith("<") && spec.endsWith(">");
    const name = isStdlib ? spec.slice(1, -1) : spec.replace(/^["']|["']$/g, "");
    const requestKey = `${isStdlib ? "stdlib" : "target"}:${name}`;
    const once = isStdlib || keyword === "include_once";
    if (once && this.included.has(requestKey)) return;

    /** @type {string | ResolvedInclude | null} */
    let resolved = isStdlib ? (STDLIB.get(name) ?? null) : null;
    if (resolved === null && this.resolver) {
      resolved = this.resolver(name, {
        from: this.currentFile,
        kind: isStdlib ? "stdlib" : /^https?:/i.test(name) ? "url" : "file",
      });
    }
    const location = this.currentFile ? ` from ${JSON.stringify(this.currentFile)}` : "";
    if (resolved === null) {
      if (this.strictIncludes)
        throw new ParseError(`Cannot resolve !${keyword} ${JSON.stringify(spec)}${location}`, {
          line: src.line,
          code: "INCLUDE_NOT_FOUND",
        });
      this.diagnostics.warn(`Cannot resolve !${keyword} ${spec}${location}`, src.line);
      return;
    }
    const canonical = typeof resolved === "string" ? null : resolved.path;
    const key = canonical === null ? requestKey : `path:${canonical}`;
    if (canonical !== null && this.activeFiles.has(canonical)) {
      const message = `Include cycle${location} targeting ${JSON.stringify(spec)}`;
      if (this.strictIncludes)
        throw new ParseError(message, { line: src.line, code: "INCLUDE_CYCLE" });
      this.diagnostics.warn(message, src.line);
      return;
    }
    if (once && this.included.has(key)) return;
    this.included.add(key);
    if (this.depth >= this.limits.maxPreprocessDepth)
      throw new LimitError("Include depth limit exceeded", src);

    const text = typeof resolved === "string" ? resolved : resolved.text;
    if (canonical !== null) {
      this.includeBytes += this.encoder.encode(text).length;
      if (this.includeBytes > this.limits.maxInputBytes)
        throw new LimitError(`Included source exceeds ${this.limits.maxInputBytes} bytes`, src);
    }

    const blocks = extractBlocks(text);
    let lines = blocks[0]?.lines ?? [];
    if (part !== null) {
      if (/^\d+$/.test(part)) lines = blocks[Number(part)]?.lines ?? [];
      else lines = extractSub(lines, part);
    } else if (keyword === "includesub") {
      lines = [];
    }
    // Included lines keep the including line number so diagnostics point at the !include.
    const mapped = stripComments(lines).map((l) => ({ text: l.text, line: src.line }));
    const previous = this.currentFile;
    this.currentFile = canonical ?? name;
    if (canonical !== null) this.activeFiles.add(canonical);
    this.depth++;
    try {
      this.exec(mapped, out);
    } finally {
      this.depth--;
      if (canonical !== null) this.activeFiles.delete(canonical);
      this.currentFile = previous;
    }
  }

  // ── calls ────────────────────────────────────────────────────────────

  /**
   * Bind arguments to a callable's parameters in a fresh scope.
   * @param {Callable} fn
   * @param {PValue[]} args
   * @param {Map<string, PValue>} named
   */
  bindScope(fn, args, named) {
    /** @type {Map<string, PValue>} */
    const scope = new Map();
    fn.params.forEach((p, idx) => {
      let value = named.get(p.name);
      if (value === undefined) value = args[idx];
      if (value === undefined) value = p.def !== null ? this.eval(p.def, 0) : "";
      scope.set(p.name, value);
    });
    return scope;
  }

  /**
   * @template T
   * @param {Map<string, PValue>} scope
   * @param {() => T} fn
   * @returns {T}
   */
  withScope(scope, fn) {
    if (this.depth >= this.limits.maxPreprocessDepth)
      throw new LimitError("Preprocessor call depth exceeded");
    this.depth++;
    this.scopes.push(scope);
    try {
      return fn();
    } finally {
      this.scopes.pop();
      this.depth--;
    }
  }

  /**
   * Call a builtin or user function and return its value.
   * @param {string} name
   * @param {PValue[]} args
   * @param {Map<string, PValue>} named
   * @returns {PValue}
   */
  callValue(name, args, named) {
    this.tick();
    if (name.startsWith("%")) {
      const builtin = Object.prototype.hasOwnProperty.call(BUILTINS, name.slice(1))
        ? BUILTINS[name.slice(1)]
        : null;
      if (!builtin) {
        this.diagnostics.warn(`Unknown builtin ${name}()`);
        return "";
      }
      return builtin(args, this.builtinHost);
    }
    const fn = this.callables.get(name);
    if (!fn) return `${name}(${args.map(stringify).join(", ")})`;
    const scope = this.bindScope(fn, args, named);
    return this.withScope(scope, () => {
      if (fn.inlineReturn !== null) return this.eval(fn.inlineReturn, 0);
      if (fn.kind === "procedure") {
        /** @type {SourceLine[]} */
        const sink = [];
        this.exec(fn.body, sink);
        return sink.map((l) => l.text).join("\n");
      }
      try {
        this.exec(fn.body, []);
      } catch (signal) {
        if (signal instanceof ReturnSignal) return signal.value;
        throw signal;
      }
      return "";
    });
  }

  /** @returns {import("./builtins.mjs").BuiltinHost} */
  get builtinHost() {
    return {
      getVariable: (n) => this.lookup(n),
      setVariable: (n, v) => this.assign(n, v),
      hasCallable: (n) => this.callables.has(n),
      callUser: (n, args) => this.callValue(n, args, new Map()),
      date: this.date,
      filename: this.filename,
    };
  }

  // ── text substitution ───────────────────────────────────────────────

  /**
   * Emit a text line, expanding procedure calls and substitutions.
   * @param {SourceLine} src
   * @param {SourceLine[]} out
   */
  emitText(src, out) {
    const call = CALL_LINE_RE.exec(src.text);
    const fn = call ? this.callables.get(call[1]) : undefined;
    if (call && fn && fn.kind === "procedure") {
      const { args, named } = this.parseCallArgs(call[2], src.line);
      const scope = this.bindScope(fn, args, named);
      /** @type {SourceLine[]} */
      const sink = [];
      this.withScope(scope, () => this.exec(fn.body, sink));
      // `Boundary(...) {` keeps its opening brace on the last emitted line.
      if (call[3] && sink.length)
        sink[sink.length - 1] = {
          ...sink[sink.length - 1],
          text: `${sink[sink.length - 1].text} {`,
        };
      for (const l of sink) this.push(out, { text: l.text, line: src.line });
      return;
    }
    const text = this.substitute(src.text);
    for (const part of text.split("\n")) this.push(out, { text: part, line: src.line });
  }

  /**
   * @param {SourceLine[]} out
   * @param {SourceLine} line
   */
  push(out, line) {
    if (out === this.out && out.length >= this.limits.maxLines) {
      throw new LimitError(`Preprocessed source exceeds ${this.limits.maxLines} lines`);
    }
    out.push(line);
  }

  /**
   * Parse call arguments: positional expressions and `$name=value` keywords.
   * @param {string} raw
   * @param {number} line
   */
  parseCallArgs(raw, line) {
    /** @type {PValue[]} */
    const args = [];
    /** @type {Map<string, PValue>} */
    const named = new Map();
    for (const part of splitArgs(raw)) {
      const trimmed = part.trim();
      if (!trimmed && args.length === 0 && named.size === 0 && splitArgs(raw).length === 1)
        continue;
      const kw = /^(\$\w+)\s*=\s*(.*)$/s.exec(trimmed);
      if (kw) named.set(kw[1], this.evalArg(kw[2], line));
      else args.push(this.evalArg(trimmed, line));
    }
    return { args, named };
  }

  /**
   * Evaluate a call argument. Unparseable arguments fall back to their
   * substituted text, matching PlantUML's lenient argument handling.
   * @param {string} raw
   * @param {number} line
   */
  evalArg(raw, line) {
    if (raw === "") return "";
    try {
      return this.eval(raw, line);
    } catch (err) {
      if (err instanceof LimitError) throw err;
      return this.substitute(raw);
    }
  }

  /**
   * Substitute variables, function calls, builtins and macros in free text.
   * @param {string} text
   * @returns {string}
   */
  substitute(text) {
    let current = text;
    for (let pass = 0; pass < 8; pass++) {
      this.tick();
      const next = this.substituteCalls(this.substituteMacros(current));
      if (next === current) return next;
      if (next.length > this.limits.maxLineLength * 4)
        throw new LimitError("Substituted line too long");
      current = next;
    }
    return current;
  }

  /**
   * Replace `$var`, `$fn(...)`, `fn(...)` (user functions) and `%builtin(...)`.
   * @param {string} text
   */
  substituteCalls(text) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (
        (c === "$" || c === "%" || /[A-Za-z_]/.test(c)) &&
        (i === 0 || !/[\w$%]/.test(text[i - 1]))
      ) {
        let j = i + 1;
        while (j < text.length && /\w/.test(text[j])) j++;
        const name = text.slice(i, j);
        if (text[j] === "(" && (c === "%" ? name.length > 1 : this.isFunction(name))) {
          const close = matchParen(text, j);
          if (close > 0) {
            const { args, named } = this.parseCallArgs(text.slice(j + 1, close), 0);
            out += stringify(this.callValue(name, args, named));
            i = close + 1;
            continue;
          }
        }
        if (c === "$") {
          const value = this.lookup(name);
          if (value !== undefined) {
            // `$obj.key` / `$arr[0]` member access on JSON values.
            const member =
              value && typeof value === "object"
                ? /^(?:\.\w+|\[[^\]\n]{1,200}\])+/.exec(text.slice(j))
                : null;
            if (member) {
              out += stringify(this.eval(name + member[0], 0));
              i = j + member[0].length;
              continue;
            }
            out += stringify(value);
            i = j;
            continue;
          }
        }
        out += name;
        i = j;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  /** @param {string} name */
  isFunction(name) {
    const fn = this.callables.get(name);
    return !!fn && fn.kind === "function";
  }

  /**
   * Expand legacy `!define` macros (word-boundary aware, with `##` pasting).
   * @param {string} text
   */
  substituteMacros(text) {
    if (this.macros.size === 0) return text;
    let out = text;
    for (const [name, macro] of this.macros) {
      if (!out.includes(name)) continue;
      let result = "";
      let i = 0;
      while (i < out.length) {
        const idx = out.indexOf(name, i);
        if (idx < 0) {
          result += out.slice(i);
          break;
        }
        const before = idx > 0 ? out[idx - 1] : "";
        const after = out[idx + name.length] ?? "";
        if (/[\w$]/.test(before) || /\w/.test(after)) {
          result += out.slice(i, idx + name.length);
          i = idx + name.length;
          continue;
        }
        result += out.slice(i, idx);
        let end = idx + name.length;
        let body = macro.body;
        if (macro.params && out[end] === "(") {
          const close = matchParen(out, end);
          if (close > 0) {
            const args = splitArgs(out.slice(end + 1, close)).map((a) => a.trim());
            macro.params.forEach((p, k) => {
              const [pname, pdef] = p.split("=").map((s) => s.trim());
              body = replaceWord(body, pname, args[k] ?? (pdef ?? "").replace(/^"|"$/g, ""));
            });
            end = close + 1;
          }
        }
        result += body.replace(/\s*##\s*/g, "");
        i = end;
      }
      out = result;
    }
    return out;
  }
}

/**
 * @param {string} text
 * @param {string} word
 * @param {string} value
 */
function replaceWord(text, word, value) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const idx = text.indexOf(word, i);
    if (idx < 0) return out + text.slice(i);
    const before = idx > 0 ? text[idx - 1] : "";
    const after = text[idx + word.length] ?? "";
    out += text.slice(i, idx);
    out += /[\w]/.test(before) || /\w/.test(after) ? word : value;
    i = idx + word.length;
  }
  return out;
}

/**
 * Index of the parenthesis matching the one at `open`, honouring quotes.
 * @param {string} text
 * @param {number} open
 * @returns {number} Index or -1.
 */
export function matchParen(text, open) {
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"') quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Split on top-level commas, ignoring commas inside quotes and brackets.
 * @param {string} text
 * @returns {string[]}
 */
export function splitArgs(text) {
  return splitTopLevel(text, ",");
}

/**
 * @param {string} text
 * @param {string} sep
 * @returns {string[]}
 */
function splitTopLevel(text, sep) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"') quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Extract lines between `!startsub NAME` and `!endsub`.
 * @param {SourceLine[]} lines
 * @param {string} name
 */
function extractSub(lines, name) {
  /** @type {SourceLine[]} */
  const out = [];
  let inside = false;
  for (const l of lines) {
    const m = DIRECTIVE_RE.exec(l.text);
    if (m && m[1].toLowerCase() === "startsub" && m[2].trim() === name) inside = true;
    else if (m && m[1].toLowerCase() === "endsub") inside = false;
    else if (inside) out.push(l);
  }
  return out;
}
