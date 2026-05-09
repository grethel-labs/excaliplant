/**
 * State diagram test output utilities.
 * @module diagrams/state/tests/output
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @public */
export const STATE_TEST_OUTPUT_DIR = join(__dirname, "output");

/**
 * @param {string} filename
 * @param {string} content
 * @public
 */
export function writeStateOutput(filename, content) {
  const path = join(STATE_TEST_OUTPUT_DIR, filename);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}
