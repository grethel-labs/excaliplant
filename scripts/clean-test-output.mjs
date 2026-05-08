#!/usr/bin/env node
// Removes generated test-review artefacts before each test run.
// Invoked automatically via the `pretest` npm lifecycle hook.

import { rmSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dirs = [
  join(fileURLToPath(import.meta.url), "../../tests/output"),
  join(fileURLToPath(import.meta.url), "../../src/diagrams/sequence/tests/output"),
];

for (const dir of dirs) {
  mkdirSync(dir, { recursive: true });
  // Remove every entry inside the directory, but keep the directory itself
  // and its .gitignore so git continues to track the folder.
  for (const entry of readdirSync(dir)) {
    if (entry === ".gitignore") continue;
    rmSync(join(dir, entry), { recursive: true, force: true });
  }
}
