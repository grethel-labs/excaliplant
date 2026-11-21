/**
 * Node.js implementation of {@link import("./install.mjs").SkillsIo} for the
 * command line. Only the CLI imports this module; rendering code never does.
 * @module skills/node_io
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import process from "node:process";

/**
 * @returns {import("./install.mjs").SkillsIo}
 */
export function createNodeIo() {
  return {
    readFile: (file) => readFile(file, "utf8"),
    writeFile: (file, data) => writeFile(file, data, "utf8"),
    mkdir: (dir, options) => mkdir(dir, options),
    exists: (file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    homedir: () => os.homedir(),
    cwd: () => process.cwd(),
    stdout: process.stdout,
    stderr: process.stderr,
  };
}
