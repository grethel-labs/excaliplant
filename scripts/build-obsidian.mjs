#!/usr/bin/env node
// Build the release files of the Obsidian plugin (integrations/obsidian).
//
//   node scripts/build-obsidian.mjs --version 1.2.3 --out dist-obsidian [--base-versions <file>] [--repo-files]
//
// Writes main.js, manifest.json (with the given version), versions.json and
// styles.css into --out; with --repo-files also README.md, LICENSE,
// THIRD_PARTY_NOTICES.md and Excalifont-OFL.txt (the files a plugin repository
// needs in its root). The source tree is never modified, and the output is
// byte-reproducible for the same inputs. Requires `npm ci` in
// integrations/obsidian (esbuild is a devDependency of the plugin only).

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(root, "integrations", "obsidian");

const USAGE = `Usage: node scripts/build-obsidian.mjs --version <x.y.z> --out <dir> [options]

  --version <x.y.z>        plugin version (Obsidian accepts exactly x.y.z, no "v")
  --out <dir>              directory for the release files (created if missing)
  --base-versions <file>   existing versions.json to extend (default: integrations/obsidian/versions.json;
                           a missing file given here counts as empty)
  --repo-files             also write README.md, LICENSE, THIRD_PARTY_NOTICES.md, Excalifont-OFL.txt
`;

/**
 * @param {string[]} argv
 * @returns {{ version: string, out: string, baseVersions: string, baseVersionsGiven: boolean, repoFiles: boolean }}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo-files") o.repoFiles = true;
    else if (a === "--version" || a === "--out" || a === "--base-versions") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value`);
      o[a.slice(2)] = v;
    } else throw new UsageError(`Unknown argument: ${a}`);
  }
  const version = String(o.version ?? "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new UsageError(
      `--version must be x.y.z without a "v" prefix or suffix (got ${JSON.stringify(version)})`,
    );
  }
  if (!o.out) throw new UsageError("--out is required");
  return {
    version,
    out: path.resolve(String(o.out)),
    baseVersions: o["base-versions"]
      ? path.resolve(String(o["base-versions"]))
      : path.join(pluginDir, "versions.json"),
    baseVersionsGiven: Boolean(o["base-versions"]),
    repoFiles: o.repoFiles === true,
  };
}

class UsageError extends Error {}

/** @param {string} v */
const semverKey = (v) => v.split(".").map(Number);

/**
 * Add this release to versions.json (version → minAppVersion), sorted, without the 0.0.0 placeholder.
 * @param {unknown} base
 * @param {string} version
 * @param {string} minAppVersion
 * @returns {Record<string, string>}
 */
export function buildVersions(base, version, minAppVersion) {
  /** @type {Record<string, string>} */
  const merged = {};
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    throw new Error("versions.json must be a JSON object");
  }
  for (const [k, v] of Object.entries(base)) {
    if (/^\d+\.\d+\.\d+$/.test(k) && typeof v === "string" && k !== "0.0.0") merged[k] = v;
  }
  merged[version] = minAppVersion;
  return Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => {
      const x = semverKey(a);
      const y = semverKey(b);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    }),
  );
}

/** @param {string} file */
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/** @param {string[]} argv */
async function main(argv) {
  const opts = parseArgs(argv);
  const { bundle, loadEsbuild } = await import(
    pathToFileURL(path.join(pluginDir, "build.mjs")).href
  );
  if (!(await loadEsbuild())) {
    throw new Error("esbuild is not installed. Run `npm ci` in integrations/obsidian first.");
  }

  const manifest = await readJson(path.join(pluginDir, "manifest.json"));
  manifest.version = opts.version;
  // A fresh plugin repository has no versions.json yet: start from an empty history.
  const base = await readJson(opts.baseVersions).catch((err) => {
    if (err?.code === "ENOENT" && opts.baseVersionsGiven) return {};
    throw err;
  });
  const versions = buildVersions(base, opts.version, String(manifest.minAppVersion));
  const built = await bundle({ version: opts.version, minify: true });

  await mkdir(opts.out, { recursive: true });
  /** @type {[string, string | Buffer][]} */
  const files = [
    ["main.js", built.text],
    ["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
    ["versions.json", `${JSON.stringify(versions, null, 2)}\n`],
    ["styles.css", await readFile(path.join(pluginDir, "styles.css"))],
  ];
  for (const [name, data] of files) await writeFile(path.join(opts.out, name), data);
  if (opts.repoFiles) {
    const extra = [
      [path.join(pluginDir, "README.md"), "README.md"],
      [path.join(root, "LICENSE"), "LICENSE"],
      [path.join(pluginDir, "THIRD_PARTY_NOTICES.md"), "THIRD_PARTY_NOTICES.md"],
      [path.join(root, "assets", "fonts", "LICENSE.txt"), "Excalifont-OFL.txt"],
    ];
    for (const [from, name] of extra) await copyFile(from, path.join(opts.out, name));
  }

  const bytes = Buffer.byteLength(built.text);
  process.stdout.write(`Obsidian plugin ${opts.version} -> ${opts.out}\n`);
  for (const [name, data] of files) {
    process.stdout.write(
      `  ${name.padEnd(14)} ${String(Buffer.byteLength(data)).padStart(9)} bytes\n`,
    );
  }
  process.stdout.write(
    `  main.js gzip   ${String(gzipSync(built.text).length).padStart(9)} bytes\n`,
  );
  if (bytes > 5_000_000) process.stderr.write("warning: main.js is larger than 5 MB\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    if (err instanceof UsageError) process.stderr.write(`\n${USAGE}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
