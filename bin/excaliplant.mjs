#!/usr/bin/env node
// excaliplant CLI.
//
// Usage:
//   excaliplant [--svg|--png|--excalidraw] [-o <out>] [--width N] [<input>]
//
// If <input> is omitted, PlantUML is read from stdin.
// If -o is omitted, output is written to stdout (binary for PNG).
//
// Examples:
//   excaliplant diagram.puml                       # excalidraw → stdout
//   excaliplant -o diagram.excalidraw diagram.puml
//   excaliplant --svg diagram.puml > out.svg
//   cat diagram.puml | excaliplant --png -o out.png --width 4800

import { readFile, writeFile } from "node:fs/promises";
import { renderPlantUml } from "../index.mjs";

// Hard limits to keep the CLI from being weaponised as a memory bomb.
const DEFAULT_MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MiB of PlantUML
const MAX_INPUT_BYTES_CEILING = 200 * 1024 * 1024; // hard ceiling for --max-input-bytes
const MAX_RENDER_WIDTH = 16000; // PNG/SVG canvas width upper bound
const MIN_RENDER_WIDTH = 16;

const HELP = `excaliplant — PlantUML → Excalidraw / SVG / PNG renderer.

Usage:
  excaliplant [options] [<input>]

Options:
  --excalidraw     Emit Excalidraw JSON (default).
  --svg            Emit a sketchy SVG.
  --png            Emit a sketchy PNG.
  -o, --out <f>    Write to file <f> instead of stdout.
  --width <n>      PNG width (default 4800) / SVG canvas width (default 1200).
                   Clamped to [${MIN_RENDER_WIDTH}, ${MAX_RENDER_WIDTH}].
  --label <s>      Source label written to appState.name.
  --no-canvas      For --svg: emit a tightly-cropped SVG without the 4:3 letterbox.
  --rng-seed <n>   Override the deterministic seed (use --rng-seed=random for non-determinism).
  --style <file>   Load a JSON or YAML style override (see style.example.json).
  --max-input-bytes <N>
                   Reject stdin/file input larger than N bytes
                   (default ${DEFAULT_MAX_INPUT_BYTES}, ceiling ${MAX_INPUT_BYTES_CEILING}).
  -h, --help       Show this message.
  -v, --version    Show package version.

Exit codes:
   0 success
   1 input error (oversized, parse error, render failure)
   2 CLI argument error
  64 unexpected internal error

Set DEBUG=1 to print full stack traces on failure.
`;

/**
 * Print a one-line error and exit with the given code.
 * @param {number} code
 * @param {string} msg
 * @internal
 */
function die(code, msg) {
  process.stderr.write(`excaliplant: ${msg}\n`);
  process.exit(code);
}

/**
 * Parse a CLI argument that must be a positive integer.
 * @param {string} raw
 * @param {string} flag
 * @returns {number}
 * @internal
 */
function parsePositiveInt(raw, flag) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    die(2, `${flag} expects a positive integer (got ${JSON.stringify(raw)})`);
  }
  return n;
}

/**
 * Parse `process.argv.slice(2)` into a normalised options object.
 * Validates ranges and exits with code 2 on bad input.
 * @param {string[]} argv
 * @returns {object}
 * @internal
 */
function parseArgs(argv) {
  const opts = { format: "excalidraw", canvas: true, maxInputBytes: DEFAULT_MAX_INPUT_BYTES };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--excalidraw":
        opts.format = "excalidraw";
        break;
      case "--svg":
        opts.format = "svg";
        break;
      case "--png":
        opts.format = "png";
        break;
      case "-o":
      case "--out":
        opts.out = argv[++i];
        break;
      case "--width": {
        const w = parsePositiveInt(argv[++i], "--width");
        if (w < MIN_RENDER_WIDTH || w > MAX_RENDER_WIDTH) {
          die(2, `--width out of range [${MIN_RENDER_WIDTH}, ${MAX_RENDER_WIDTH}] (got ${w})`);
        }
        opts.width = w;
        break;
      }
      case "--label":
        opts.label = argv[++i];
        break;
      case "--no-canvas":
        opts.canvas = false;
        break;
      case "--rng-seed":
        opts.rngSeed = argv[++i];
        break;
      case "--style":
        opts.styleFile = argv[++i];
        break;
      case "--max-input-bytes": {
        const n = parsePositiveInt(argv[++i], "--max-input-bytes");
        if (n > MAX_INPUT_BYTES_CEILING) {
          die(2, `--max-input-bytes exceeds ceiling ${MAX_INPUT_BYTES_CEILING}`);
        }
        opts.maxInputBytes = n;
        break;
      }
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.versionFlag = true;
        break;
      default:
        if (a.startsWith("-")) die(2, `unknown option: ${a}`);
        positional.push(a);
    }
  }
  if (positional.length > 1) die(2, "expected at most one positional <input> path");
  opts.input = positional[0];
  return opts;
}

/**
 * Read the PlantUML source either from the named file or from stdin,
 * enforcing the configured byte cap.
 * @param {string|undefined} file
 * @param {number} maxBytes
 * @returns {Promise<string>}
 * @internal
 */
async function readInput(file, maxBytes) {
  if (file) {
    // Stat first so we don't load multi-GB files into memory.
    const { stat } = await import("node:fs/promises");
    const st = await stat(file);
    if (st.size > maxBytes) {
      die(
        1,
        `input file ${file} is ${st.size} bytes, exceeds limit ${maxBytes} (raise with --max-input-bytes)`,
      );
    }
    return readFile(file, "utf8");
  }
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    process.stdin.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        process.stdin.destroy();
        reject(
          new Error(
            `stdin exceeded ${maxBytes} bytes (raise with --max-input-bytes); aborted at ${total}`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

/**
 * CLI entry point. Wired into `bin/excaliplant.mjs` shebang.
 * @returns {Promise<void>}
 * @internal
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }
  if (opts.versionFlag) {
    const { readFile: rf } = await import("node:fs/promises");
    const url = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(await rf(url, "utf8"));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  let text;
  try {
    text = await readInput(opts.input, opts.maxInputBytes);
  } catch (e) {
    die(1, e?.message || String(e));
  }

  if (opts.styleFile) {
    const { loadStyleFromFile } = await import("../src/general/style/style.mjs");
    loadStyleFromFile(opts.styleFile);
  }

  // Build deterministic / overridable RNG.
  let rng;
  if (opts.rngSeed === "random") {
    rng = Math.random;
  } else if (opts.rngSeed != null) {
    const { createSeededRng } = await import("../src/general/render/rng.mjs");
    rng = createSeededRng(Number(opts.rngSeed) >>> 0);
  }

  const result = renderPlantUml(text, {
    sourceLabel: opts.label ?? opts.input ?? "stdin",
    rng,
  });

  let payload;
  if (opts.format === "excalidraw") {
    const doc = await result;
    payload = JSON.stringify(doc, null, 2);
  } else if (opts.format === "svg") {
    const svgOpts = { canvas: opts.canvas };
    if (opts.width) svgOpts.width = opts.width;
    payload = await result.toSvg(svgOpts);
  } else if (opts.format === "png") {
    const pngOpts = {};
    if (opts.width) pngOpts.width = opts.width;
    payload = await result.toPng(pngOpts);
  }

  if (opts.out) {
    await writeFile(opts.out, payload);
  } else if (opts.format === "png") {
    process.stdout.write(payload);
  } else {
    process.stdout.write(`${payload}\n`);
  }
}

main().catch((e) => {
  if (process.env.DEBUG) {
    console.error(e?.stack || e);
  } else {
    console.error(`excaliplant: ${e?.message || e}`);
    console.error("  (set DEBUG=1 to see the full stack trace)");
  }
  process.exit(64);
});
