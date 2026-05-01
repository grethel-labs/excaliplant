// File-tree rendering for the README.
//
// Uses the `tree-node-cli` library (the npm port of the unix `tree`
// command) to produce a deterministic ASCII tree of the source layout.
// Keeping this in code — rather than maintained by hand in the
// template — guarantees the tree never drifts from reality.

import tree from "tree-node-cli";
import { REPO_ROOT } from "./config.mjs";

/**
 * Build the file-tree block embedded in the README.
 *
 * @returns {string} An ASCII tree, ready to be wrapped in a fenced
 *                   code block by the template.
 */
export function buildFileTree() {
  return tree(REPO_ROOT, {
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
  }).trim();
}
