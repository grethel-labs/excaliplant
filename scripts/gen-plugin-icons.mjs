#!/usr/bin/env node
// Rasterise the shared brand icon for the editor and plugin packages.
//
//   node scripts/gen-plugin-icons.mjs

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateIcon } from "./build-vscode.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  ["integrations/vscode/icon.png", 128],
  ["integrations/claude-plugin/.claude-plugin/icon.png", 512],
  ["integrations/codex-plugin/assets/icon.png", 512],
  ["integrations/codex-plugin/assets/logo.png", 512],
];

for (const [rel, size] of /** @type {[string, number][]} */ (TARGETS)) {
  const file = path.join(ROOT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  process.stdout.write(`${await generateIcon(file, size)}\n`);
}
