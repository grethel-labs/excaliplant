#!/usr/bin/env node
// prepublish-guard: aborts if the working tree after `npm run build` is
// not clean (docs / README / api/* not committed) or if HEAD is not on
// a tag matching the package.json version. Wired into prepublishOnly.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

function sh(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf8" }).trim();
}

// 1) Working tree must be clean.
let dirty = "";
try {
  dirty = sh("git status --porcelain");
} catch {
  console.error("prepublish-guard: not a git checkout — skipping clean-tree check");
}
if (dirty) {
  console.error("prepublish-guard: working tree is dirty:");
  console.error(dirty);
  console.error("Commit or revert before publishing.");
  process.exit(1);
}

// 2) Version must match an annotated git tag at HEAD (best-effort; warn only).
try {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const expected = `v${pkg.version}`;
  const tagsAtHead = sh("git tag --points-at HEAD").split("\n").filter(Boolean);
  if (!tagsAtHead.includes(expected)) {
    console.error(
      `prepublish-guard: HEAD has no tag ${expected} (found: ${tagsAtHead.join(", ") || "none"})`,
    );
    if (process.env.EXCALIPLANT_ALLOW_UNTAGGED !== "1") {
      process.exit(1);
    }
    console.error("EXCALIPLANT_ALLOW_UNTAGGED=1 set — continuing.");
  }
} catch (e) {
  console.error("prepublish-guard: tag check skipped:", e?.message || e);
}

console.log("prepublish-guard: ok");
