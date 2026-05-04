#!/usr/bin/env node
//
// Register local git merge drivers used by this repo:
//
//   * `keep-generated` — resolves conflicts on generated artefacts
//     (README.md, SVGs, PNGs, docs/.build-manifest.json) by always
//     keeping the version on the current branch. The next
//     `npm run build:docs` will overwrite anything stale.
//
//   * `prefer-higher-version` — for `package.json` / `package-lock.json`,
//     runs a real three-way merge and then auto-resolves any leftover
//     conflict whose only difference is a `"version": "x.y.z"` line by
//     keeping the higher semver. Real (non-version) conflicts are still
//     left for a human to inspect.
//
// `true(1)` is the standard Unix no-op for `keep-generated`: it exits 0,
// which git interprets as "merge succeeded, %A (the current side) is
// correct".
//
// This script is invoked from the `prepare` npm lifecycle hook so every
// clone gets the drivers wired up after `npm install`.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Skip silently if not inside a git working tree (e.g. when installed
// as a dependency from npm into another project's node_modules).
if (!existsSync(path.join(REPO_ROOT, ".git"))) {
  process.exit(0);
}

/**
 * Configure one git merge driver. Logs (but does not abort) on failure
 * so a single misconfigured driver never breaks `npm install`.
 *
 * @param {string} name    Driver name as referenced in `.gitattributes`.
 * @param {string} command Shell command git invokes per merge.
 */
function configureDriver(name, command) {
  const r = spawnSync("git", ["config", `merge.${name}.driver`, command], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if ((r.status ?? 0) !== 0) {
    console.warn(`setup-merge-drivers: failed to configure '${name}' driver (exit ${r.status})`);
  }
}

configureDriver("keep-generated", "true");

// `prefer-higher-version` shells out to a Node helper. Use a relative
// path so the driver works inside any clone (the merge driver is
// invoked from the repository root by git).
const versionDriver = "node scripts/merge-driver-prefer-higher-version.mjs %A %O %B %L %P";
configureDriver("prefer-higher-version", versionDriver);
