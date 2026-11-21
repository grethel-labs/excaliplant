/**
 * `excaliplant skills …`: install the bundled agent skill for AI coding tools.
 * @module skills
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { SkillsUsageError, installSkills, loadBundle } from "./install.mjs";
import { SKILL_NAME, TARGETS } from "./targets.mjs";

export { SkillsUsageError, installSkills, loadBundle, planInstall } from "./install.mjs";
export { TARGETS, SKILL_NAME } from "./targets.mjs";
export { parseFrontmatter, validateSkill } from "./frontmatter.mjs";
export { renderRule } from "./rules.mjs";

const HELP = `excaliplant skills — install the excaliplant agent skill

Usage:
  excaliplant skills install --tool <id[,id…]|all|rules> [options]
  excaliplant skills list
  excaliplant skills path

Install options:
  --tool <id>        Target tool (repeatable or comma separated). "all" installs
                     the skill for every tool with skill support, "rules" writes
                     rule files for Cursor, Windsurf, Cline, Roo and Copilot.
  --scope <scope>    project (default, below the current directory) or user (home directory)
  --dir <path>       Install below this folder instead of the tool's own location
  --force            Overwrite an existing installation
  --dry-run          Show what would be written without writing anything
  -h, --help         Show this help

Run "excaliplant skills list" for the supported tools and their locations.
`;

/**
 * @param {string[]} argv Arguments after `skills`.
 * @returns {{ command: string, tools: string[], scope?: string, dir?: string, force: boolean, dryRun: boolean, help: boolean }}
 */
function parseArgs(argv) {
  /** @type {ReturnType<typeof parseArgs>} */
  const opts = { command: "", tools: [], force: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new SkillsUsageError(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--tool":
      case "-t":
        opts.tools.push(value());
        break;
      case "--scope":
        opts.scope = value();
        break;
      case "--dir":
        opts.dir = value();
        break;
      case "--force":
        opts.force = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      default:
        if (a.startsWith("-")) throw new SkillsUsageError(`Unknown option ${a}`);
        if (opts.command) throw new SkillsUsageError(`Unexpected argument ${a}`);
        opts.command = a;
    }
  }
  return opts;
}

/**
 * Folder of the packaged skills next to `src/`.
 * @returns {string}
 */
function defaultSkillsRoot() {
  return fileURLToPath(new URL("../../skills/", import.meta.url));
}

/**
 * Run the `skills` subcommand.
 * @param {string[]} argv Arguments after `skills`, e.g. `["install", "--tool", "claude"]`.
 * @param {import("./install.mjs").SkillsIo} [io] File-system and console access; defaults to Node's.
 * @returns {Promise<number>} Process exit code: 0 success, 1 failure or nothing written, 2 usage error.
 */
export async function runSkillsCommand(argv, io) {
  const env = io ?? (await import("./node_io.mjs")).createNodeIo();
  try {
    const opts = parseArgs(argv);
    if (opts.help || opts.command === "" || opts.command === "help") {
      env.stdout.write(HELP);
      return opts.command === "" && !opts.help ? 2 : 0;
    }
    const root = path.resolve(env.skillsRoot ?? defaultSkillsRoot());
    if (opts.command === "path") {
      env.stdout.write(`${path.join(root, SKILL_NAME)}\n`);
      return 0;
    }
    if (opts.command === "list") {
      const width = Math.max(...TARGETS.map((t) => t.id.length));
      env.stdout.write(
        `${"TOOL".padEnd(width)}  KIND   PROJECT PATH  |  USER PATH (--scope user)\n`,
      );
      for (const t of TARGETS) {
        const user = t.user ? `~/${t.user}` : "-";
        env.stdout.write(
          `${t.id.padEnd(width)}  ${t.kind.padEnd(5)}  ${t.project}  |  ${user}  (${t.label})\n`,
        );
      }
      return 0;
    }
    if (opts.command !== "install") throw new SkillsUsageError(`Unknown command ${opts.command}`);
    const scope = opts.scope ?? "project";
    if (scope !== "project" && scope !== "user")
      throw new SkillsUsageError(`Unknown scope "${scope}" (use project or user)`);
    const bundle = await loadBundle(env, root);
    const results = await installSkills(
      { tools: opts.tools, scope, dir: opts.dir, force: opts.force, dryRun: opts.dryRun },
      env,
      bundle,
    );
    let skipped = 0;
    for (const r of results) {
      if (r.status === "exists") {
        skipped++;
        env.stderr.write(`exists: ${r.tool} → ${r.root} (use --force to overwrite)\n`);
        continue;
      }
      const verb = r.status === "installed" ? "installed" : "would install";
      env.stdout.write(
        `${verb}: ${r.tool} → ${r.root} (${r.files.length} file${r.files.length === 1 ? "" : "s"})\n`,
      );
      if (opts.dryRun) for (const f of r.files) env.stdout.write(`  ${f}\n`);
    }
    return skipped > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof SkillsUsageError) {
      env.stderr.write(`excaliplant skills: ${err.message}\n`);
      return 2;
    }
    env.stderr.write(`excaliplant skills: ${/** @type {Error} */ (err).message}\n`);
    return 1;
  }
}
