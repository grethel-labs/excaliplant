/**
 * `excaliplant markdown …` — command logic with injected I/O. The module does
 * no file-system access itself; `bin/excaliplant.mjs` supplies real `io`.
 * @module markdown/cli
 */

import path from "node:path";
import { readThemeEnvironment } from "../draw/theme_env.mjs";
import { THEME_NAMES } from "../draw/theme.mjs";
import { renderMarkdown } from "./document.mjs";

/**
 * I/O the command needs. Paths are passed through exactly as given on the
 * command line (assets are joined onto the target document's directory).
 * @typedef {object} MarkdownIo
 * @property {(file: string) => Promise<string>} readFile UTF-8 text; rejects when missing.
 * @property {(file: string, data: string) => Promise<void>} writeFile UTF-8 text; creates parent directories.
 * @property {() => Promise<string>} [readStdin] Needed for the `-` input.
 * @property {{ write(chunk: string): unknown }} stdout
 * @property {{ write(chunk: string): unknown }} stderr
 * @property {import("../core/preprocess/preprocessor.mjs").IncludeResolver} [include] Optional `!include` resolver.
 * @property {(root: string, input: string) => { include: import("../core/preprocess/preprocessor.mjs").IncludeResolver, sourcePath: string }} [openIncludes] File resolver for an opted-in directory.
 */

export const MARKDOWN_HELP = `excaliplant markdown — render PlantUML code blocks in Markdown

Usage:
  excaliplant markdown <file.md | -> [more files] [options]

Without -o / --in-place the result goes to stdout (single input only).

Options:
  -o, --output <file>       Write the result to <file> (single input)
  -i, --in-place            Rewrite the input files (implies --keep-source)
      --mode <inline|file>  inline: <div> with SVG (default); file: assets/<hash>.svg + image link
      --assets-dir <dir>    Asset directory for --mode file, relative to the output (default: assets)
      --include-dir <dir>   Allow local PlantUML references and !include below <dir>
      --keep-source[=how]   Keep the PlantUML text as a comment (how: comment | details)
      --no-keep-source      Drop the source (default unless --in-place)
      --check               Write nothing; exit 1 if a file (or asset) would change
  -t, --theme <name>        ${THEME_NAMES.join(" | ")} (default: sketch)
      --clean               Clean strokes instead of the hand-drawn look
      --seed <value>        Seed for stroke wobble
      --width <px>          Scale every diagram to this width
      --max-blocks <n>      Diagram budget per document (default 50)
  -q, --quiet               Do not print warnings
  -h, --help                Show this help

Fences opened with plantuml, puml or uml are rendered. Per block:
  \`\`\`plantuml {theme=dark clean width=600 seed=x alt="Login flow"}

Exit codes: 0 ok, 1 render errors or --check found changes, 2 usage error.
`;

/** Raised for command-line mistakes (exit code 2). */
class UsageError extends Error {}

/**
 * @typedef {object} ParsedArgs
 * @property {string[]} inputs
 * @property {string} [output]
 * @property {boolean} inPlace
 * @property {"inline" | "file"} mode
 * @property {string} [assetsDir]
 * @property {string} [includeDir]
 * @property {false | "comment" | "details" | undefined} keep
 * @property {boolean} check
 * @property {string} [theme]
 * @property {boolean} clean
 * @property {string} [seed]
 * @property {number} [width]
 * @property {number} [maxBlocks]
 * @property {boolean} quiet
 * @property {boolean} help
 */

/**
 * @param {string[]} argv
 * @returns {ParsedArgs}
 */
function parseArgs(argv) {
  /** @type {ParsedArgs} */
  const a = {
    inputs: [],
    inPlace: false,
    mode: "inline",
    keep: undefined,
    check: false,
    clean: false,
    quiet: false,
    help: false,
  };
  let rest = false;
  for (let i = 0; i < argv.length; i++) {
    let arg = String(argv[i]);
    if (rest || arg === "-" || !arg.startsWith("-")) {
      a.inputs.push(arg);
      continue;
    }
    if (arg === "--") {
      rest = true;
      continue;
    }
    /** @type {string | undefined} */
    let inline;
    if (arg.startsWith("--") && arg.includes("=")) {
      inline = arg.slice(arg.indexOf("=") + 1);
      arg = arg.slice(0, arg.indexOf("="));
    }
    const value = () => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`Missing value for ${arg}`);
      return String(v);
    };
    switch (arg) {
      case "-o":
      case "--output":
        a.output = value();
        break;
      case "-i":
      case "--in-place":
        a.inPlace = true;
        break;
      case "--mode": {
        const m = value();
        if (m !== "inline" && m !== "file") throw new UsageError(`Unknown mode "${m}"`);
        a.mode = m;
        break;
      }
      case "--assets-dir":
        a.assetsDir = value();
        break;
      case "--include-dir":
        a.includeDir = value();
        if (!a.includeDir) throw new UsageError("--include-dir needs a directory");
        break;
      case "--keep-source": {
        const how = inline ?? "comment";
        if (how !== "comment" && how !== "details")
          throw new UsageError(`Unknown --keep-source "${how}"`);
        a.keep = how;
        break;
      }
      case "--no-keep-source":
        a.keep = false;
        break;
      case "--check":
        a.check = true;
        break;
      case "-t":
      case "--theme": {
        const t = value();
        if (!THEME_NAMES.includes(t)) {
          throw new UsageError(`Unknown theme "${t}" (available: ${THEME_NAMES.join(", ")})`);
        }
        a.theme = t;
        break;
      }
      case "--clean":
        a.clean = true;
        break;
      case "--seed":
        a.seed = value();
        break;
      case "--width": {
        const w = Number(value());
        if (!Number.isFinite(w) || w < 16 || w > 16_000) {
          throw new UsageError("--width must be between 16 and 16000");
        }
        a.width = Math.round(w);
        break;
      }
      case "--max-blocks": {
        const n = Number(value());
        if (!Number.isInteger(n) || n < 0) throw new UsageError("--max-blocks must be an integer");
        a.maxBlocks = n;
        break;
      }
      case "-q":
      case "--quiet":
        a.quiet = true;
        break;
      case "-h":
      case "--help":
        a.help = true;
        break;
      default:
        throw new UsageError(`Unknown option ${arg}`);
    }
  }
  return a;
}

/**
 * @param {MarkdownIo} io
 * @param {string} file
 * @returns {Promise<string | null>}
 */
async function readOptional(io, file) {
  try {
    return await io.readFile(file);
  } catch {
    return null;
  }
}

/**
 * Run `excaliplant markdown`. Never throws; resolves to the process exit code
 * (0 success, 1 render errors or `--check` found stale files, 2 usage error).
 * @param {string[]} argv Arguments after the `markdown` word.
 * @param {MarkdownIo} io
 * @returns {Promise<number>}
 * @public
 */
export async function runMarkdownCommand(argv, io) {
  /** @type {ParsedArgs} */
  let args;
  try {
    args = parseArgs(argv);
    if (args.help) {
      io.stdout.write(MARKDOWN_HELP);
      return 0;
    }
    if (args.inputs.length === 0) throw new UsageError("No input file given (use - for stdin)");
    if (args.output !== undefined && args.inPlace) {
      throw new UsageError("--output and --in-place cannot be combined");
    }
    if (args.output !== undefined && args.inputs.length > 1) {
      throw new UsageError("--output needs exactly one input");
    }
    if (args.output === undefined && !args.inPlace && !args.check && args.inputs.length > 1) {
      throw new UsageError("Several inputs need --in-place (or --check)");
    }
    if (args.check && args.output === undefined && args.inputs.includes("-")) {
      throw new UsageError("--check with stdin needs --output");
    }
    if (args.includeDir && !io.openIncludes)
      throw new UsageError("Filesystem includes are unavailable");
  } catch (err) {
    io.stderr.write(`excaliplant markdown: ${/** @type {Error} */ (err).message}\n`);
    if (err instanceof UsageError)
      io.stderr.write("Run 'excaliplant markdown --help' for usage.\n");
    return 2;
  }

  let code = 0;
  for (const input of args.inputs) {
    try {
      code = Math.max(code, await processFile(input, args, io));
    } catch (err) {
      io.stderr.write(`${input}: error: ${/** @type {Error} */ (err)?.message ?? String(err)}\n`);
      code = Math.max(code, 1);
    }
  }
  return code;
}

/**
 * @param {string} input
 * @param {ParsedArgs} args
 * @param {MarkdownIo} io
 * @returns {Promise<number>}
 */
async function processFile(input, args, io) {
  const isStdin = input === "-";
  let text;
  if (isStdin) {
    if (!io.readStdin) throw new Error("Reading from stdin is not available");
    text = await io.readStdin();
  } else text = await io.readFile(input);

  const target = args.output ?? (!isStdin && (args.inPlace || args.check) ? input : null);
  const keepSource = args.keep ?? (target !== null && target === input ? "comment" : undefined);
  const docDir = path.dirname(target ?? (isStdin ? "." : input));
  const label = isStdin ? "<stdin>" : input;
  const includes = args.includeDir ? io.openIncludes(args.includeDir, input) : null;

  const result = await renderMarkdown(text, {
    mode: args.mode,
    assetsDir: args.assetsDir,
    keepSource,
    theme: args.theme,
    themeColors: readThemeEnvironment(process.env),
    clean: args.clean || undefined,
    seed: args.seed,
    width: args.width,
    filename: isStdin ? undefined : path.basename(input),
    include: includes?.include ?? io.include,
    sourcePath: includes?.sourcePath,
    strictIncludes: includes ? true : undefined,
    budget: args.maxBlocks === undefined ? undefined : { maxBlocks: args.maxBlocks },
  });

  let failed = false;
  for (const b of result.blocks) {
    if (b.error !== undefined) {
      failed = true;
      io.stderr.write(`${label}:${b.line + (b.errorLine ?? 0)}: error: ${b.error}\n`);
    } else if (!args.quiet) {
      for (const d of b.diagnostics) {
        io.stderr.write(`${label}:${b.line + (d.line ?? 0)}: ${d.severity}: ${d.message}\n`);
      }
    }
  }

  /** @param {string} name */
  const assetPath = (name) => path.join(docDir, ...name.split("/"));

  if (args.check) {
    if (target === null) throw new Error("Nothing to compare against");
    const existing = target === input ? text : await readOptional(io, target);
    let stale = existing !== result.markdown;
    for (const asset of result.assets) {
      if (!stale && (await readOptional(io, assetPath(asset.name))) !== asset.data) stale = true;
    }
    if (stale) {
      io.stderr.write(`${target}: out of date; run 'excaliplant markdown' to update it\n`);
      return 1;
    }
    return failed ? 1 : 0;
  }

  if (target === null) {
    io.stdout.write(result.markdown);
  } else {
    const existing = target === input ? text : await readOptional(io, target);
    if (existing !== result.markdown) await io.writeFile(target, result.markdown);
    for (const asset of result.assets) {
      const file = assetPath(asset.name);
      if ((await readOptional(io, file)) !== asset.data) await io.writeFile(file, asset.data);
    }
  }
  return failed ? 1 : 0;
}
