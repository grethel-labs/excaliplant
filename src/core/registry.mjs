/**
 * Diagram module contract and registry.
 * @module core/registry
 */

/** @typedef {import("./source.mjs").SourceLine} SourceLine */
/** @typedef {import("./diagnostics.mjs").Diagnostics} Diagnostics */
/** @typedef {import("../draw/theme.mjs").Theme} Theme */
/** @typedef {import("../draw/canvas.mjs").Canvas} Canvas */

/**
 * Context passed to every module hook.
 * @typedef {object} ModuleContext
 * @property {Diagnostics} diagnostics
 * @property {import("./limits.mjs").Limits} limits
 * @property {Theme} theme Resolved theme (available in layout and draw).
 * @property {Map<string, string>} pragmas `!pragma` values from the preprocessor.
 * @property {string} start Block start keyword (`uml`, `json`, …).
 */

/**
 * A diagram module. Models must expose a `meta` property created with
 * {@link import("../syntax/commons.mjs").createMeta} so shared chrome
 * (title, legend, …) works uniformly.
 * @typedef {object} DiagramModule
 * @property {string} kind Stable identifier, e.g. `sequence`.
 * @property {string} title Human readable name.
 * @property {readonly string[]} starts Start keywords handled (`uml`, `json`, `mindmap`, …).
 * @property {boolean} [raw] Skip comment stripping and preprocessing (ditaa, …).
 * @property {boolean} [fallback] Wins shared starts when no detector scores above zero.
 * @property {(lines: SourceLine[]) => number} [detect] Score 0…1 for shared starts such as `@startuml`.
 * @property {(lines: SourceLine[], ctx: ModuleContext) => { meta: import("../syntax/commons.mjs").DiagramMeta }} parse
 * @property {(model: any, ctx: ModuleContext) => any} layout May return a promise.
 * @property {(laid: any, canvas: Canvas, ctx: ModuleContext) => void} draw
 */

/**
 * Validate and freeze a module definition.
 * @template {DiagramModule} T
 * @param {T} def
 * @returns {Readonly<T>}
 * @public
 */
export function defineDiagram(def) {
  if (!def || typeof def.kind !== "string" || !/^[a-z][a-z0-9-]*$/.test(def.kind)) {
    throw new TypeError("Diagram module needs a lower-case kind");
  }
  for (const hook of ["parse", "layout", "draw"]) {
    if (typeof (/** @type {any} */ (def)[hook]) !== "function")
      throw new TypeError(`Diagram module ${def.kind} lacks ${hook}()`);
  }
  if (!Array.isArray(def.starts) || def.starts.length === 0)
    throw new TypeError(`Diagram module ${def.kind} needs starts`);
  return Object.freeze({ ...def, starts: Object.freeze([...def.starts]) });
}

/**
 * Ordered collection of diagram modules.
 * @public
 */
export class DiagramRegistry {
  /** @param {Iterable<DiagramModule>} [modules] */
  constructor(modules = []) {
    /** @type {Map<string, DiagramModule>} */
    this.modules = new Map();
    for (const m of modules) this.register(m);
  }

  /**
   * Register (or replace) a module.
   * @param {DiagramModule} module
   * @returns {this}
   */
  register(module) {
    this.modules.set(module.kind, defineDiagram(module));
    return this;
  }

  /**
   * @param {string} kind
   * @returns {DiagramModule | undefined}
   */
  get(kind) {
    return this.modules.get(kind);
  }

  /** @returns {DiagramModule[]} */
  list() {
    return [...this.modules.values()];
  }

  /**
   * Modules accepting a start keyword.
   * @param {string} start
   */
  forStart(start) {
    return this.list().filter((m) => m.starts.includes(start));
  }

  /**
   * Pick the module for a block. Several modules may share `@startuml`; the
   * highest `detect` score wins, with registration order breaking ties.
   * @param {string} start
   * @param {SourceLine[]} lines Preprocessed lines.
   * @returns {DiagramModule | undefined}
   */
  resolve(start, lines) {
    const candidates = this.forStart(start);
    if (candidates.length <= 1) return candidates[0];
    let best = candidates.find((m) => m.fallback) ?? candidates[0];
    let bestScore = 0;
    for (const m of candidates) {
      const score = m.detect ? m.detect(lines) : 0;
      if (score > bestScore) {
        best = m;
        bestScore = score;
      }
    }
    return best;
  }
}
