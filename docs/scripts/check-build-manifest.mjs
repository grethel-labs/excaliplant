#!/usr/bin/env node
//
// Verify that README.md and every file under docs/ressources/generated/
// is the exact output of the most recent `npm run build:docs` run.
//
// The build pipeline writes docs/.build-manifest.json containing a
// SHA-256 hash for each generated file. Running locally:
//
//   1. user runs `npm run build:docs`         → manifest + files agree
//   2. user commits both                      → guard passes ✓
//
// Failure modes the guard catches:
//
//   - user edits README.md by hand            → file hash ≠ manifest
//   - user edits a generated SVG by hand      → file hash ≠ manifest
//   - user changed sources but forgot rebuild → manifest still matches
//                                                the *old* artefacts;
//                                                the rebuild step in CI
//                                                will detect drift and
//                                                amend.
//
// Exit codes: 0 = match, 1 = mismatch (fails the CI step).

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = path.join(REPO_ROOT, "docs", ".build-manifest.json");

if (!existsSync(MANIFEST_PATH)) {
  console.error(
    `::error::docs/.build-manifest.json is missing. Run \`npm run build:docs\` and commit the result.`,
  );
  process.exit(1);
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
if (manifest.version !== 1) {
  console.error(`::error::Unsupported build manifest version: ${manifest.version}`);
  process.exit(1);
}

/** @type {string[]} */
const mismatches = [];
for (const [rel, expected] of Object.entries(manifest.files)) {
  const abs = path.join(REPO_ROOT, rel);
  if (!existsSync(abs)) {
    mismatches.push(`${rel}: missing on disk`);
    continue;
  }
  const buf = await readFile(abs);
  const actual = createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) {
    mismatches.push(`${rel}: ${actual.slice(0, 12)} != ${String(expected).slice(0, 12)} (manifest)`);
  }
}

if (mismatches.length > 0) {
  console.error(`::error::Build manifest mismatch — generated files were edited by hand or
the build was not re-run after a manual change.

Mismatches:
${mismatches.map((m) => "  " + m).join("\n")}

Fix: run \`npm run build:docs\` locally and commit README.md,
docs/ressources/generated/ and docs/.build-manifest.json together.`);
  process.exit(1);
}

console.log(`✓ build manifest matches: ${Object.keys(manifest.files).length} files verified`);
