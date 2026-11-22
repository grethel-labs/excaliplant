// The OpenAI plugin portal validates an uploaded ZIP (https://developers.openai.com/plugins/deploy/submission-errors)
// and then checks the listing against the stricter limits of the final submission. This test applies
// those rules, as far as they apply to a skills-only plugin, to the archive the release attaches
// (excaliplant-codex-plugin-<version>.zip), so a violation shows up here and not in the portal.
// The limits below are the ones listed under "final directory submission" (30 characters for the
// display name and the short description, and so on).

import test from "node:test";
import assert from "node:assert/strict";
import { buildTree, packEntries } from "../scripts/skills.mjs";
import { writeZip } from "../scripts/skills-archive.mjs";

const VERSION = "1.2.3";
const tree = await buildTree();
const entries = /** @type {{ path: string, data: string | Uint8Array }[]} */ (
  packEntries(tree, VERSION).get(`excaliplant-codex-plugin-${VERSION}.zip`)
);
const byPath = new Map(entries.map((e) => [e.path, e.data]));
const text = (/** @type {string} */ p) => Buffer.from(byPath.get(p) ?? "").toString("utf8");
const manifest = JSON.parse(text("plugin.json"));
const iface = manifest.extensions?.["com.openai"]?.interface ?? {};

const CATEGORIES = [
  "Productivity",
  "Creativity",
  "Developer Tools",
  "Business & Operations",
  "Data & Analytics",
  "Communication",
  "Education & Research",
  "Security",
  "Finance",
  "Healthcare",
  "Travel",
  "Entertainment",
  "Other",
];
// Control characters, Unicode line/paragraph separators and invisible formatting characters.
const UNSUPPORTED = new RegExp(
  "[\\u0000-\\u0008\\u000b-\\u001f\\u007f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2064\\ufeff]",
  "u",
);
const oneLine = (/** @type {string} */ s) => !/[\r\n]/.test(s);

/** @param {unknown} s @param {number} max @param {boolean} [multiline] */
function assertText(s, max, multiline = false, what = "text") {
  assert.equal(typeof s, "string", `${what} is a string`);
  const t = /** @type {string} */ (s);
  assert.ok(t.trim().length > 0, `${what} is not empty`);
  assert.ok([...t].length <= max, `${what} is at most ${max} characters (${[...t].length})`);
  assert.ok(!UNSUPPORTED.test(t), `${what} has no unsupported characters`);
  if (!multiline) assert.ok(oneLine(t), `${what} fits on one line`);
}

/** @param {unknown} u @param {number} max */
function assertHttps(u, max, what = "URL") {
  assertText(u, max, false, what);
  const url = new URL(/** @type {string} */ (u));
  assert.equal(url.protocol, "https:", `${what} is HTTPS`);
  assert.ok(url.hostname.includes("."), `${what} has a host`);
  assert.equal(url.username + url.password, "", `${what} has no embedded credentials`);
}

/** WCAG relative luminance contrast ratio of two #RRGGBB colours. */
function contrast(/** @type {string} */ a, /** @type {string} */ b) {
  const lum = (/** @type {string} */ hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (/** @type {number} */ c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("the manifest meets the package and final-submission rules", () => {
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.match(
    manifest.name,
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "lowercase letters, numbers and single hyphens",
  );
  assert.ok(manifest.name.length <= 64);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  assert.ok(manifest.version.length <= 64);
  assert.equal(manifest.version, VERSION, "the release version is set");
  assertText(manifest.description, 1024, false, "description (the package limit is 1,024)");
  assertText(manifest.author?.name, 120, false, "author.name");
  assertHttps(manifest.author?.url, 2048, "author.url");
  assertHttps(manifest.homepage, 2048, "homepage");
  assert.ok(!("skills" in manifest) && !("mcpServers" in manifest) && !("apps" in manifest));
  assert.ok(!("hooks" in manifest) && !("hooks" in (manifest.extensions?.["com.openai"] ?? {})));
  assert.ok(
    !byPath.has(".codex-plugin/plugin.json"),
    "OpenAI ignores .codex-plugin when the interface object exists",
  );
});

test("the listing fields meet the final-submission limits", () => {
  assertText(iface.displayName, 30, false, "displayName");
  assertText(iface.shortDescription, 30, false, "shortDescription");
  assertText(iface.longDescription, 4000, true, "longDescription");
  assertText(iface.developerName, 80, false, "developerName");
  assert.ok(
    CATEGORIES.includes(iface.category),
    `category ${iface.category} is a supported category`,
  );
  assert.ok(Array.isArray(iface.capabilities) && iface.capabilities.length <= 20);
  for (const c of iface.capabilities) assertText(c, 120, false, "capability");
  assert.ok(Array.isArray(iface.defaultPrompt) && iface.defaultPrompt.length <= 3);
  const seen = new Set();
  for (const prompt of iface.defaultPrompt) {
    assertText(prompt, 128, false, "defaultPrompt");
    assert.ok(!/(^|\s)@\w/.test(prompt), "a starter prompt has no @mention");
    const key = prompt.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    assert.ok(!seen.has(key), "starter prompts are unique");
    seen.add(key);
  }
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL"])
    assertHttps(iface[key], 1024, key);
  assert.match(iface.brandColor, /^#[0-9a-fA-F]{6}$/);
  assert.ok(
    contrast(iface.brandColor, "#ffffff") >= 2,
    "brandColor has 2:1 contrast against white",
  );
  // The listing URLs must identify the same publisher as the submission.
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL"])
    assert.match(
      iface[key],
      /^https:\/\/(grethel-labs\.github\.io|github\.com\/grethel-labs)\//,
      key,
    );
});

test("the icons are square PNGs the portal accepts, referenced with ./ paths", () => {
  for (const key of ["logo", "composerIcon"]) {
    const ref = iface[key];
    assert.match(ref, /^\.\/assets\/[A-Za-z0-9._-]+\.png$/, `${key} path starts with ./assets/`);
    assert.ok(!ref.includes(".."));
    const png = Buffer.from(byPath.get(ref.slice(2)) ?? "");
    assert.ok(png.length > 0, `${key} is in the archive`);
    assert.equal(png.subarray(1, 4).toString("latin1"), "PNG", key);
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(w, h, `${key} is square`);
    assert.ok(w >= 48 && w <= 4096, `${key} is ${w}x${h}`);
    assert.ok(png.length <= 5 * 1024 * 1024, `${key} is at most 5 MiB`);
  }
});

test("every skill meets the skill rules", () => {
  const skills = [...byPath.keys()].filter((p) => /^skills\/[^/]+\/SKILL\.md$/.test(p));
  assert.ok(skills.length >= 1, "at least one valid skill");
  for (const file of skills) {
    const dir = file.split("/")[1];
    assert.ok(!dir.startsWith("."), "skill directory is not hidden");
    const raw = text(file);
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    assert.ok(m, `${file} starts with YAML front matter between --- lines`);
    const front = m[1];
    const name = /^name:\s*(.+)$/m.exec(front)?.[1].trim();
    const description = /^description:\s*(.+)$/m.exec(front)?.[1].trim();
    assert.ok(name, "skill has a name");
    assertText(description, 1024, false, "skill description");
    assert.ok(m[2].trim().length > 0, "the skill body is not empty");
    assert.ok(
      `${manifest.name}:${name}`.length <= 64,
      "plugin-name:skill-name is at most 64 characters",
    );
  }
  const names = skills.map((f) => /^name:\s*(.+)$/m.exec(text(f))?.[1].trim());
  assert.equal(new Set(names).size, names.length, "skill names are unique");
});

test("the archive follows the structure and size rules and carries nothing the portal refuses", () => {
  const paths = entries.map((e) => e.path);
  assert.ok(paths.includes("plugin.json"), "the plugin root is the archive root");
  for (const p of paths) {
    assert.ok(!p.includes("\\"), `${p}: forward slashes only`);
    assert.ok(!p.startsWith("/") && !/^[A-Za-z]:/.test(p), `${p}: relative`);
    assert.ok(!p.split("/").some((s) => s === ".." || s === ""), `${p}: no empty or .. segment`);
    assert.ok(p.split("/").length <= 20, `${p}: at most 20 segments`);
    assert.equal(p, p.trim(), `${p}: no outer whitespace`);
  }
  const normalised = paths.map((p) => p.normalize("NFC").toLowerCase());
  assert.equal(
    new Set(normalised).size,
    paths.length,
    "paths are unique after case and Unicode normalisation",
  );
  assert.ok(paths.length <= 5000);
  // Refused for a plugin from an organization that is not allowlisted: MCP configuration (a local
  // server), apps, lifecycle hooks, and reviewer credentials.
  for (const p of paths) {
    assert.ok(!/(^|\/)\.?mcp\.json$/.test(p), `${p}: no MCP configuration`);
    assert.ok(!/(^|\/)\.app\.json$/.test(p), `${p}: no .app.json`);
    assert.ok(!/(^|\/)hooks(\/|$)/.test(p), `${p}: no hooks`);
  }
  const all = JSON.stringify(manifest);
  assert.ok(!/test_credentials|reviewer_instructions/.test(all));
  for (const e of entries) assert.ok(Buffer.from(e.data).length <= 100 * 1024 * 1024);
  const zip = writeZip(entries);
  assert.ok(zip.length <= 100 * 1000 * 1000, "the compressed archive is at most 100 MB");
  const total = entries.reduce((n, e) => n + Buffer.from(e.data).length, 0);
  assert.ok(total <= 512 * 1024 * 1024, "the extracted archive is at most 512 MiB");
});
