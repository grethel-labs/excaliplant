/**
 * The MCP tools: schemas and implementations. Every tool takes plain JSON
 * arguments (never file names) and returns a `CallToolResult`. `runTool` is the
 * only entry point; it validates arguments and maps every failure to a safe
 * `isError` result, so callers never see stack traces or file-system paths.
 * @module mcp/tools
 */

import { render, listDiagramTypes, defaultRegistry } from "../api.mjs";
import { parseBlock } from "../core/pipeline.mjs";
import { extractBlocks } from "../core/source.mjs";
import { ExcaliplantError, LimitError } from "../core/errors.mjs";
import { DEFAULT_LIMITS, resolveLimits } from "../core/limits.mjs";
import { THEME_NAMES } from "../draw/theme.mjs";
import { EXAMPLES } from "./examples.generated.mjs";
import { createIncludeResolver } from "./include.mjs";
import { clip } from "./protocol.mjs";
import { validate } from "./schema.mjs";

/**
 * Per-server settings the tools run with. Must stay structured-cloneable: it
 * is handed to the worker thread.
 * @typedef {object} ToolEnv
 * @property {Partial<import("../core/limits.mjs").Limits>} limits
 * @property {string | null} includeDir Directory `!include` may read from, or null for none.
 * @property {number} maxPngWidth Widest PNG a call may produce, in pixels.
 * @property {number} maxOutputBytes Largest result payload in bytes.
 */

/**
 * @typedef {object} ToolDefinition
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {Record<string, any>} inputSchema
 * @property {Record<string, any>} outputSchema
 * @property {boolean} heavy Runs the PlantUML pipeline and belongs on the worker thread.
 * @property {(args: Record<string, any>, env: ToolEnv) => Promise<CallToolResult>} run
 */

/**
 * @typedef {object} CallToolResult
 * @property {Record<string, unknown>[]} content
 * @property {Record<string, unknown>} [structuredContent]
 * @property {boolean} [isError]
 */

/** Widest PNG a call may request; wider rasters cost memory and exceed typical client limits. */
export const MAX_PNG_WIDTH = 4096;

/** Largest number of diagnostics returned in one result. */
const MAX_DIAGNOSTICS = 100;

/** Behaviour hints: every tool is a pure function of its arguments. */
const ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const DIAGNOSTIC_SCHEMA = {
  type: "object",
  properties: {
    severity: { type: "string", enum: ["warning", "info"] },
    message: { type: "string" },
    line: { type: ["integer", "null"] },
  },
  required: ["severity", "message", "line"],
};

/**
 * @param {string} text
 * @returns {CallToolResult}
 */
export function errorResult(text) {
  return { isError: true, content: [{ type: "text", text: clip(text, 600) }] };
}

/**
 * Result with a JSON text block mirroring `structuredContent`.
 * @param {Record<string, unknown>} structured
 * @returns {CallToolResult}
 */
function jsonResult(structured) {
  return {
    content: [{ type: "text", text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

/**
 * @param {import("../core/diagnostics.mjs").Diagnostic[]} diagnostics
 */
function publicDiagnostics(diagnostics) {
  return diagnostics.slice(0, MAX_DIAGNOSTICS).map((d) => ({
    severity: d.severity,
    message: clip(d.message, 300),
    line: d.line ?? null,
  }));
}

/** @type {Map<string, import("../core/preprocess/preprocessor.mjs").IncludeResolver>} */
const resolvers = new Map();

/**
 * @param {ToolEnv} env
 */
function includeFor(env) {
  if (!env.includeDir) return undefined;
  let resolver = resolvers.get(env.includeDir);
  if (!resolver) {
    resolver = createIncludeResolver(env.includeDir, resolveLimits(env.limits).maxInputBytes);
    resolvers.set(env.includeDir, resolver);
  }
  return resolver;
}

/**
 * @param {string} source
 * @param {ToolEnv} env
 */
function assertInputSize(source, env) {
  const max = resolveLimits(env.limits).maxInputBytes;
  if (Buffer.byteLength(source, "utf8") > max) throw new LimitError(`Input exceeds ${max} bytes`);
}

/** @type {Record<string, string>} */
const MIME = {
  svg: "image/svg+xml",
  png: "image/png",
  excalidraw: "application/vnd.excalidraw+json",
};

/** @type {ToolDefinition} */
const renderPlantuml = {
  name: "render_plantuml",
  title: "Render PlantUML",
  description:
    "Render PlantUML source text to an SVG, a PNG image or an Excalidraw JSON document. " +
    "Only the first @start...@end block (or the given page of a newpage document) is rendered. " +
    "Parse warnings are returned as diagnostics. The input is text only; files and URLs are not read.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "PlantUML source text.", minLength: 1 },
      format: {
        type: "string",
        enum: ["svg", "png", "excalidraw"],
        description: "Output format. Default: svg.",
      },
      theme: {
        type: "string",
        enum: [...THEME_NAMES],
        description: "Visual theme. Default: sketch.",
      },
      clean: {
        type: "boolean",
        description: "Use clean strokes instead of the hand-drawn look.",
      },
      seed: {
        type: "string",
        description:
          "Seed for the stroke wobble and element ids. Same input and seed give identical output.",
        maxLength: 200,
      },
      page: {
        type: "integer",
        minimum: 0,
        description: "Page of a newpage document, starting at 0.",
      },
      width: {
        type: "integer",
        minimum: DEFAULT_LIMITS.minWidth,
        maximum: MAX_PNG_WIDTH,
        description: "PNG width in pixels. Ignored for other formats.",
      },
    },
    required: ["source"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", description: "Detected diagram kind." },
      format: { type: "string", enum: ["svg", "png", "excalidraw"] },
      mimeType: { type: "string" },
      pages: { type: "integer", description: "Number of pages in the diagram block." },
      page: { type: "integer", description: "Rendered page, starting at 0." },
      bytes: { type: "integer", description: "Size of the rendered output in bytes." },
      diagnostics: { type: "array", items: DIAGNOSTIC_SCHEMA },
    },
    required: ["kind", "format", "mimeType", "pages", "page", "bytes", "diagnostics"],
  },
  heavy: true,
  async run(args, env) {
    const format = args.format ?? "svg";
    assertInputSize(args.source, env);
    const limits = resolveLimits(env.limits);
    limits.maxWidth = Math.min(limits.maxWidth, env.maxPngWidth);
    const result = await render(args.source, {
      theme: args.theme,
      sketch: args.clean === true ? false : undefined,
      seed: args.seed,
      page: args.page,
      limits,
      include: includeFor(env),
    });
    /** @type {Record<string, unknown>} */
    let payload;
    let bytes;
    if (format === "png") {
      const png = await result.toPng(/** @type {any} */ ({ width: args.width, limits }));
      bytes = png.length;
      if (bytes > env.maxOutputBytes) throw new LimitError(outputTooLarge(bytes, env));
      payload = { type: "image", data: png.toString("base64"), mimeType: MIME.png };
    } else {
      const text = format === "svg" ? await result.toSvg() : JSON.stringify(result.excalidraw);
      bytes = Buffer.byteLength(text, "utf8");
      if (bytes > env.maxOutputBytes) throw new LimitError(outputTooLarge(bytes, env));
      payload = { type: "text", text };
    }
    const structured = {
      kind: result.kind,
      format,
      mimeType: MIME[format],
      pages: result.pages,
      page: args.page ?? 0,
      bytes,
      diagnostics: publicDiagnostics(result.diagnostics),
    };
    return {
      content: [payload, { type: "text", text: JSON.stringify(structured) }],
      structuredContent: structured,
    };
  },
};

/**
 * @param {number} bytes
 * @param {ToolEnv} env
 */
function outputTooLarge(bytes, env) {
  return `Output of ${bytes} bytes exceeds the limit of ${env.maxOutputBytes} bytes; use a smaller diagram or a narrower width`;
}

/** @type {ToolDefinition} */
const validatePlantuml = {
  name: "validate_plantuml",
  title: "Validate PlantUML",
  description:
    "Parse PlantUML source text without rendering it. Returns the detected diagram kind and the " +
    "diagnostics (line-based warnings) of every @start...@end block.",
  inputSchema: {
    type: "object",
    properties: {
      source: { type: "string", description: "PlantUML source text.", minLength: 1 },
      strict: {
        type: "boolean",
        description: "Report unrecognised lines as errors instead of warnings.",
      },
    },
    required: ["source"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      valid: { type: "boolean" },
      blocks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            name: { type: ["string", "null"] },
            kind: { type: ["string", "null"], description: "Detected diagram kind." },
            pages: { type: ["integer", "null"] },
            valid: { type: "boolean" },
            error: {
              type: ["object", "null"],
              properties: { message: { type: "string" }, line: { type: ["integer", "null"] } },
            },
            diagnostics: { type: "array", items: DIAGNOSTIC_SCHEMA },
          },
          required: ["index", "name", "kind", "pages", "valid", "error", "diagnostics"],
        },
      },
    },
    required: ["valid", "blocks"],
  },
  heavy: true,
  async run(args, env) {
    assertInputSize(args.source, env);
    const limits = resolveLimits(env.limits);
    const blocks = extractBlocks(args.source, { maxBlocks: limits.maxBlocks });
    const include = includeFor(env);
    const out = blocks.map((block, index) => {
      try {
        const { module, ctx, pages } = parseBlock(block, defaultRegistry, {
          limits,
          include,
          strict: args.strict === true,
        });
        return {
          index,
          name: block.name,
          kind: module.kind,
          pages,
          valid: true,
          error: null,
          diagnostics: publicDiagnostics(ctx.diagnostics.toJSON()),
        };
      } catch (error) {
        if (!(error instanceof ExcaliplantError)) throw error;
        return {
          index,
          name: block.name,
          kind: null,
          pages: null,
          valid: false,
          error: { message: clip(error.message, 300), line: error.line },
          diagnostics: [],
        };
      }
    });
    return jsonResult({ valid: out.every((b) => b.valid), blocks: out });
  },
};

/** @type {ToolDefinition} */
const listTypes = {
  name: "list_diagram_types",
  title: "List diagram types",
  description:
    "List the diagram types excaliplant can render (kind, title and the @start tags that select them) " +
    "and the available themes.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: {
    type: "object",
    properties: {
      types: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string" },
            title: { type: "string" },
            starts: { type: "array", items: { type: "string" } },
          },
          required: ["kind", "title", "starts"],
        },
      },
      themes: { type: "array", items: { type: "string" } },
    },
    required: ["types", "themes"],
  },
  heavy: false,
  async run() {
    const types = listDiagramTypes().map((t) => ({
      kind: t.kind,
      title: t.title,
      starts: t.starts.map((s) => `@start${s}`),
    }));
    return jsonResult({ types, themes: [...THEME_NAMES] });
  },
};

/**
 * @param {{ kind: string, name: string, diagram: string }} e
 */
const summary = (e) => ({ kind: e.kind, name: e.name, diagram: e.diagram });

/** @type {ToolDefinition} */
const getExample = {
  name: "get_example",
  title: "Get example diagram",
  description:
    "Return bundled PlantUML example sources. Without arguments, or with only kind, it lists the " +
    "available examples; with name (and optionally kind) it returns the source of one example.",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        description: "Example folder, e.g. sequence, class or gantt.",
        maxLength: 100,
      },
      name: {
        type: "string",
        description: "Example name without the .puml extension.",
        maxLength: 100,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      examples: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string" },
            name: { type: "string" },
            diagram: { type: "string", description: "Diagram kind detected for the example." },
          },
          required: ["kind", "name", "diagram"],
        },
      },
      example: {
        type: "object",
        properties: {
          kind: { type: "string" },
          name: { type: "string" },
          diagram: { type: "string" },
          source: { type: "string" },
        },
        required: ["kind", "name", "diagram", "source"],
      },
    },
  },
  heavy: false,
  async run(args) {
    const kinds = [...new Set(EXAMPLES.map((e) => e.kind))];
    if (args.kind !== undefined && !kinds.includes(args.kind)) {
      return errorResult(
        `Unknown example kind "${clip(args.kind, 60)}". Available kinds: ${kinds.join(", ")}`,
      );
    }
    const pool = args.kind === undefined ? EXAMPLES : EXAMPLES.filter((e) => e.kind === args.kind);
    if (args.name === undefined) return jsonResult({ examples: pool.map(summary) });
    const hits = pool.filter((e) => e.name === args.name);
    if (hits.length === 0) {
      return errorResult(
        `No example "${clip(args.name, 60)}"${args.kind ? ` in kind ${args.kind}` : ""}. ` +
          `Available: ${pool.map((e) => `${e.kind}/${e.name}`).join(", ")}`,
      );
    }
    if (hits.length > 1) {
      return errorResult(
        `Example name "${clip(args.name, 60)}" exists in several kinds: ${hits.map((e) => e.kind).join(", ")}. Pass kind.`,
      );
    }
    const [hit] = hits;
    return {
      content: [{ type: "text", text: hit.source }],
      structuredContent: { example: { ...summary(hit), source: hit.source } },
    };
  },
};

/** Tool definitions in the order they are listed. */
export const TOOLS = Object.freeze([renderPlantuml, validatePlantuml, listTypes, getExample]);

/**
 * @param {string} name
 * @returns {ToolDefinition | undefined}
 */
export function findTool(name) {
  return TOOLS.find((t) => t.name === name);
}

/**
 * The tool as it appears in `tools/list`.
 * @param {ToolDefinition} tool
 */
export function describeTool(tool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: ANNOTATIONS,
  };
}

/**
 * Validate the arguments and run a tool. Never throws: every failure becomes
 * an `isError` result whose text is safe to show to a model.
 * @param {string} name
 * @param {unknown} args
 * @param {ToolEnv} env
 * @param {(message: string) => void} [log] Receives internal errors (for stderr).
 * @returns {Promise<CallToolResult>}
 */
export async function runTool(name, args, env, log) {
  const tool = findTool(name);
  if (!tool) return errorResult(`Unknown tool ${clip(name, 60)}`);
  const problems = validate(tool.inputSchema, args ?? {});
  if (problems.length > 0) return errorResult(`Invalid arguments. ${problems.join("; ")}`);
  try {
    return await tool.run(args ?? {}, env);
  } catch (error) {
    if (error instanceof ExcaliplantError) return errorResult(error.message);
    log?.(
      `tool ${name} failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
    );
    return errorResult("Internal error while running the tool");
  }
}
