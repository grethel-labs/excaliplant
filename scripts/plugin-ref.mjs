#!/usr/bin/env node
// Write the content of the `plugin-release` branch for one release.
//
//   node scripts/plugin-ref.mjs --version 1.2.3 --out <dir>
//
// The release workflow never writes back to main, so the committed plugin files
// carry no real version (`{{version}}` in the skills, none in plugin.json). The
// plugin directories want a versioned ref; this script produces its tree:
// the two marketplace manifests, both plugin folders (plugin.json with the
// version, skills with the version substituted) and a short README. The branch
// is then updated by scripts/publish-plugin-branch.sh. Deterministic: no
// network, no clock; binary files are copied byte for byte.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildTree, refEntries } from "./skills.mjs";

/**
 * @param {string[]} args
 * @returns {{ version: string, out: string }}
 */
function parseArgs(args) {
  /** @type {Record<string, string>} */
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if ((key !== "--version" && key !== "--out") || value === undefined || value.startsWith("--"))
      throw new Error("Usage: plugin-ref.mjs --version X.Y.Z --out <dir>");
    opts[key.slice(2)] = value;
  }
  if (!opts.version || !opts.out)
    throw new Error("Usage: plugin-ref.mjs --version X.Y.Z --out <dir>");
  return { version: opts.version, out: opts.out };
}

/**
 * Write the branch files into an empty (or new) directory.
 * @param {string} version `x.y.z` or `x.y.z-pre`.
 * @param {string} outDir
 * @returns {Promise<string[]>} Written paths, sorted.
 */
export async function writePluginRef(version, outDir) {
  const out = path.resolve(outDir);
  if (existsSync(out) && readdirSync(out).length)
    throw new Error(`Output directory ${out} is not empty`);
  const entries = refEntries(await buildTree(), version);
  for (const { path: rel, data } of entries) {
    const abs = path.join(out, ...rel.split("/"));
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, data);
  }
  return entries.map((e) => e.path);
}

async function main() {
  const { version, out } = parseArgs(process.argv.slice(2));
  const written = await writePluginRef(version, out);
  console.log(`Wrote ${written.length} plugin-release files for ${version} to ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`plugin-ref: ${err?.message ?? err}`);
    process.exit(1);
  });
}
