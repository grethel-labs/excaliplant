// Write object generated test-review artifacts.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {string} */
export const OBJECT_TEST_OUTPUT_DIR = join(__dirname, "output");

/**
 * Write a file to the object test output directory.
 * @param {string} filename
 * @param {string} content
 * @returns {Promise<void>}
 */
export async function writeObjectOutput(filename, content) {
  const path = join(OBJECT_TEST_OUTPUT_DIR, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
