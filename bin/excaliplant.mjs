#!/usr/bin/env node
// excaliplant CLI: file/stdin I/O and option parsing only. All rendering
// logic lives in src/.

import { readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { render, renderAll, listDiagramTypes, THEME_NAMES } from "../src/index.mjs";

const HELP = `excaliplant — render PlantUML as hand-drawn Excalidraw, SVG or PNG

Usage:
  excaliplant [input.puml] [-o output] [options]
  cat diagram.puml | excaliplant -f svg > diagram.svg

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
  return opts;
}

/**
 * Resolver for `!include` restricted to one directory tree.
 * @param {string} root
 */
function includeResolver(root) {
  const base = realpathSync(root);
  return (/** @type {string} */ target, /** @type {{ kind: string }} */ ctx) => {
    if (ctx.kind !== "file") return null;
    try {
      const resolved = realpathSync(path.resolve(base, target));
      if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
      if (statSync(resolved).size > 2 * 1024 * 1024) return null;
      return readFileSync(resolved, "utf8");
    } catch {
      return null;
    }
  };
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

async function main() {
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
  let source;
  if (!opts.input || opts.input === "-") source = await readStdin(limit);
  else {
    if (statSync(opts.input).size > limit) throw new Error(`Input exceeds ${limit} bytes`);
    source = readFileSync(opts.input, "utf8");
  }
  const ext = opts.output ? path.extname(opts.output).slice(1).toLowerCase() : "";
  const format = opts.format ?? (ext === "svg" || ext === "png" ? ext : "excalidraw");
  if (!["svg", "png", "excalidraw", "json"].includes(format))
    throw new Error(`Unknown format ${format}`);
  const renderOptions = {
    theme: opts.theme,
    sketch: opts.sketch,
    seed: opts.seed,
    page: opts.page,
    strict: opts.strict,
    defines: opts.defines,
    filename: opts.input ? path.basename(opts.input) : "",
    limits: { maxInputBytes: limit },
    include: opts.includeDir ? includeResolver(opts.includeDir) : undefined,
  };
  const results = opts.all
    ? await renderAll(source, renderOptions)
    : [await render(source, renderOptions)];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!opts.quiet)
      for (const d of r.diagnostics)
        process.stderr.write(`warning${d.line ? ` (line ${d.line})` : ""}: ${d.message}\n`);
    const data = await encode(r, opts, format);
    if (!opts.output) {
      if (format === "png" && process.stdout.isTTY)
        throw new Error("Refusing to write PNG to a terminal; use -o");
      process.stdout.write(data);
      continue;
    }
    const file =
      results.length > 1
        ? opts.output.includes("{n}")
          ? opts.output.replace("{n}", String(i + 1))
          : opts.output.replace(/(\.[^.]+)?$/, `-${i + 1}$1`)
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
