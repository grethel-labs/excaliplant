// Central build configuration.
//
// Change the aspect ratio / canvas size here. Every diagram in the
// README is letter-boxed onto the same canvas so heights stay
// consistent in the rendered README.

import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "..", "..");
export const DOCS_DIR = path.join(REPO_ROOT, "docs");
export const SRC_DIR = path.join(REPO_ROOT, "src");
export const ENTRY_FILE = path.join(REPO_ROOT, "index.mjs");

// Generated artefacts live here. Sub-folders are created on demand.
export const GEN_DIR = path.join(DOCS_DIR, "ressources", "generated");
export const PUML_DIR = path.join(GEN_DIR, "puml");
export const EXCALIDRAW_DIR = path.join(GEN_DIR, "excalidraw");
export const SVG_DIR = path.join(GEN_DIR, "svg");
export const PNG_DIR = path.join(GEN_DIR, "png");

// Template + output README.
export const TEMPLATE_FILE = path.join(DOCS_DIR, "README.template.md.njk");
export const README_FILE = path.join(REPO_ROOT, "README.md");

// Canvas size for every diagram. Keep the aspect ratio constant so
// the README does not jump as the diagrams update. Width drives the
// PNG resolution; the SVG just gets a viewBox of the same proportion.
export const ASPECT_RATIO = { w: 4, h: 3 };
export const CANVAS_WIDTH = 1200; // pixels
export const CANVAS_HEIGHT = Math.round((CANVAS_WIDTH * ASPECT_RATIO.h) / ASPECT_RATIO.w);

// PNG resolution multiplier vs. the SVG canvas. 4× of the 1200-wide
// canvas yields a 4800×3600 PNG so README screenshots stay sharp on
// HiDPI displays even when scaled down by GitHub's image renderer.
export const PNG_SCALE = 4;

// Image format that the README embeds. Now that SVGs ship the
// Excalifont typeface inline and roughjs strokes, GitHub renders them
// crisply and at full hand-drawn fidelity, so we prefer SVG.
export const README_IMAGE_FORMAT = "svg";

// Paths used in README links must be repo-relative.
export function repoRel(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}
