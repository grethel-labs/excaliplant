/**
 * Shared output-directory helper for test files.
 *
 * Tests that produce rendered artefacts (PNG, SVG, Excalidraw JSON)
 * should write them here for manual inspection. The directory is
 * committed to the repository but its contents are gitignored.
 * The `pretest` npm hook clears the directory before every run.
 *
 * @module tests/helpers/output
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

/** Absolute path to the `tests/output/` directory. */
export const OUTPUT_DIR = join(fileURLToPath(import.meta.url), "../../output");

/**
 * Write a test artefact to `tests/output/<filename>`.
 * @param {string} filename File name (no path component).
 * @param {string|Buffer|Uint8Array} content Content to write.
 */
export function writeOutput(filename, content) {
  writeFileSync(join(OUTPUT_DIR, filename), content);
}
