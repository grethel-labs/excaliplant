#!/usr/bin/env node
// Print the next semantic version for a bump kind, based on the latest v* tag.
// Usage: node scripts/next-version.mjs <major|minor|patch> [latest-tag]

const [bump, latest = ""] = process.argv.slice(2);
if (!["major", "minor", "patch"].includes(bump ?? "")) {
  console.error("Usage: next-version.mjs <major|minor|patch> [latest-tag]");
  process.exit(2);
}
const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(latest.trim());
let [major, minor, patch] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
if (bump === "major") [major, minor, patch] = [major + 1, 0, 0];
else if (bump === "minor") [minor, patch] = [minor + 1, 0];
else patch += 1;
console.log(`${major}.${minor}.${patch}`);
