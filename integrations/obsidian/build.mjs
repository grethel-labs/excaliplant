#!/usr/bin/env node
/**
 * Bundle the Obsidian plugin into `main.js`.
 *
 *   node build.mjs [--version x.y.z] [--out <file>] [--minify] [--check]
 *
 * Used by `npm run build` here and by `scripts/build-obsidian.mjs`. The bundle
 * targets the browser (Obsidian desktop and mobile): Node built-ins are not
 * marked external, so a Node-only import fails the build instead of crashing
 * the plugin on a phone. The few Node-only spots in `src/` are replaced by the
 * files in `shims/` (see `docs/obsidian.md`); `src/` itself is not modified.
 * @module integrations/obsidian/build
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const BANNER = `/*
Excaliplant for Obsidian: bundled with esbuild from
https://github.com/grethel-labs/excaliplant (integrations/obsidian).
Source and license: https://github.com/grethel-labs/excaliplant
*/`;

/** Modules provided by Obsidian at runtime. */
export const EXTERNALS = [
  "obsidian",
  "electron",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
];

/**
 * Load esbuild from this directory's `node_modules`.
 * @returns {Promise<typeof import("esbuild") | null>} `null` when it is not installed.
 */
export async function loadEsbuild() {
  try {
    const require = createRequire(path.join(here, "package.json"));
    return await import(pathToFileURL(require.resolve("esbuild")).href);
  } catch {
    return null;
  }
}

/** esbuild plugin that swaps the Node-only modules of `src/` for browser shims. */
function nodeShims() {
  const shim = (/** @type {string} */ name) => path.join(here, "shims", name);
  const target = (/** @type {string} */ name) => path.join(repoRoot, "src", "render", name);
  /** @type {(args: import("esbuild").OnResolveArgs, name: string) => boolean} */
  const isTarget = (args, name) =>
    args.path.startsWith(".") && path.resolve(args.resolveDir, args.path) === target(name);
  return {
    name: "excaliplant-node-shims",
    /** @param {import("esbuild").PluginBuild} build */
    setup(build) {
      build.onResolve({ filter: /^node:crypto$|^crypto$/ }, () => ({ path: shim("crypto.js") }));
      build.onResolve({ filter: /^node:module$|^module$/ }, () => ({ path: shim("module.js") }));
      build.onResolve({ filter: /\/font\.mjs$/ }, (args) =>
        isTarget(args, "font.mjs") ? { path: shim("font.js") } : undefined,
      );
      build.onResolve({ filter: /\/png\.mjs$/ }, (args) =>
        isTarget(args, "png.mjs") ? { path: shim("png.js") } : undefined,
      );
    },
  };
}

/**
 * Bundle the plugin.
 * @param {{ version?: string, outfile?: string, minify?: boolean, metafile?: boolean }} [options]
 * @returns {Promise<{ outfile: string, text: string, metafile?: import("esbuild").Metafile }>}
 */
export async function bundle(options = {}) {
  const esbuild = await loadEsbuild();
  if (!esbuild) {
    throw new Error("esbuild is not installed. Run `npm ci` in integrations/obsidian first.");
  }
  const version = options.version ?? "0.0.0";
  const outfile = path.resolve(options.outfile ?? path.join(here, "main.js"));
  const result = await esbuild.build({
    entryPoints: [path.join(here, "src", "main.js")],
    outfile,
    write: false,
    metafile: options.metafile === true,
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2021",
    external: EXTERNALS,
    banner: { js: BANNER },
    loader: { ".woff2": "base64" },
    legalComments: "none",
    minify: options.minify !== false,
    sourcemap: false,
    treeShaking: true,
    logLevel: "silent",
    // Deterministic output: no absolute paths or timestamps end up in the bundle.
    absWorkingDir: repoRoot,
    plugins: [nodeShims()],
    define: { __EXCALIPLANT_VERSION__: JSON.stringify(version) },
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error("esbuild produced no output");
  return { outfile, text: file.text, metafile: result.metafile };
}

/** @param {string[]} argv */
async function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--minify" || a === "--check") args.set(a, true);
    else if (a === "--version" || a === "--out") args.set(a, argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  const { writeFile } = await import("node:fs/promises");
  const result = await bundle({
    version: /** @type {string | undefined} */ (args.get("--version")),
    outfile: /** @type {string | undefined} */ (args.get("--out")),
    minify: true,
  });
  if (args.get("--check")) {
    process.stdout.write(`main.js builds (${result.text.length} bytes)\n`);
    return;
  }
  await writeFile(result.outfile, result.text);
  process.stdout.write(`wrote ${result.outfile} (${result.text.length} bytes)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
