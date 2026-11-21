#!/usr/bin/env node
// Regenerate the square plugin icons (512x512) from a diagram rendered by
// excaliplant itself. The Claude directory takes the icon once, at the first
// save or submission in its portal, so it has to be right before that.
//
//   node scripts/gen-plugin-icons.mjs

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateIcon } from "./build-vscode.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  "integrations/claude-plugin/.claude-plugin/icon.png",
  "integrations/codex-plugin/assets/icon.png",
];

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  process.stdout.write(`${await generateIcon(file, 512)}\n`);
}
