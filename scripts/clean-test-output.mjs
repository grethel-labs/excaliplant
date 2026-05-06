#!/usr/bin/env node
// Removes all files from tests/output/ before each test run.
// Invoked automatically via the `pretest` npm lifecycle hook.

import { rmSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(fileURLToPath(import.meta.url), "../../tests/output");

// Remove every entry inside the directory, but keep the directory itself
// and its .gitignore so git continues to track the folder.
for (const entry of readdirSync(dir)) {
  if (entry === ".gitignore") continue;
  rmSync(join(dir, entry), { recursive: true, force: true });
}
