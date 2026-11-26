#!/usr/bin/env node
// excaliplant CLI: file/stdin I/O and option parsing only. All rendering
// logic lives in src/.

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { readThemeEnvironment } from "../src/draw/theme_env.mjs";
import {
  render,
  renderAll,
  listDiagramTypes,
  defaultRegistry,
  THEME_NAMES,
  DEFAULT_LIMITS,
} from "../src/index.mjs";
import { findProjectEntries } from "../src/core/project.mjs";
import { extractBlocks } from "../src/core/source.mjs";
import { openProject } from "./project.mjs";

const HELP = `excaliplant — render PlantUML as hand-drawn Excalidraw, SVG or PNG

Usage:
  excaliplant [input.puml] [-o output] [options]
  excaliplant --project <dir> [files relative to dir] [-o output] [options]
  cat diagram.puml | excaliplant -f svg > diagram.svg
  excaliplant markdown <file.md> [-i | -o out.md] [--mode inline|file]   (see: excaliplant markdown --help)
  excaliplant skills install --tool <claude|codex|gemini|opencode|cursor|copilot|all>   (see: excaliplant skills list)
  excaliplant mcp [--http <port>]   (MCP server on stdio; same as excaliplant-mcp)

Options:
  -o, --output <file>       Output file (format from extension unless -f is given).
                            With --all, "{n}" in the name is replaced by the block number.
  -f, --format <fmt>        excalidraw | svg | png (default: from extension, else excalidraw)
  -t, --theme <name>        ${THEME_NAMES.join(" | ")} (default: sketch)
      --clean               Clean strokes instead of the hand-drawn look
      --width <px>          PNG width in pixels (16–16000)
      --scale <n>           PNG scale relative to the SVG size (default 2)
      --background <color>  Background colour for SVG/PNG
      --seed <value>        Seed for stroke wobble and element ids
      --page <n>            Page of a newpage document (0-based)
      --all                 Render every @start…@end block
      --project <dir>       Discover entry diagrams and resolve includes within this directory
      --include-dir <dir>   Allow !include of files below <dir>
  -D, --define NAME=value   Predefine a preprocessor variable (repeatable)
      --strict              Fail on unrecognised lines
      --max-input-bytes <n> Input size limit (default 2 MiB, max 200 MiB)
      --list-types          List supported diagram types
  -q, --quiet               Do not print warnings
  -h, --help                Show this help
  -v, --version             Show the version
`;

const MAX_INPUT_CEILING = 200 * 1024 * 1024;

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {Record<string, any>} */
  const opts = { defines: {} };
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "-o":
      case "--output":
        opts.output = next();
        break;
      case "-f":
      case "--format":
        opts.format = next().toLowerCase();
        break;
      case "-t":
      case "--theme":
        opts.theme = next();
        break;
      case "--clean":
        opts.sketch = false;
        break;
      case "--width":
        opts.width = Number(next());
        break;
      case "--scale":
        opts.scale = Number(next());
        break;
      case "--background":
        opts.background = next();
        break;
      case "--seed":
        opts.seed = next();
        break;
      case "--page":
        opts.page = Number(next());
        break;
      case "--all":
        opts.all = true;
        break;
      case "--include-dir":
        opts.includeDir = next();
        break;
      case "--project":
        opts.project = next();
        if (!opts.project) throw new Error("--project needs a directory");
        break;
      case "-D":
      case "--define": {
        const [k, ...v] = next().split("=");
        opts.defines[k] = v.join("=");
        break;
      }
      case "--strict":
        opts.strict = true;
        break;
      case "--max-input-bytes":
        opts.maxInputBytes = Number(next());
        break;
      case "--list-types":
        opts.listTypes = true;
        break;
      case "-q":
      case "--quiet":
        opts.quiet = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      default:
        if (a.startsWith("-") && a !== "-") throw new Error(`Unknown option ${a}`);
        positional.push(a);
    }
  }
  opts.input = positional[0];
  opts.inputs = positional;
  return opts;
}

async function readStdin(limit) {
  /** @type {Buffer[]} */
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > limit) throw new Error(`Input exceeds ${limit} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * @param {import("../src/api.mjs").RenderResult} result
 * @param {Record<string, any>} opts
 * @param {string} format
 */
async function encode(result, opts, format) {
  if (format === "svg") return result.toSvg({ background: opts.background });
  if (format === "png")
    return result.toPng({ width: opts.width, scale: opts.scale, background: opts.background });
  return `${JSON.stringify(result.excalidraw, null, 2)}\n`;
}

/**
 * `excaliplant markdown …`: all logic lives in src/markdown; this only
 * supplies the file system.
 * @param {string[]} argv
 */
async function runMarkdown(argv) {
  const { runMarkdownCommand } = await import("../src/markdown/index.mjs");
  process.exitCode = await runMarkdownCommand(argv, {
    readFile: async (file) => readFileSync(file, "utf8"),
    writeFile: async (file, data) => {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, data);
    },
    readStdin: () => readStdin(10 * 1024 * 1024),
    openIncludes: (root, input) => {
      const project = openProject(root);
      const sourcePath = input === "-" ? "stdin.md" : project.sourcePath(input);
      if (!sourcePath)
        throw new Error(`Markdown input must be inside the include directory: ${input}`);
      return { sourcePath, include: project.createResolver() };
    },
    stdout: process.stdout,
    stderr: process.stderr,
  });
}

/**
 * @param {ReturnType<typeof openProject>} project
 * @param {string[]} selection
 * @param {import("../src/api.mjs").ApiOptions} options
 * @param {boolean} all
 */
function prepareProject(project, selection, options, all) {
  const files = project.list(selection);
  const include = project.createResolver();
  const entries =
    selection.length === 1
      ? [...files.keys()]
      : findProjectEntries(files.values(), include, {
          defines: options.defines,
          raw: (type) => defaultRegistry.forStart(type).every((module) => module.raw),
        });
  if (!entries.length)
    throw new Error(
      "No complete PlantUML diagrams found. Pass a specific project file to render a bare snippet.",
    );
  if (entries.length > 1 && !all)
    throw new Error(
      `Several PlantUML entries found: ${entries.map((entry) => JSON.stringify(entry)).join(", ")}. Select one file or use --all.`,
    );

  const jobs = entries.flatMap((sourcePath) => {
    const { text } = files.get(sourcePath);
    const count = all ? extractBlocks(text).length : 1;
    return Array.from({ length: count }, (_, block) => ({ sourcePath, text, block }));
  });
  if (jobs.length > DEFAULT_LIMITS.maxBlocks)
    throw new Error(`Project contains more than ${DEFAULT_LIMITS.maxBlocks} diagram blocks`);
  return { jobs, include };
}

/**
 * @param {ReturnType<typeof prepareProject>} project
 * @param {import("../src/api.mjs").ApiOptions} options
 */
async function* renderProject({ jobs, include }, options) {
  for (const [index, { sourcePath, text, block }] of jobs.entries()) {
    try {
      const result = await render(text, {
        ...options,
        block,
        include,
        sourcePath,
        strictIncludes: true,
        filename: path.posix.basename(sourcePath),
      });
      yield { result, sourcePath, index };
    } catch (error) {
      process.stderr.write(`${sourcePath}: error: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  if (process.argv[2] === "markdown") return runMarkdown(process.argv.slice(3));
  if (process.argv[2] === "mcp") {
    // Same server as the `excaliplant-mcp` bin; the MCP registry can only
    // start a package's default bin.
    const { runMcpProcess } = await import("../src/mcp/cli.mjs");
    return runMcpProcess(process.argv.slice(3));
  }
  if (process.argv[2] === "skills") {
    const { runSkillsCommand } = await import("../src/skills/index.mjs");
    process.exitCode = await runSkillsCommand(process.argv.slice(3));
    return;
  }
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return void process.stdout.write(HELP);
  if (opts.version) {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return void process.stdout.write(`${pkg.version}\n`);
  }
  if (opts.listTypes) {
    for (const t of listDiagramTypes())
      process.stdout.write(`${t.kind.padEnd(16)} @start${t.starts.join(", @start")}  ${t.title}\n`);
    return;
  }
  const limit = Math.min(
    MAX_INPUT_CEILING,
    Number.isFinite(opts.maxInputBytes) && opts.maxInputBytes > 0
      ? opts.maxInputBytes
      : 10 * 1024 * 1024,
  );
  const inputStat = !opts.project && opts.input && opts.input !== "-" ? statSync(opts.input) : null;
  const projectRoot = opts.project ?? (inputStat?.isDirectory() ? opts.input : null);
  if (projectRoot && opts.includeDir)
    throw new Error("--project and --include-dir cannot be combined");
  const ext = opts.output ? path.extname(opts.output).slice(1).toLowerCase() : "";
  const format = opts.format ?? (ext === "svg" || ext === "png" ? ext : "excalidraw");
  if (!["svg", "png", "excalidraw", "json"].includes(format))
    throw new Error(`Unknown format ${format}`);
  const legacyIncludes = opts.includeDir ? openProject(opts.includeDir) : null;
  const renderOptions = {
    theme: opts.theme,
    themeColors: readThemeEnvironment(process.env),
    sketch: opts.sketch,
    seed: opts.seed,
    page: opts.page,
    strict: opts.strict,
    defines: opts.defines,
    filename: opts.input ? path.basename(opts.input) : "",
    limits: { maxInputBytes: limit },
    include: legacyIncludes?.createResolver({ rootFallback: true }),
    sourcePath: inputStat ? (legacyIncludes?.sourcePath(opts.input) ?? undefined) : undefined,
  };
  let results;
  let total;
  if (projectRoot) {
    const project = prepareProject(
      openProject(projectRoot),
      opts.project ? opts.inputs : opts.inputs.slice(1),
      renderOptions,
      opts.all === true,
    );
    results = renderProject(project, renderOptions);
    total = project.jobs.length;
  } else {
    if (inputStat?.size > limit) throw new Error(`Input exceeds ${limit} bytes`);
    const source = inputStat ? readFileSync(opts.input, "utf8") : await readStdin(limit);
    const rendered = opts.all
      ? await renderAll(source, renderOptions)
      : [await render(source, renderOptions)];
    results = rendered.map((result, index) => ({ result, sourcePath: "", index }));
    total = results.length;
  }
  for await (const { result: r, sourcePath, index } of results) {
    if (!opts.quiet)
      for (const d of r.diagnostics)
        process.stderr.write(
          `${sourcePath ? `${sourcePath}: ` : ""}warning${d.line ? ` (line ${d.line})` : ""}: ${d.message}\n`,
        );
    const data = await encode(r, opts, format);
    if (!opts.output) {
      if (format === "png" && process.stdout.isTTY)
        throw new Error("Refusing to write PNG to a terminal; use -o");
      process.stdout.write(data);
      continue;
    }
    const numbered = total > 1 || (projectRoot && opts.all && opts.output.includes("{n}"));
    const file = numbered
      ? opts.output.includes("{n}")
        ? opts.output.replace("{n}", String(index + 1))
        : opts.output.replace(/(\.[^.]+)?$/, `-${index + 1}$1`)
      : opts.output;
    writeFileSync(file, data);
  }
}

// Closing the pipe early (`| head`) is not an error.
process.stdout.on("error", (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === "EPIPE") process.exit(0);
  throw err;
});

main().catch((err) => {
  process.stderr.write(`excaliplant: ${err?.message ?? err}\n`);
  process.exitCode = 1;
});
