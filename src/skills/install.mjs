/**
 * Copy the bundled excaliplant skill (or a rule-file variant of it) to the
 * place a given tool reads it from. All file-system access goes through the
 * caller's `io` object, and nothing is ever written outside the target folder.
 * @module skills/install
 */

import path from "node:path";
import { renderRule } from "./rules.mjs";
import { ALL_RULE_TOOLS, ALL_SKILL_TOOLS, SKILL_NAME, TARGETS, findTarget } from "./targets.mjs";

/**
 * File-system and console access for the skills commands.
 * @typedef {object} SkillsIo
 * @property {(file: string) => Promise<string>} readFile Read a UTF-8 text file.
 * @property {(file: string, data: string) => Promise<void>} writeFile Write a UTF-8 text file.
 * @property {(dir: string, options: { recursive: true }) => Promise<unknown>} mkdir
 * @property {(file: string) => Promise<boolean>} exists
 * @property {() => string} homedir
 * @property {() => string} cwd
 * @property {{ write: (text: string) => unknown }} stdout
 * @property {{ write: (text: string) => unknown }} stderr
 * @property {string} [skillsRoot] Folder of the packaged skills (defaults to the package's `skills/`).
 */

/**
 * The packaged skill, read once.
 * @typedef {object} Bundle
 * @property {string} version Package version substituted for `{{version}}`.
 * @property {{ path: string, content: string }[]} files Skill files, paths relative to the skill folder.
 * @property {string} rules Rule text shared by the rule-file targets.
 */

/**
 * @typedef {object} InstallOptions
 * @property {string[]} tools Tool ids, `all` or `rules`.
 * @property {"project" | "user"} [scope] Default `project`.
 * @property {string} [dir] Install below this folder instead of the tool's own location.
 * @property {boolean} [force] Overwrite existing files.
 * @property {boolean} [dryRun] Only report what would be written.
 */

/**
 * @typedef {object} InstallResult
 * @property {string} tool Tool id.
 * @property {"skill" | "rule"} kind
 * @property {string} root Skill folder or rule file.
 * @property {"installed" | "would-install" | "exists"} status
 * @property {string[]} files Absolute paths written (or planned).
 */

/** Thrown for problems the user can fix (bad flag, unknown tool, existing files). */
export class SkillsUsageError extends Error {}

/**
 * Whether `rel` is a plain relative path with forward slashes and no `.`/`..`
 * segments, so joining it below a folder cannot leave that folder.
 * @param {unknown} rel
 * @returns {boolean}
 */
export function isSafeRelativePath(rel) {
  if (typeof rel !== "string" || rel === "" || rel.length > 260) return false;
  if (rel.includes("\0") || rel.includes("\\") || rel.startsWith("/") || /^[A-Za-z]:/.test(rel))
    return false;
  return rel.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean} True when `candidate` is strictly inside `root`.
 */
export function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  if (!rel || path.isAbsolute(rel)) return false;
  return rel.split(path.sep)[0] !== "..";
}

/**
 * Read the packaged skill through `io`.
 * @param {SkillsIo} io
 * @param {string} root Folder that contains `manifest.json` and the skill folder.
 * @returns {Promise<Bundle>}
 */
export async function loadBundle(io, root) {
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(await io.readFile(path.join(root, "manifest.json")));
  } catch (err) {
    throw new SkillsUsageError(
      `Cannot read the packaged skill in ${root}: ${/** @type {Error} */ (err).message}`,
    );
  }
  if (
    !manifest ||
    manifest.name !== SKILL_NAME ||
    !Array.isArray(manifest.files) ||
    !isSafeRelativePath(manifest.rules)
  ) {
    throw new SkillsUsageError(`Invalid skills manifest in ${root}`);
  }
  let version = "unknown";
  try {
    const pkg = JSON.parse(await io.readFile(path.join(root, "..", "package.json")));
    if (typeof pkg.version === "string") version = pkg.version;
  } catch {
    // Keep "unknown": the version is informational metadata only.
  }
  const skillRoot = path.join(root, SKILL_NAME);
  /** @type {Bundle["files"]} */
  const files = [];
  for (const rel of manifest.files) {
    if (!isSafeRelativePath(rel)) throw new SkillsUsageError(`Unsafe path in manifest: ${rel}`);
    const content = await io.readFile(path.join(skillRoot, ...rel.split("/")));
    files.push({ path: rel, content: content.replaceAll("{{version}}", version) });
  }
  const rules = await io.readFile(path.join(skillRoot, ...manifest.rules.split("/")));
  return { version, files, rules };
}

/**
 * Turn `--tool` values into target ids, expanding `all` and `rules`.
 * @param {string[]} tools
 * @returns {string[]}
 */
export function expandTools(tools) {
  /** @type {string[]} */
  const out = [];
  for (const raw of tools.flatMap((t) => t.split(","))) {
    const id = raw.trim().toLowerCase();
    if (!id) continue;
    if (id === "all") out.push(...ALL_SKILL_TOOLS);
    else if (id === "rules") out.push(...ALL_RULE_TOOLS);
    else {
      const target = findTarget(id);
      if (!target) {
        const known = [...TARGETS.map((t) => t.id), "all", "rules"].join(", ");
        throw new SkillsUsageError(`Unknown tool "${raw}". Choose from: ${known}`);
      }
      out.push(target.id);
    }
  }
  return out;
}

/**
 * Work out where everything goes without touching the file system.
 * @param {InstallOptions} options
 * @param {SkillsIo} io
 * @param {Bundle} bundle
 * @returns {{ tool: string, kind: "skill" | "rule", root: string, files: { path: string, content: string }[] }[]}
 */
export function planInstall(options, io, bundle) {
  const scope = options.scope ?? "project";
  if (scope !== "project" && scope !== "user")
    throw new SkillsUsageError(`Unknown scope "${scope}" (use project or user)`);
  const ids = [...new Set(expandTools(options.tools))];
  if (options.dir !== undefined && ids.length > 1)
    throw new SkillsUsageError("--dir can only be combined with a single --tool");
  if (ids.length === 0) {
    if (options.dir === undefined)
      throw new SkillsUsageError("Choose a tool with --tool <id> (see `excaliplant skills list`)");
    ids.push("agents");
  }
  const base = scope === "user" ? io.homedir() : io.cwd();
  /** @type {ReturnType<typeof planInstall>} */
  const plan = [];
  const seen = new Set();
  for (const id of ids) {
    const target = /** @type {import("./targets.mjs").Target} */ (findTarget(id));
    const rel = scope === "user" ? target.user : target.project;
    if (options.dir === undefined && rel === null)
      throw new SkillsUsageError(
        `${target.label} has no user-level location; use --scope project or --dir`,
      );
    if (target.kind === "skill") {
      const skillsDir =
        options.dir !== undefined
          ? path.resolve(io.cwd(), options.dir)
          : path.join(base, ...String(rel).split("/"));
      const root = path.join(skillsDir, SKILL_NAME);
      if (seen.has(root)) continue;
      seen.add(root);
      const files = bundle.files.map((f) => {
        const file = path.join(root, ...f.path.split("/"));
        if (!isInside(root, file)) throw new SkillsUsageError(`Refusing to write ${f.path}`);
        return { path: file, content: f.content };
      });
      plan.push({ tool: target.id, kind: "skill", root, files });
    } else {
      const file =
        options.dir !== undefined
          ? path.join(path.resolve(io.cwd(), options.dir), path.basename(target.project))
          : path.join(base, ...String(rel).split("/"));
      if (seen.has(file)) continue;
      seen.add(file);
      const format = target.format ?? "plain";
      plan.push({
        tool: target.id,
        kind: "rule",
        root: file,
        files: [{ path: file, content: renderRule(format, bundle.rules) }],
      });
    }
  }
  return plan;
}

/**
 * Install the skill for the requested tools.
 * @param {InstallOptions} options
 * @param {SkillsIo} io
 * @param {Bundle} bundle
 * @returns {Promise<InstallResult[]>}
 */
export async function installSkills(options, io, bundle) {
  const plan = planInstall(options, io, bundle);
  /** @type {InstallResult[]} */
  const results = [];
  for (const entry of plan) {
    const files = entry.files.map((f) => f.path);
    if (!options.force && (await io.exists(entry.root))) {
      results.push({
        tool: entry.tool,
        kind: entry.kind,
        root: entry.root,
        status: "exists",
        files,
      });
      continue;
    }
    if (options.dryRun) {
      results.push({
        tool: entry.tool,
        kind: entry.kind,
        root: entry.root,
        status: "would-install",
        files,
      });
      continue;
    }
    for (const file of entry.files) {
      await io.mkdir(path.dirname(file.path), { recursive: true });
      await io.writeFile(file.path, file.content);
    }
    results.push({
      tool: entry.tool,
      kind: entry.kind,
      root: entry.root,
      status: "installed",
      files,
    });
  }
  return results;
}
