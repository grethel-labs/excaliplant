// File-tree rendering for the README.
//
// Uses the `tree-node-cli` library (the npm port of the unix `tree`
// command) to produce a deterministic ASCII tree of the source layout.
// Keeping this in code — rather than maintained by hand in the
// template — guarantees the tree never drifts from reality.

// `tree-node-cli` v1 exposes the function as a CommonJS default export,
// while v3 ships an ESM named export. Import the namespace and pick whichever
// is available so the docs build works across both major versions.
import * as treeModule from "tree-node-cli";

/** @type {(root: string, opts?: object) => string} */
const tree =
  /** @type {any} */ (treeModule).tree ??
  /** @type {any} */ (treeModule).default ??
  /** @type {any} */ (treeModule);
import { REPO_ROOT } from "./config.mjs";

/**
 * Build the file-tree block embedded in the README.
 *
 * @returns {string} An ASCII tree, ready to be wrapped in a fenced
 *                   code block by the template.
 */
export function buildFileTree() {
  const lines = tree(REPO_ROOT, {
    allFiles: false,
    dirsFirst: true,
    // Skip noise: build artefacts, deps, IDE state, generated docs,
    // and the generated README itself.
    exclude: [
      /node_modules/,
      /\.git$/,
      /\.github/,
      /docs\/api/,
      /docs\/ressources\/generated/,
      /package-lock\.json/,
    ],
    maxDepth: 4,
  })
    .trim()
    .split("\n");

  // tree-node-cli derives the first line from the local checkout folder.
  // Keep the generated README stable across developer machines and CI.
  lines[0] = "excaliplant";
  return lines.join("\n");
}
