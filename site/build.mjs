/**
 * Browser bundles of the GitHub Pages site (esbuild), built from `site/` and
 * `src/`; `src/` itself is not modified.
 *
 *   worker.js   the library + message protocol (loaded as a Worker)
 *   app.js      the page: playground, gallery, editor (no library code)
 *   boot.js     tiny blocking script that applies the saved colour theme
 *   styles.css
 *
 * The Node-only spots of `src/` (font file, resvg) are swapped for the shims
 * the Obsidian plugin already uses (`integrations/obsidian/shims`).
 * @module site/build
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
const shims = path.join(ROOT, "integrations", "obsidian", "shims");

const BANNER = "/* excaliplant site: https://github.com/grethel-labs/excaliplant (MIT) */";

/** Swap `src/render/font.mjs` and `png.mjs` for their browser shims. */
function nodeShims() {
  const target = (/** @type {string} */ name) => path.join(ROOT, "src", "render", name);
  return {
    name: "excaliplant-node-shims",
    /** @param {import("esbuild").PluginBuild} build */
    setup(build) {
      for (const [name, shim] of [
        ["font.mjs", "font.js"],
        ["png.mjs", "png.js"],
      ]) {
        build.onResolve({ filter: new RegExp(`/${name.replace(".", "\\.")}$`) }, (args) =>
          args.path.startsWith(".") && path.resolve(args.resolveDir, args.path) === target(name)
            ? { path: path.join(shims, shim) }
            : undefined,
        );
      }
    },
  };
}

/** Serve `virtual:examples` from the list passed to {@link bundleApp}. */
function examplesModule(/** @type {object[]} */ examples) {
  return {
    name: "excaliplant-examples",
    /** @param {import("esbuild").PluginBuild} build */
    setup(build) {
      build.onResolve({ filter: /^virtual:examples$/ }, () => ({
        path: "examples",
        namespace: "excaliplant-examples",
      }));
      build.onLoad({ filter: /.*/, namespace: "excaliplant-examples" }, () => ({
        contents: `export default ${JSON.stringify(examples)};`,
        loader: "js",
      }));
    },
  };
}

/**
 * Compile one entry to a classic (non-module) script: it must also run from
 * file://, where browsers refuse module scripts.
 * @param {string} entry
 * @param {import("esbuild").BuildOptions} [extra]
 * @returns {Promise<string>}
 */
async function bundle(entry, extra = {}) {
  const result = await esbuild.build({
    entryPoints: [path.join(here, entry)],
    write: false,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2021",
    minify: true,
    legalComments: "none",
    banner: { js: BANNER },
    treeShaking: true,
    logLevel: "silent",
    absWorkingDir: ROOT,
    ...extra,
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error(`esbuild produced no output for ${entry}`);
  return file.text;
}

/**
 * @param {{ version?: string | null }} [options]
 * @returns {Promise<string>} Worker script (library + protocol).
 */
export function bundleWorker(options = {}) {
  return bundle("worker.mjs", {
    plugins: [nodeShims()],
    loader: { ".woff2": "base64" },
    define: { __SITE_VERSION__: JSON.stringify(options.version ?? "dev") },
  });
}

/**
 * @param {{ examples: object[] }} options Flat example list (see `playground/examples.mjs`).
 * @returns {Promise<string>}
 */
export function bundleApp(options) {
  return bundle("app.mjs", { plugins: [examplesModule(options.examples)] });
}

/** @returns {Promise<string>} */
export function bundleBoot() {
  return bundle("boot.mjs");
}

/** @returns {Promise<string>} Minified stylesheet. */
export async function buildStyles() {
  const css = readFileSync(path.join(here, "styles.css"), "utf8");
  return (await esbuild.transform(css, { loader: "css", minify: true })).code;
}
