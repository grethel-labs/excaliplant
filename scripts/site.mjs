#!/usr/bin/env node
// Build the GitHub Pages site into _site/ (default):
//
//   index.html, app.js, worker.js, boot.js, styles.css   playground + gallery (see site/)
//   d/<kind>/<name>.svg|.excalidraw|.puml                the gallery's pre-rendered examples
//
// Everything is static and uses relative URLs, so it works under
// /excaliplant/ on GitHub Pages and from file://. See docs/site.md.
//
// Usage: node scripts/site.mjs [outDir]
// Environment: SITE_VERSION overrides the version shown in the header (and
// skips the npm lookup, which is what the tests and offline builds use).

import { THEME_NAMES } from "../src/draw/theme.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { render } from "../src/index.mjs";
import { bundleApp, bundleBoot, bundleWorker, buildStyles } from "../site/build.mjs";
import { ROOT, SITE_URL, loadExamples } from "./showcase.mjs";

const REPO = "https://github.com/grethel-labs/excaliplant";

/**
 * The version shown on the page. package.json stays `0.0.0-development`
 * (tags are the source of truth), so ask npm first, then fall back to the
 * latest `v*` tag. `SITE_VERSION` overrides both.
 * @param {string} name
 * @returns {Promise<string | null>}
 */
export async function publishedVersion(name) {
  if (process.env.SITE_VERSION) return process.env.SITE_VERSION.replace(/^v/, "");
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}/latest`, {
      signal: AbortSignal.timeout(10_000),
      headers: { "cache-control": "no-cache" },
    });
    if (res.ok) {
      const v = (await res.json()).version;
      if (typeof v === "string" && /^\d+\.\d+\.\d+/.test(v)) return v;
    }
  } catch {
    // offline: fall through to git tags
  }
  try {
    const tags = execFileSync("git", ["tag", "--list", "v[0-9]*", "--sort=-v:refname"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const latest = tags.split("\n")[0]?.trim();
    if (latest) return latest.replace(/^v/, "");
  } catch {
    // not a git checkout
  }
  return null;
}

/** @returns {string | null} Short commit id of the checkout, if any. */
function commitId() {
  const env = process.env.GITHUB_SHA;
  if (env && /^[0-9a-f]{7,40}$/.test(env)) return env.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** @param {string} s */
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/**
 * Build the whole site.
 * @param {string} out Output directory (replaced).
 * @returns {Promise<{ files: Record<string, number>, slides: number, kinds: number }>}
 */
export async function buildSite(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, "d"), { recursive: true });
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const version = await publishedVersion(pkg.name);
  const commit = commitId();

  const examples = loadExamples();
  for (const ex of examples) {
    const result = await render(ex.source);
    const dir = path.join(out, "d", ex.kind);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${ex.name}.svg`), await result.toSvg());
    writeFileSync(path.join(dir, `${ex.name}.excalidraw`), JSON.stringify(result.excalidraw));
    writeFileSync(path.join(dir, `${ex.name}.puml`), ex.source);
  }
  const kinds = new Set(examples.map((e) => e.kind)).size;

  /** @type {Record<string, string>} */
  const files = {
    "app.js": await bundleApp({ examples }),
    "worker.js": await bundleWorker({ version: version ?? "dev" }),
    "boot.js": await bundleBoot(),
    "styles.css": await buildStyles(),
  };
  const vars = {
    themeOptions: THEME_NAMES.map(
      (name) => `<option value="${esc(name)}">${esc(name)}</option>`,
    ).join("\n"),
    description: `Write PlantUML and see it rendered live as hand-drawn diagrams: ${kinds} diagram types, ${examples.length} editable examples, export to SVG, PNG and Excalidraw.`,
    siteUrl: SITE_URL,
    version: version ? `v${version}` : "dev",
    versionHref: version
      ? `https://www.npmjs.com/package/${pkg.name}/v/${version}`
      : `${REPO}/releases`,
    versionTitle: commit
      ? `${version ? `Released version ${version}. ` : ""}This page was built from commit ${commit}.`
      : "Version of excaliplant on this page",
  };
  const template = readFileSync(path.join(ROOT, "site", "index.html"), "utf8");
  files["index.html"] = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`Unknown placeholder {{${key}}} in site/index.html`);
    if (key === "themeOptions") return vars.themeOptions;
    return esc(vars[/** @type {keyof typeof vars} */ (key)]);
  });
  files[".nojekyll"] = "";

  /** @type {Record<string, number>} */
  const sizes = {};
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(out, name), text);
    sizes[name] = text.length;
    sizes[`${name}.gz`] = gzipSync(text, { level: 9 }).length;
  }
  return { files: sizes, slides: examples.length, kinds };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(ROOT, process.argv[2] ?? "_site");
  const { files, slides, kinds } = await buildSite(out);
  const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(1)} KB`;
  for (const name of ["index.html", "app.js", "worker.js", "boot.js", "styles.css"]) {
    console.log(
      `  ${name.padEnd(12)} ${kb(files[name]).padStart(10)}  (${kb(files[`${name}.gz`])} gzip)`,
    );
  }
  console.log(
    `Built ${slides} examples for ${kinds} diagram types into ${path.relative(ROOT, out)}/`,
  );
}
