import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

/** Absolute path to the Class module's generated test-review artefacts. */
export const CLASS_TEST_OUTPUT_DIR = join(fileURLToPath(import.meta.url), "../output");

/**
 * Write a Class-module test artefact to `src/diagrams/class/tests/output/`.
 * @param {string} filename File name or relative path below the module output directory.
 * @param {string|Buffer|Uint8Array} content Content to write.
 */
export function writeClassOutput(filename, content) {
  const target = join(CLASS_TEST_OUTPUT_DIR, filename);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
