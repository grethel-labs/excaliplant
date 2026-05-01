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

import { execSync } from "node:child_process";

function exec(cmd, opts = {}) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
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
  outdatedJson = exec("npm outdated --json");
} catch (e) {
  // npm outdated exits 1 when there ARE outdated packages — that's fine.
  outdatedJson = e.stdout?.toString() || "{}";
}

const outdated = JSON.parse(outdatedJson || "{}");
const patchPkgs = [];

for (const [name, info] of Object.entries(outdated)) {
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

const names = patchPkgs.map((p) => p.name).join(" ");
exec(`npm update --save ${names}`, { stdio: "inherit" });

// Emit shell-friendly summary for the workflow.
const summary = patchPkgs.map((p) => `- ${p.name}: ${p.from} → ${p.to}`).join("\n");
console.log("\n---SUMMARY---");
console.log(summary);
