#!/usr/bin/env node
/**
 * Auto patch updater. Used by .github/workflows/auto-patch-deps.yml
 * every 4 hours.
 *
 * Strategy:
 *   1. `npm outdated --json` to discover updates.
 *   2. Keep only entries where the bump is patch-only
 *      (same major + same minor, current < wanted).
 *   3. Run `npm update <pkg>` for the patch set.
 *   4. Print the list of bumped packages so the workflow can decide
 *      whether to commit.
 */

import { execFileSync, spawnSync } from "node:child_process";

// Strict allowlist for npm package identifiers (incl. scopes).
// Used to defensively reject anything weird coming back from `npm outdated`.
const SAFE_PKG_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

function exec(file, args = [], opts = {}) {
  return execFileSync(file, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    ...opts,
  });
}

function semverParts(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function isPatchBump(current, wanted) {
  const a = semverParts(current);
  const b = semverParts(wanted);
  if (!a || !b) return false;
  return a.major === b.major && a.minor === b.minor && a.patch < b.patch;
}

let outdatedJson = "{}";
try {
  outdatedJson = exec("npm", ["outdated", "--json"]);
} catch (e) {
  // npm outdated exits 1 when there ARE outdated packages — that's fine.
  outdatedJson = e.stdout?.toString() || "{}";
}

const outdated = JSON.parse(outdatedJson || "{}");
const patchPkgs = [];

for (const [name, info] of Object.entries(outdated)) {
  // Belt-and-braces: never let a malformed/hostile name reach a child process.
  if (!SAFE_PKG_NAME.test(name)) {
    console.error(`skipping suspicious package name: ${JSON.stringify(name)}`);
    continue;
  }
  if (isPatchBump(info.current, info.wanted)) {
    patchPkgs.push({ name, from: info.current, to: info.wanted });
  }
}

if (patchPkgs.length === 0) {
  console.log("No patch-level updates available.");
  process.exit(0);
}

console.log("Patch updates to apply:");
for (const p of patchPkgs) console.log(`  ${p.name}: ${p.from} → ${p.to}`);

// argv array — no shell interpolation, no injection surface.
const names = patchPkgs.map((p) => p.name);
const { status } = spawnSync("npm", ["update", "--save", ...names], {
  stdio: "inherit",
});
if (status !== 0) {
  console.error(`npm update exited with status ${status}`);
  process.exit(status ?? 1);
}

// Emit shell-friendly summary for the workflow.
const summary = patchPkgs.map((p) => `- ${p.name}: ${p.from} → ${p.to}`).join("\n");
console.log("\n---SUMMARY---");
console.log(summary);
