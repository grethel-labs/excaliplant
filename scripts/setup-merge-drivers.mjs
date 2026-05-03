#!/usr/bin/env node
//
// Register a local git merge driver named `keep-generated` that
// resolves conflicts on generated artefacts (README.md, SVGs, PNGs,
// docs/.build-manifest.json — see .gitattributes) by always keeping
// the version already on the current branch. The next
// `npm run build:docs` will overwrite anything stale, so picking
// either side is safe and conflict-free.
//
// `true(1)` is the standard Unix no-op: it exits 0, which git
// interprets as "merge succeeded, %A (the current side) is correct".
//
// This script is invoked from the `prepare` npm lifecycle hook so
// every clone gets the driver wired up after `npm install`.

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

const r = spawnSync("git", ["config", "merge.keep-generated.driver", "true"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
});
process.exit(r.status ?? 0);
