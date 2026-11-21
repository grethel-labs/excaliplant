/**
 * Browser replacement for `node:module`. The renderer reads the package
 * version through `createRequire(import.meta.url)("../../package.json")`; the
 * bundle answers that one request with the version baked in by the build.
 */

/* global __EXCALIPLANT_VERSION__ */

// Replaced by esbuild's `define` (see build.mjs); the fallback keeps the file
// usable outside the bundle.
const VERSION = typeof __EXCALIPLANT_VERSION__ === "string" ? __EXCALIPLANT_VERSION__ : "0.0.0";

/**
 * @param {string | URL} _from Ignored.
 * @returns {(id: string) => { version: string }}
 */
export function createRequire(_from) {
  return (id) => {
    if (!String(id).endsWith("package.json")) {
      throw new Error(`Module "${id}" is not available in the Obsidian bundle`);
    }
    return { version: VERSION };
  };
}

export default { createRequire };
