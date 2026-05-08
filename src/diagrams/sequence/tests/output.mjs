import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

/** Absolute path to the Sequence module's generated test-review artefacts. */
export const SEQUENCE_TEST_OUTPUT_DIR = join(fileURLToPath(import.meta.url), "../output");

/**
 * Write a Sequence-module test artefact to `src/diagrams/sequence/tests/output/`.
 * @param {string} filename File name or relative path below the module output directory.
 * @param {string|Buffer|Uint8Array} content Content to write.
 */
export function writeSequenceOutput(filename, content) {
  const target = join(SEQUENCE_TEST_OUTPUT_DIR, filename);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
