#!/usr/bin/env node
// Build and package the VS Code extension in integrations/vscode.
//
//   node scripts/build-vscode.mjs                    bundle + .vsix into integrations/vscode/dist/
//   node scripts/build-vscode.mjs --version 1.4.0    same, with the extension version set to 1.4.0
//   node scripts/build-vscode.mjs --bundle-only      only integrations/vscode/dist/extension.js
//   node scripts/build-vscode.mjs --icon             regenerate integrations/vscode/icon.png
//
// Packaging happens in a temporary staging directory, so the working tree is
// never modified (the version is set in the staged copy of package.json, and the
// LICENSE files are copied from the repository root). The last line printed on
// stdout is the absolute path of the .vsix; progress goes to stderr.
//
// esbuild and @vscode/vsce are devDependencies of integrations/vscode (run
// `npm ci` there first). Nothing here is part of the npm package.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");
export const EXT_DIR = path.join(ROOT, "integrations", "vscode");
export const ENTRY = path.join(EXT_DIR, "src", "main.mjs");
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Files and folders of the extension that go into the .vsix (besides the bundle). */
const PAYLOAD = [
  "README.md",
  "CHANGELOG.md",
  "icon.png",
  "language-configuration.json",
  "syntaxes",
  "media",
  ".vscodeignore",
];

/**
 * Resolve a devDependency of the extension (not of the repository root).
 * @param {string} id
 * @returns {string | null} Absolute path of the resolved entry, or null when not installed.
 */
function resolveFromExtension(id) {
  try {
    return createRequire(path.join(EXT_DIR, "package.json")).resolve(id);
  } catch {
    return null;
  }
}

/** @returns {boolean} Whether esbuild is installed in integrations/vscode. */
export function esbuildAvailable() {
  return resolveFromExtension("esbuild") !== null;
}

/** @returns {boolean} Whether @vscode/vsce is installed in integrations/vscode. */
export function vsceAvailable() {
  return resolveFromExtension("@vscode/vsce/package.json") !== null;
}

/** @returns {string} Version of the repository's package, the default for the bundle. */
function rootVersion() {
  return String(JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version);
}

/**
 * esbuild plugin that makes the Node-only sources bundle-safe without touching
 * them: the font is embedded instead of read from disk, the package version is
 * a constant instead of a `require("../../package.json")`, and the native PNG
 * rasteriser (resvg) is replaced by a stub, because native modules cannot be
 * shipped in a platform-independent .vsix.
 * @param {string} version Version stored in the cache keys of the renderer.
 * @returns {import("esbuild").Plugin}
 */
function excaliplantPlugin(version) {
  const fontFile = path.join(ROOT, "src", "render", "font.mjs");
  const renderFile = path.join(ROOT, "src", "markdown", "render.mjs");
  const woff2 = path.join(ROOT, "assets", "fonts", "Excalifont-Regular.woff2");
  return {
    name: "excaliplant-vscode",
    setup(build) {
      build.onLoad({ filter: /[\\/]font\.mjs$/ }, (args) => {
        if (args.path !== fontFile) return undefined;
        const original = readFileSync(fontFile, "utf8");
        const face = /`(@font-face\{[^`]*)\$\{b64\}([^`]*)`/.exec(original);
        if (!face || !original.includes("export function excalifontFaceCss")) {
          throw new Error("src/render/font.mjs changed shape; update scripts/build-vscode.mjs");
        }
        const b64 = readFileSync(woff2).toString("base64");
        return {
          loader: "js",
          contents:
            `export const EXCALIFONT_TTF_PATH = "";\n` +
            `const FACE = ${JSON.stringify(`${face[1]}${b64}${face[2]}`)};\n` +
            `export function excalifontFaceCss() { return FACE; }\n`,
        };
      });
      build.onLoad({ filter: /[\\/]render\.mjs$/ }, (args) => {
        if (args.path !== renderFile) return undefined;
        const original = readFileSync(renderFile, "utf8");
        const expr = /createRequire\(import\.meta\.url\)\("\.\.\/\.\.\/package\.json"\)/;
        if (!expr.test(original)) {
          throw new Error("src/markdown/render.mjs changed shape; update scripts/build-vscode.mjs");
        }
        return {
          loader: "js",
          resolveDir: path.dirname(renderFile),
          contents: original.replace(expr, `({ version: ${JSON.stringify(version)} })`),
        };
      });
      build.onResolve({ filter: /^@resvg\/resvg-js$/ }, () => ({
        path: "resvg-stub",
        namespace: "excaliplant-stub",
      }));
      build.onLoad({ filter: /.*/, namespace: "excaliplant-stub" }, () => ({
        loader: "js",
        contents:
          "export class Resvg { constructor() { throw new Error(" +
          '"PNG output is not available in the VS Code extension"); } }\n',
      }));
    },
  };
}

/**
 * Bundle the extension into one CommonJS file that needs no `node_modules`.
 * @param {{ outfile?: string, version?: string, minify?: boolean }} [options]
 * @returns {Promise<{ outfile: string, bytes: number, inputs: number }>}
 */
export async function bundle(options = {}) {
  const esbuildPath = resolveFromExtension("esbuild");
  if (!esbuildPath) {
    throw new Error("esbuild is not installed. Run `npm ci` in integrations/vscode first.");
  }
  const esbuild = createRequire(import.meta.url)(esbuildPath);
  const outfile = options.outfile ?? path.join(EXT_DIR, "dist", "extension.js");
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    external: ["vscode"],
    minify: options.minify !== false,
    sourcemap: false,
    legalComments: "none",
    metafile: true,
    logLevel: "warning",
    plugins: [excaliplantPlugin(options.version ?? rootVersion())],
  });
  return {
    outfile,
    bytes: statSync(outfile).size,
    inputs: Object.keys(result.metafile.inputs).length,
  };
}

/**
 * Copy the files of the extension that belong into the package.
 * @param {string} stage Empty directory.
 * @param {string} version
 */
function stageFiles(stage, version) {
  for (const name of PAYLOAD) {
    const from = path.join(EXT_DIR, name);
    if (!existsSync(from)) throw new Error(`Missing ${path.relative(ROOT, from)}`);
    cpSync(from, path.join(stage, name), { recursive: true });
  }
  const manifest = JSON.parse(readFileSync(path.join(EXT_DIR, "package.json"), "utf8"));
  manifest.version = version;
  // Build-time only: neither scripts nor devDependencies belong into the package.
  delete manifest.scripts;
  delete manifest.devDependencies;
  writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  copyFileSync(path.join(ROOT, "LICENSE"), path.join(stage, "LICENSE"));
  copyFileSync(
    path.join(ROOT, "THIRD_PARTY_NOTICES.md"),
    path.join(stage, "THIRD_PARTY_NOTICES.md"),
  );
  copyFileSync(
    path.join(ROOT, "assets", "fonts", "LICENSE.txt"),
    path.join(stage, "LICENSE-Excalifont.txt"),
  );
}

/**
 * Build the bundle and the .vsix.
 * @param {{ version?: string, outDir?: string, log?: (message: string) => void }} [options]
 * @returns {Promise<{ vsix: string, bytes: number, bundleBytes: number, version: string }>}
 */
export async function packageVsix(options = {}) {
  const log = options.log ?? (() => {});
  const version = options.version ?? "0.0.0";
  if (!SEMVER.test(version)) throw new Error(`Invalid version "${version}" (expected x.y.z)`);
  const vsce = resolveFromExtension("@vscode/vsce/package.json");
  if (!vsce) throw new Error("@vscode/vsce is not installed. Run `npm ci` in integrations/vscode.");
  const vsceDir = path.dirname(vsce);
  const vsceBin = path.join(vsceDir, JSON.parse(readFileSync(vsce, "utf8")).bin.vsce);
  const outDir = path.resolve(options.outDir ?? path.join(EXT_DIR, "dist"));
  mkdirSync(outDir, { recursive: true });
  // One .vsix per directory, so `publish:*` can use a glob without picking up stale files.
  for (const f of readdirSync(outDir)) if (f.endsWith(".vsix")) rmSync(path.join(outDir, f));

  const stage = mkdtempSync(path.join(tmpdir(), "excaliplant-vsix-"));
  try {
    const built = await bundle({
      outfile: path.join(stage, "dist", "extension.js"),
      version: version === "0.0.0" ? rootVersion() : version,
    });
    log(`bundle: ${built.bytes} bytes from ${built.inputs} modules`);
    stageFiles(stage, version);
    const vsix = path.join(outDir, `excaliplant-${version}.vsix`);
    const run = spawnSync(
      process.execPath,
      [vsceBin, "package", "--no-dependencies", "--out", vsix],
      { cwd: stage, encoding: "utf8" },
    );
    if (run.status !== 0) {
      throw new Error(`vsce package failed:\n${run.stdout ?? ""}${run.stderr ?? ""}`);
    }
    log(String(run.stdout).trim());
    return { vsix, bytes: statSync(vsix).size, bundleBytes: built.bytes, version };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * Regenerate `icon.png` (128x128 by default) from a diagram rendered by
 * excaliplant itself. The output is deterministic. Needs the repository's own
 * dependencies.
 * @param {string} [outfile]
 * @param {number} [size] Edge length in pixels; the drawing scales with it.
 * @returns {Promise<string>} Path of the written file.
 */
export async function generateIcon(outfile = path.join(EXT_DIR, "icon.png"), size = 128) {
  const { render } = await import(pathToFileURL(path.join(ROOT, "src", "api.mjs")).href);
  const { svgToPng } = await import(
    pathToFileURL(path.join(ROOT, "src", "render", "png.mjs")).href
  );
  const diagram = await render(
    "@startuml\nrectangle UML as a\nrectangle SVG as b\na --> b\n@enduml",
    { theme: "sketch", seed: 7 },
  );
  const inner = (await diagram.toSvg({ embedFont: false }))
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<svg\b([^>]*)>/, (_m, attrs) => {
      const clean = attrs.replace(/\s(?:width|height)="[^"]*"/g, "");
      return `<svg${clean} x="26" y="12" width="76" height="104">`;
    });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `viewBox="0 0 128 128" width="128" height="128">` +
    `<rect x="2" y="2" width="124" height="124" rx="24" fill="#ffffff" stroke="#1971c2" stroke-width="4"/>` +
    `${inner}</svg>`;
  writeFileSync(outfile, svgToPng(svg, { width: size }));
  return outfile;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const args = { version: "0.0.0", bundleOnly: false, icon: false, outDir: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bundle-only") args.bundleOnly = true;
    else if (a === "--icon") args.icon = true;
    else if (a === "--version" || a === "--out-dir") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      if (a === "--version") args.version = v.replace(/^v/, "");
      else args.outDir = v;
    } else if (a === "-h" || a === "--help") {
      process.stderr.write(
        readFileSync(fileURLToPath(import.meta.url), "utf8")
          .split("\n")
          .slice(1, 11)
          .map((l) => l.replace(/^\/\/ ?/, ""))
          .join("\n") + "\n",
      );
      process.exit(0);
    } else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (/** @type {string} */ m) => process.stderr.write(`${m}\n`);
  if (args.icon) {
    process.stdout.write(`${await generateIcon()}\n`);
    return;
  }
  if (args.bundleOnly) {
    const r = await bundle({ version: args.version === "0.0.0" ? undefined : args.version });
    log(`bundle: ${r.bytes} bytes from ${r.inputs} modules`);
    process.stdout.write(`${r.outfile}\n`);
    return;
  }
  const r = await packageVsix({ version: args.version, outDir: args.outDir, log });
  log(`vsix: ${r.bytes} bytes (version ${r.version})`);
  process.stdout.write(`${r.vsix}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    process.stderr.write(`build-vscode: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
}
