// Tests for the `prefer-higher-version` git merge driver.
//
// The driver itself shells out to `git merge-file`, so the unit tests
// exercise both the pure helpers (`compareVersions`,
// `resolveVersionConflicts`) and the end-to-end behaviour by feeding
// crafted base/ours/theirs files through `runDriver`.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compareVersions,
  resolveVersionConflicts,
  runDriver,
} from "../scripts/merge-driver-prefer-higher-version.mjs";

test("merge-driver: compareVersions handles standard semver", () => {
  assert.equal(compareVersions("0.3.7", "0.3.6"), 1);
  assert.equal(compareVersions("0.3.6", "0.3.7"), -1);
  assert.equal(compareVersions("0.3.7", "0.3.7"), 0);
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
  assert.equal(compareVersions("v0.3.10", "0.3.9"), 1); // numeric, not lexical
  assert.equal(compareVersions("0.3.10", "0.3.9"), 1); // numeric also without v prefix
});

test("merge-driver: compareVersions tolerates malformed input", () => {
  assert.equal(compareVersions("garbage", "0.0.1"), -1);
  assert.equal(compareVersions("0.0.1", "garbage"), 1);
  assert.equal(compareVersions("garbage", "garbage"), 0);
});

test("merge-driver: resolveVersionConflicts picks higher semver", () => {
  const merged = [
    "{",
    '  "name": "@grethel-labs/excaliplant",',
    "<<<<<<< ours",
    '  "version": "0.3.7",',
    "=======",
    '  "version": "0.3.6",',
    ">>>>>>> theirs",
    '  "license": "MIT"',
    "}",
  ].join("\n");
  const { text, resolved, remaining } = resolveVersionConflicts(merged);
  assert.equal(resolved, 1);
  assert.equal(remaining, 0);
  assert.match(text, /"version":\s*"0\.3\.7"/);
  assert.ok(!text.includes("<<<<<<<"));
});

test("merge-driver: resolveVersionConflicts leaves non-version conflicts intact", () => {
  const merged = [
    "<<<<<<< ours",
    '  "name": "ours",',
    "=======",
    '  "name": "theirs",',
    ">>>>>>> theirs",
  ].join("\n");
  const { resolved, remaining, text } = resolveVersionConflicts(merged);
  assert.equal(resolved, 0);
  assert.equal(remaining, 1);
  assert.ok(text.includes("<<<<<<<"));
});

test("merge-driver: resolveVersionConflicts does not collapse mixed hunks", () => {
  // Two differing lines (version + something else) → cannot auto-resolve.
  const merged = [
    "<<<<<<< ours",
    '  "version": "0.3.7",',
    '  "name": "ours",',
    "=======",
    '  "version": "0.3.6",',
    '  "name": "theirs",',
    ">>>>>>> theirs",
  ].join("\n");
  const { resolved, remaining } = resolveVersionConflicts(merged);
  assert.equal(resolved, 0);
  assert.equal(remaining, 1);
});

test("merge-driver: runDriver resolves a real package.json conflict end-to-end", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "merge-driver-"));
  try {
    const base = path.join(dir, "base.json");
    const ours = path.join(dir, "ours.json");
    const theirs = path.join(dir, "theirs.json");
    // Base is what both sides forked from.
    writeFileSync(
      base,
      JSON.stringify({ name: "x", version: "0.3.5", license: "MIT" }, null, 2) + "\n",
    );
    // Ours bumps to 0.3.7.
    writeFileSync(
      ours,
      JSON.stringify({ name: "x", version: "0.3.7", license: "MIT" }, null, 2) + "\n",
    );
    // Theirs bumps to 0.3.6.
    writeFileSync(
      theirs,
      JSON.stringify({ name: "x", version: "0.3.6", license: "MIT" }, null, 2) + "\n",
    );
    const code = runDriver({ ours, base, theirs });
    assert.equal(code, 0);
    const merged = JSON.parse(readFileSync(ours, "utf8"));
    assert.equal(merged.version, "0.3.7");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("merge-driver: runDriver leaves real conflicts unresolved (exit 1)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "merge-driver-"));
  try {
    const base = path.join(dir, "base.json");
    const ours = path.join(dir, "ours.json");
    const theirs = path.join(dir, "theirs.json");
    writeFileSync(base, JSON.stringify({ name: "x", license: "MIT" }, null, 2) + "\n");
    writeFileSync(ours, JSON.stringify({ name: "ours", license: "MIT" }, null, 2) + "\n");
    writeFileSync(theirs, JSON.stringify({ name: "theirs", license: "MIT" }, null, 2) + "\n");
    const code = runDriver({ ours, base, theirs });
    assert.equal(code, 1);
    const text = readFileSync(ours, "utf8");
    assert.ok(text.includes("<<<<<<<"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
