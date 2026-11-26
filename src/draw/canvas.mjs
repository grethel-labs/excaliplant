/**
 * Drawing surface that produces Excalidraw elements. Diagram modules draw
 * exclusively through this API; they never touch Excalidraw fields directly.
 * @module draw/canvas
 */

import { THEMES, themeColor } from "./theme.mjs";
import { seededRandom, idFactory } from "../core/hash.mjs";
import { LimitError } from "../core/errors.mjs";
import { layoutText, LINE_HEIGHT } from "../layout/measure.mjs";
import { TRANSPARENT } from "../syntax/color.mjs";

/** Excalidraw font family id for Excalifont. */
export const FONT_EXCALIFONT = 5;
/** Excalidraw font family id for the monospace font (Comic Shanns). */
export const FONT_MONO = 8;

/**
 * Arrowheads understood by Excalidraw itself.
 * @type {ReadonlySet<string>}
 */
export const NATIVE_HEADS = new Set([
  "arrow",
  "bar",
  "dot",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
  "crowfoot_one",
  "crowfoot_many",
  "crowfoot_one_or_many",
]);

/**
 * @typedef {object} Style
 * @property {string} [stroke]
 * @property {string} [fill]
 * @property {number} [strokeWidth]
 * @property {"solid" | "dashed" | "dotted"} [strokeStyle]
 * @property {number} [roughness]
 * @property {"solid" | "hachure" | "cross-hatch"} [fillStyle]
 * @property {number} [opacity] 0–100
 * @property {boolean} [rounded]
 * @property {string | null} [link]
 */

/**
 * Head decorations: native Excalidraw heads plus `cross`, `plus`, `socket`,
 * `half_top`, `half_bottom`, `zero_one`, `zero_many` which are drawn as extra
 * primitives.
 * @typedef {string | null} Head
 */

/** @typedef {[number, number]} Point */
/** @typedef {import("../syntax/hooks.mjs").Hook} Hook */
/** @typedef {import("../syntax/hooks.mjs").Tooltip} Tooltip */
/** @typedef {{ parent: HookOwner | null }} HookOwner */
/** @typedef {Pick<Hook, "name" | "id" | "clickFromChildren" | "hover" | "click"> & { classes?: string[], parent?: string }} SceneHook */
/** @typedef {{ hook: Hook, data: SceneHook, owner?: HookOwner }} BoundHook */

/**
 * Find the nearest bound structural ancestor and cache the skipped owners.
 * An ambiguous owner is stored as null and ends the search.
 * @param {HookOwner | undefined} owner
 * @param {Map<HookOwner, BoundHook | null>} byOwner
 */
function nearestHookAncestor(owner, byOwner) {
  const skipped = [];
  let node = owner?.parent;
  while (node && !byOwner.has(node)) {
    skipped.push(node);
    node = node.parent;
  }
  const parent = node ? byOwner.get(node) : null;
  for (const ancestor of skipped) byOwner.set(ancestor, parent);
  return parent;
}

/**
 * @param {Map<BoundHook, BoundHook>} parents
 * @returns {Set<BoundHook>}
 */
function cyclicHooks(parents) {
  const cyclic = new Set();
  const visited = new Set();
  for (const binding of parents.keys()) {
    if (visited.has(binding)) continue;
    const path = new Set();
    let next = binding;
    while (next && !visited.has(next)) {
      visited.add(next);
      path.add(next);
      next = parents.get(next);
    }
    if (path.has(next)) {
      const first = next;
      do {
        cyclic.add(next);
        next = parents.get(next);
      } while (next !== first);
    }
  }
  return cyclic;
}

/** @public */
export class Canvas {
  /**
   * @param {{ seed: number, theme: import("./theme.mjs").Theme, maxElements?: number, hooks?: Hook[], tooltips?: Tooltip[] }} options
   */
  constructor(options) {
    this.theme = options.theme;
    this.random = seededRandom(options.seed);
    this.nextId = idFactory(String(options.seed));
    this.maxElements = options.maxElements ?? 200_000;
    /** @type {any[]} */
    this.elements = [];
    /** @type {string[]} */
    this.groupStack = [];
    /** @type {Map<string, any>} */
    this.byId = new Map();
    /** @type {Map<string, any[]>} */
    this.interactionAliases = new Map();
    /** @type {Set<string>} */
    this.hookElementTargets = new Set();
    /** @type {Map<string, HookOwner>} */
    this.hookOwners = new Map();
    for (const hook of options.hooks ?? []) {
      if (hook.selector === "alias") this.interactionAliases.set(hook.target, []);
      else this.hookElementTargets.add(hook.target);
    }
    for (const tooltip of options.tooltips ?? []) {
      if (tooltip.selector === "alias") this.interactionAliases.set(tooltip.target, []);
    }
  }

  /** @returns {number} */
  seed() {
    return Math.floor(this.random() * 2 ** 31);
  }

  /**
   * Run `fn` with all created elements sharing a new group.
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  group(fn) {
    this.groupStack.push(this.nextId());
    try {
      return fn();
    } finally {
      this.groupStack.pop();
    }
  }

  /**
   * Associate a logical diagram element with the primitives it draws.
   * @template T
   * @param {string} alias
   * @param {() => T} draw
   * @param {HookOwner} [owner] Logical node that owns these primitives.
   * @returns {T}
   */
  withHookAlias(alias, draw, owner) {
    const parts = this.interactionAliases.get(alias);
    if (!parts && !(owner && this.hookElementTargets.size)) return draw();
    const start = this.elements.length;
    const result = draw();
    for (let i = start; i < this.elements.length; i++) {
      const part = this.elements[i];
      parts?.push(part);
      if (owner && (parts || this.hookElementTargets.has(part.id))) {
        this.hookOwners.set(part.id, owner);
      }
    }
    return result;
  }

  /**
   * Attach plain-text tooltips to the primitives of each target.
   * @param {Tooltip[]} tooltips
   * @param {(line: number, message: string) => void} reportError
   */
  applyTooltips(tooltips, reportError) {
    for (const tooltip of tooltips) {
      const parts = this.#targetParts(tooltip);
      const target = `${tooltip.selector}:${tooltip.target}`;
      if (!parts.length) reportError(tooltip.line, `Unknown tooltip target "${target}"`);
      else if (parts.some((part) => part.customData?.excaliplantTooltip !== undefined))
        reportError(tooltip.line, `Tooltip overlaps another tooltip on "${target}"`);
      else {
        for (const part of parts) {
          part.customData = { ...part.customData, excaliplantTooltip: tooltip.text };
        }
      }
    }
  }

  /** @param {Pick<Hook, "selector" | "target">} target */
  #targetParts({ selector, target }) {
    if (selector === "alias") return this.interactionAliases.get(target) ?? [];
    const element = this.byId.get(target);
    return element ? [element] : [];
  }

  /**
   * Attach a hook to existing drawing primitives in a custom diagram module.
   * @param {Hook} hook
   * @returns {string | null} A diagnostic when the binding cannot be applied.
   */
  applyHook(hook) {
    const binding = this.#bindHook(hook);
    return "error" in binding ? binding.error : null;
  }

  /**
   * Attach interaction metadata and resolve relationships between bound hooks.
   * @param {Hook[]} hooks
   * @param {(line: number, message: string) => void} reportError
   */
  applyHooks(hooks, reportError) {
    /** @type {Map<string, BoundHook>} */
    const bindings = new Map();
    /** @type {Map<HookOwner, BoundHook | null>} */
    const byOwner = new Map();
    for (const hook of hooks) {
      const binding = this.#bindHook(hook);
      if ("error" in binding) {
        reportError(hook.line, binding.error);
        continue;
      }
      bindings.set(hook.name, binding);
      const { owner } = binding;
      if (owner) byOwner.set(owner, byOwner.has(owner) ? null : binding);
    }
    /** @type {Map<BoundHook, BoundHook>} */
    const parents = new Map();
    for (const binding of bindings.values()) {
      const { hook, owner } = binding;
      if (hook.parentId) {
        const parent = bindings.get(hook.parentId);
        if (!parent) reportError(hook.line, `Unknown bound parent hook "#${hook.parentId}"`);
        else if (parent === binding)
          reportError(hook.line, `Hook "${hook.name}" is its own parent`);
        else parents.set(binding, parent);
      } else {
        const parent = nearestHookAncestor(owner, byOwner);
        if (parent) parents.set(binding, parent);
      }
    }
    const cyclic = cyclicHooks(parents);
    for (const [binding, parent] of parents) {
      const { hook, data } = binding;
      // Graph ownership is a tree; only explicit edges can introduce cycles.
      if (hook.parentId && cyclic.has(binding)) {
        reportError(
          hook.line,
          `Hook "${hook.name}" has a cyclic parent reference to "#${hook.parentId}"`,
        );
      } else {
        data.parent = parent.data.name;
      }
    }
  }

  /**
   * @param {Hook} hook
   * @returns {BoundHook | { error: string }}
   */
  #bindHook(hook) {
    const parts = this.#targetParts(hook);
    if (!parts.length) return { error: `Unknown hook target "${hook.selector}:${hook.target}"` };
    if (parts.some((part) => part.customData?.excaliplantHook)) {
      return {
        error: `Hook "${hook.name}" overlaps another hook on "${hook.selector}:${hook.target}"`,
      };
    }
    const defaults = (/** @type {string} */ role) => ({
      ...THEMES.sketch.roles[role],
      ...this.theme.roles[role],
    });
    /** @type {SceneHook} */
    const data = {
      name: hook.name,
      ...(hook.id && { id: hook.id }),
      ...(hook.classes.length && { classes: hook.classes }),
      ...(hook.clickFromChildren && { clickFromChildren: true }),
      hover: { ...defaults("hookHover"), ...hook.hover },
      click: { ...defaults("hookClick"), ...hook.click },
    };
    for (const part of parts) {
      part.customData = { ...part.customData, excaliplantHook: data };
    }
    const owner = this.hookOwners.get(parts[0].id);
    return {
      hook,
      data,
      owner:
        owner && parts.every((part) => this.hookOwners.get(part.id) === owner) ? owner : undefined,
    };
  }

  /**
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {Style} style
   */
  base(type, x, y, w, h, style) {
    if (this.elements.length >= this.maxElements) {
      throw new LimitError(`Diagram exceeds ${this.maxElements} drawing elements`);
    }
    const t = this.theme;
    const el = {
      id: this.nextId(),
      type,
      x: round(x),
      y: round(y),
      width: round(Math.max(0, w)),
      height: round(Math.max(0, h)),
      angle: 0,
      strokeColor: style.stroke ?? t.ink,
      backgroundColor: style.fill ?? TRANSPARENT,
      fillStyle: style.fillStyle ?? t.fillStyle,
      strokeWidth: style.strokeWidth ?? t.strokeWidth,
      strokeStyle: style.strokeStyle ?? "solid",
      roughness: style.roughness ?? t.roughness,
      opacity: style.opacity ?? 100,
      groupIds: [...this.groupStack].reverse(),
      frameId: null,
      roundness: null,
      seed: this.seed(),
      version: 1,
      versionNonce: this.seed(),
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: style.link || null,
      locked: false,
    };
    this.elements.push(el);
    this.byId.set(el.id, el);
    return el;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {Style} [style]
   * @returns {string} Element id.
   */
  rect(x, y, w, h, style = {}) {
    const el = this.base("rectangle", x, y, w, h, style);
    if (style.rounded) el.roundness = { type: 3 };
    return el.id;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {Style} [style]
   */
  ellipse(x, y, w, h, style = {}) {
    return this.base("ellipse", x, y, w, h, style).id;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {Style} [style]
   */
  diamond(x, y, w, h, style = {}) {
    return this.base("diamond", x, y, w, h, style).id;
  }

  /**
   * Open or closed polyline. Closed polylines with a fill render as polygons.
   * @param {Point[]} points Absolute points.
   * @param {Style & { closed?: boolean, curved?: boolean }} [style]
   */
  line(points, style = {}) {
    const pts = style.closed ? [...points, points[0]] : points;
    return this.linear("line", pts, style).id;
  }

  /**
   * @param {"line" | "arrow"} type
   * @param {Point[]} points
   * @param {Style & { curved?: boolean }} style
   */
  linear(type, points, style) {
    const x0 = points[0][0];
    const y0 = points[0][1];
    const rel = points.map(([x, y]) => [round(x - x0), round(y - y0)]);
    const xs = rel.map((p) => p[0]);
    const ys = rel.map((p) => p[1]);
    const el = this.base(
      type,
      x0,
      y0,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      style,
    );
    el.points = rel;
    el.lastCommittedPoint = null;
    el.startBinding = null;
    el.endBinding = null;
    el.startArrowhead = null;
    el.endArrowhead = null;
    if (style.curved) el.roundness = { type: 2 };
    return el;
  }

  /**
   * Arrow along a polyline with optional heads and bindings.
   * @param {Point[]} points
   * @param {Style & { start?: Head, end?: Head, curved?: boolean, from?: string | null, to?: string | null }} [style]
   */
  arrow(points, style = {}) {
    if (points.length < 2) return null;
    const el = this.linear("arrow", points, {
      ...style,
      roughness: style.roughness ?? this.theme.edgeRoughness,
    });
    el.elbowed = false;
    const sw = el.strokeWidth;
    el.startArrowhead = this.head(style.start ?? null, points[1], points[0], el, sw);
    el.endArrowhead = this.head(
      style.end ?? null,
      points[points.length - 2],
      points[points.length - 1],
      el,
      sw,
    );
    if (style.from) this.bind(el, "startBinding", style.from);
    if (style.to) this.bind(el, "endBinding", style.to);
    return el.id;
  }

  /**
   * Translate a head name; non-native heads are drawn as decorations.
   * @param {Head} head
   * @param {Point} from Point before the tip.
   * @param {Point} tip
   * @param {any} el Arrow element.
   * @param {number} sw
   * @returns {string | null}
   */
  head(head, from, tip, el, sw) {
    if (!head) return null;
    if (NATIVE_HEADS.has(head)) return head;
    const style = {
      stroke: el.strokeColor,
      strokeWidth: Math.max(1, sw * 0.75),
      roughness: el.roughness,
    };
    const [ux, uy] = unit(from, tip);
    const [nx, ny] = [-uy, ux];
    const at = (/** @type {number} */ back, /** @type {number} */ side) =>
      /** @type {Point} */ ([tip[0] - ux * back + nx * side, tip[1] - uy * back + ny * side]);
    switch (head) {
      case "cross":
        this.line([at(4, -6), at(16, 6)], style);
        this.line([at(4, 6), at(16, -6)], style);
        return null;
      case "plus": {
        const c = at(8, 0);
        this.ellipse(c[0] - 8, c[1] - 8, 16, 16, {
          ...style,
          fill: this.theme.surface ?? this.theme.background,
        });
        this.line([at(0, 0), at(16, 0)], style);
        this.line([at(8, -8), at(8, 8)], style);
        return null;
      }
      case "socket": {
        const pts = [];
        for (let a = -90; a <= 90; a += 15) {
          const r = (a * Math.PI) / 180;
          pts.push(at(-2 + 9 - Math.cos(r) * 9, Math.sin(r) * 9));
        }
        this.line(/** @type {Point[]} */ (pts), { ...style, curved: true });
        return null;
      }
      case "half_top":
        this.line([tip, at(14, -7)], style);
        return null;
      case "half_bottom":
        this.line([tip, at(14, 7)], style);
        return null;
      case "zero_one":
        this.line([at(4, -7), at(4, 7)], style);
        this.ellipse(...circleAt(at(15, 0), 5), {
          ...style,
          fill: this.theme.surface ?? this.theme.background,
        });
        return null;
      case "zero_many":
        this.line([at(0, -8), at(12, 0), at(0, 8)], style);
        this.ellipse(...circleAt(at(18, 0), 5), {
          ...style,
          fill: this.theme.surface ?? this.theme.background,
        });
        return null;
      case "one_one":
        this.line([at(4, -7), at(4, 7)], style);
        this.line([at(9, -7), at(9, 7)], style);
        return null;
      case "async":
        this.line([at(14, -7), tip, at(14, 7)], style);
        return null;
      default:
        return "arrow";
    }
  }

  /**
   * @param {any} arrow
   * @param {"startBinding" | "endBinding"} which
   * @param {string} targetId
   */
  bind(arrow, which, targetId) {
    const target = this.byId.get(targetId);
    if (!target) return;
    arrow[which] = { elementId: targetId, focus: 0, gap: 4 };
    target.boundElements = [...(target.boundElements ?? []), { id: arrow.id, type: "arrow" }];
  }

  /**
   * Single-style text element. `x`/`y` is the top-left corner unless `align`
   * shifts the anchor.
   * @param {string} text
   * @param {number} x Anchor x (left/center/right depending on align).
   * @param {number} y Top y.
   * @param {{ size?: number, color?: string, align?: "left" | "center" | "right", width?: number, mono?: boolean, bold?: boolean, italic?: boolean, link?: string | null, opacity?: number }} [opts]
   */
  text(text, x, y, opts = {}) {
    const size = opts.size ?? this.theme.fontSize;
    const align = opts.align ?? "left";
    const width = opts.width ?? layoutText(text, { fontSize: size }).width;
    const lines = text.split("\n").length;
    const height = lines * size * LINE_HEIGHT;
    const left = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    const el = this.base("text", left, y, width, height, {
      stroke: opts.color ?? this.theme.ink,
      fill: TRANSPARENT,
      strokeWidth: 1,
      roughness: 0,
      link: opts.link ?? null,
      opacity: opts.opacity,
    });
    Object.assign(el, {
      text,
      fontSize: round(size),
      fontFamily: opts.mono ? FONT_MONO : FONT_EXCALIFONT,
      textAlign: align,
      verticalAlign: "top",
      containerId: null,
      originalText: text,
      autoResize: true,
      lineHeight: LINE_HEIGHT,
    });
    if (opts.bold || opts.italic) el.customData = { bold: !!opts.bold, italic: !!opts.italic };
    return el.id;
  }

  /**
   * Draw a laid-out rich text block (see {@link layoutText}) at `x, y`
   * (top-left of the block).
   * @param {import("../layout/measure.mjs").RichLayout} laid
   * @param {number} x
   * @param {number} y
   * @param {{ color?: string, align?: "left" | "center" | "right" }} [opts]
   */
  richText(laid, x, y, opts = {}) {
    const color = opts.color ?? this.theme.ink;
    if (laid.plain) {
      const align = opts.align ?? "center";
      const ax = align === "center" ? x + laid.width / 2 : align === "right" ? x + laid.width : x;
      if (laid.text)
        this.text(laid.text, ax, y, {
          size: laid.fontSize,
          color,
          align,
          width: laid.width,
          bold: laid.bold,
        });
      return;
    }
    for (const it of laid.items) {
      if (it.kind === "box")
        this.rect(x + it.x, y + it.y, it.w, it.h, {
          fill: it.fill ?? themeColor(this.theme, "special.table-header.fill"),
          stroke: TRANSPARENT,
          roughness: 0,
          strokeWidth: 1,
        });
    }
    for (const it of laid.items) {
      if (it.kind === "text") {
        if (!it.text) continue;
        this.text(it.text, x + it.x, y + it.y, {
          size: it.fontSize,
          color:
            it.run.color ?? (it.run.link ? themeColor(this.theme, "special.link.text") : color),
          width: it.width,
          mono: it.run.mono,
          bold: it.run.bold || laid.bold,
          italic: it.run.italic,
          link: it.run.link,
        });
      } else if (it.kind === "rule") {
        this.line(
          [
            [x + it.x1, y + it.y1],
            [x + it.x2, y + it.y2],
          ],
          { stroke: color, strokeWidth: 1, roughness: it.wave ? 2 : 0 },
        );
      }
    }
  }

  /**
   * Bounding box of all elements (or a subset).
   * @param {any[]} [elements]
   * @returns {{ x: number, y: number, w: number, h: number }}
   */
  bounds(elements = this.elements) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of elements) {
      if (e.points) {
        for (const [px, py] of e.points) {
          minX = Math.min(minX, e.x + px);
          minY = Math.min(minY, e.y + py);
          maxX = Math.max(maxX, e.x + px);
          maxY = Math.max(maxY, e.y + py);
        }
      } else {
        minX = Math.min(minX, e.x);
        minY = Math.min(minY, e.y);
        maxX = Math.max(maxX, e.x + e.width);
        maxY = Math.max(maxY, e.y + e.height);
      }
    }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /**
   * Move every element by `dx, dy`.
   * @param {number} dx
   * @param {number} dy
   */
  translate(dx, dy) {
    for (const e of this.elements) {
      e.x = round(e.x + dx);
      e.y = round(e.y + dy);
    }
  }
}

/** @param {number} n */
export function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Unit vector from a to b.
 * @param {Point} a
 * @param {Point} b
 * @returns {Point}
 */
export function unit(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

/**
 * @param {Point} c
 * @param {number} r
 * @returns {[number, number, number, number]}
 */
function circleAt(c, r) {
  return [c[0] - r, c[1] - r, r * 2, r * 2];
}
