// Message protocol between the page and the render worker, as a plain object
// with no DOM or worker API: `createEngine().handle(message)` returns the
// response. `site/worker.mjs` wires it to `postMessage`; the tests call it
// directly.
//
//   page → worker   { type: "render", id, source, options, svg }
//                   { type: "export", id, what: "excalidraw" | "clipboard" }
//   worker → page   { type: "ready", version }
//                   { type: "result", id, ok: true, svg, width, height, kind, pages,
//                     blocks, diagnostics, title, ms }
//                   { type: "result", id, ok: false, error, line, ms }
//                   { type: "stale", id }
//                   { type: "export", id, ok, text }

import { render } from "../../src/api.mjs";
import { extractBlocks } from "../../src/core/source.mjs";
import { sanitizeSvg } from "../../src/markdown/sanitize.mjs";
import { THEME_CHOICES, KIND_CHOICES, MAX_SOURCE_BYTES } from "./options.mjs";

/**
 * Limits applied in the page: tighter than the library defaults so a pasted
 * monster cannot make the tab unusable (the UI also kills the worker after a
 * timeout).
 */
export const PLAYGROUND_LIMITS = Object.freeze({
  maxInputBytes: MAX_SOURCE_BYTES,
  maxLines: 10_000,
  maxPreprocessSteps: 50_000,
  maxLoopIterations: 2_000,
  maxNodes: 1_500,
  maxEdges: 3_000,
  maxElements: 50_000,
});

/** A small graph diagram: loads ELK and warms up the JIT before the first real render. */
export const WARMUP_SOURCE = "@startuml\nclass A\nclass B\nA --> B\n@enduml";

const encoder = new TextEncoder();

/**
 * Whitelist and type-check the render options coming from the page.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function cleanRenderOptions(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : {};
  /** @type {Record<string, unknown>} */
  const out = { limits: { ...PLAYGROUND_LIMITS } };
  if (typeof o.theme === "string" && THEME_CHOICES.includes(o.theme)) out.theme = o.theme;
  if (o.sketch === false) out.sketch = false;
  if (typeof o.seed === "string" || typeof o.seed === "number")
    out.seed = String(o.seed).slice(0, 100);
  if (o.strict === true) out.strict = true;
  if (Number.isInteger(o.page) && o.page >= 0 && o.page < 1000) out.page = o.page;
  if (Number.isInteger(o.block) && o.block >= 0 && o.block < 100) out.block = o.block;
  if (typeof o.kind === "string" && KIND_CHOICES.includes(o.kind)) out.kind = o.kind;
  if (o.defines && typeof o.defines === "object") {
    /** @type {Record<string, string>} */
    const defines = Object.create(null);
    for (const [k, v] of Object.entries(o.defines).slice(0, 100)) {
      if (/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k) && k !== "__proto__" && typeof v === "string") {
        defines[k] = v.slice(0, 1000);
      }
    }
    out.defines = defines;
  }
  if (typeof o.filename === "string") out.filename = o.filename.slice(0, 200);
  if (o.date instanceof Date && !Number.isNaN(o.date.getTime())) out.date = o.date;
  return out;
}

/**
 * @param {unknown} raw
 * @returns {{ background?: string }}
 */
function cleanSvgOptions(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : {};
  const bg = o.background;
  return typeof bg === "string" && /^(#[0-9a-fA-F]{3,8}|transparent)$/.test(bg)
    ? { background: bg }
    : {};
}

/** @param {string} svg */
function svgSize(svg) {
  const head = svg.slice(0, svg.indexOf(">") + 1);
  const w = Number(/\bwidth="([\d.]+)"/.exec(head)?.[1]);
  const h = Number(/\bheight="([\d.]+)"/.exec(head)?.[1]);
  return {
    width: Number.isFinite(w) && w > 0 ? w : 800,
    height: Number.isFinite(h) && h > 0 ? h : 600,
  };
}

/** @param {unknown} err */
function describe(err) {
  const e = /** @type {{ message?: unknown, line?: unknown }} */ (err ?? {});
  const raw = err instanceof Error ? err.message : String(e.message ?? err);
  let message = "";
  for (const ch of raw.slice(0, 500)) message += ch.charCodeAt(0) < 0x20 ? " " : ch;
  return {
    error: message.trim() || "Rendering failed",
    line: typeof e.line === "number" && e.line > 0 ? e.line : null,
  };
}

/**
 * @param {{ version?: string, now?: () => number }} [config]
 */
export function createEngine(config = {}) {
  const now =
    config.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const version = config.version ?? "dev";
  /** @type {import("../../src/api.mjs").RenderResult | null} */
  let last = null;
  let newest = -1;

  /**
   * @param {any} msg
   * @param {boolean} [keep] Remember the result for `export` requests.
   */
  async function renderMessage(msg, keep = true) {
    const id = Number(msg.id);
    newest = Math.max(newest, id);
    const t0 = now();
    const ms = () => Math.max(1, Math.round(now() - t0));
    const source = msg.source;
    if (typeof source !== "string")
      return { type: "result", id, ok: false, error: "Source must be text", line: null, ms: 0 };
    if (encoder.encode(source).length > MAX_SOURCE_BYTES) {
      return {
        type: "result",
        id,
        ok: false,
        error: `Input exceeds ${MAX_SOURCE_BYTES / 1024} KB`,
        line: null,
        ms: 0,
      };
    }
    try {
      const options = cleanRenderOptions(msg.options);
      /** @type {{ name: string | null, line: number }[]} */
      const blocks = extractBlocks(source, { maxBlocks: 100 }).map((b) => ({
        name: b.name,
        line: b.line,
      }));
      const result = await render(source, options);
      // A newer request arrived while this one was laying out: skip the work of
      // serialising and shipping a result nobody will look at.
      if (id < newest) return { type: "stale", id };
      const raw = await result.toSvg(cleanSvgOptions(msg.svg));
      const svg = sanitizeSvg(raw);
      if (keep) last = result;
      const title = /** @type {any} */ (result.model)?.meta?.title;
      return {
        type: "result",
        id,
        ok: true,
        svg,
        ...svgSize(svg),
        kind: result.kind,
        pages: result.pages,
        blocks,
        diagnostics: result.diagnostics,
        title: typeof title === "string" ? title.slice(0, 200) : null,
        ms: ms(),
      };
    } catch (err) {
      return { type: "result", id, ok: false, ...describe(err), ms: ms() };
    }
  }

  /** @param {any} msg */
  function exportMessage(msg) {
    const id = Number(msg.id);
    if (!last) return { type: "export", id, ok: false, text: "" };
    const doc = last.excalidraw;
    const data =
      msg.what === "clipboard"
        ? { type: "excalidraw/clipboard", elements: doc.elements, files: {} }
        : doc;
    return { type: "export", id, ok: true, text: JSON.stringify(data) };
  }

  return {
    version,
    /** Render a tiny graph diagram so the first real render is fast. */
    async warmup() {
      await renderMessage({ id: -1, source: WARMUP_SOURCE, options: {}, svg: {} }, false);
      return { type: "ready", version };
    },
    /**
     * @param {unknown} message
     * @returns {Promise<Record<string, unknown> | null>} `null` for messages that are not understood.
     */
    async handle(message) {
      const msg = /** @type {any} */ (message);
      if (!msg || typeof msg !== "object") return null;
      if (msg.type === "render") return renderMessage(msg);
      if (msg.type === "export") return exportMessage(msg);
      return null;
    },
  };
}
