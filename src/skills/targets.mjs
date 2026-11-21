/**
 * Where each tool looks for skills or rule files. Locations come from the
 * tools' own documentation (see docs/skills.md for the sources); they are data,
 * so a moved directory is a one-line change here.
 * @module skills/targets
 */

/** Folder name of the skill, also the `name` in its frontmatter. */
export const SKILL_NAME = "excaliplant";

/**
 * @typedef {object} Target
 * @property {string} id Value of `--tool`.
 * @property {string} label Human name.
 * @property {"skill" | "rule"} kind `skill` copies the skill folder, `rule` writes one rule file.
 * @property {string} project Path below the project root (skills: the skills directory).
 * @property {string | null} user Path below the home directory, `null` when the tool has none.
 * @property {"cursor" | "windsurf" | "plain" | "copilot"} [format] Rule file flavour.
 * @property {string} [note]
 */

/** @type {readonly Target[]} */
export const TARGETS = Object.freeze([
  {
    id: "claude",
    label: "Claude Code",
    kind: "skill",
    project: ".claude/skills",
    user: ".claude/skills",
  },
  {
    id: "agents",
    label: "Universal .agents/skills (Codex, Cursor, Copilot, Gemini CLI, opencode, Antigravity)",
    kind: "skill",
    project: ".agents/skills",
    user: ".agents/skills",
  },
  {
    id: "codex",
    label: "OpenAI Codex",
    kind: "skill",
    project: ".agents/skills",
    user: ".agents/skills",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "skill",
    project: ".gemini/skills",
    user: ".gemini/skills",
  },
  {
    id: "opencode",
    label: "opencode",
    kind: "skill",
    project: ".opencode/skills",
    user: ".config/opencode/skills",
    note: "User scope assumes the default XDG config directory.",
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "skill",
    project: ".cursor/skills",
    user: ".cursor/skills",
  },
  {
    id: "copilot",
    label: "GitHub Copilot",
    kind: "skill",
    project: ".github/skills",
    user: ".copilot/skills",
  },
  {
    id: "antigravity",
    label: "Google Antigravity",
    kind: "skill",
    project: ".agents/skills",
    user: ".gemini/config/skills",
  },
  {
    id: "cursor-rules",
    label: "Cursor project rule (.mdc)",
    kind: "rule",
    format: "cursor",
    project: ".cursor/rules/excaliplant.mdc",
    user: null,
  },
  {
    id: "windsurf",
    label: "Windsurf rule",
    kind: "rule",
    format: "windsurf",
    project: ".windsurf/rules/excaliplant.md",
    user: null,
  },
  {
    id: "cline",
    label: "Cline rule",
    kind: "rule",
    format: "plain",
    project: ".clinerules/excaliplant.md",
    user: "Documents/Cline/Rules/excaliplant.md",
  },
  {
    id: "roo",
    label: "Roo Code rule",
    kind: "rule",
    format: "plain",
    project: ".roo/rules/excaliplant.md",
    user: ".roo/rules/excaliplant.md",
  },
  {
    id: "copilot-instructions",
    label: "GitHub Copilot custom instructions",
    kind: "rule",
    format: "copilot",
    project: ".github/instructions/excaliplant.instructions.md",
    user: null,
  },
]);

/** Alternative spellings accepted by `--tool`. */
export const ALIASES = Object.freeze({
  "claude-code": "claude",
  "gemini-cli": "gemini",
  "github-copilot": "copilot",
  "copilot-cli": "copilot",
  "roo-code": "roo",
  "open-code": "opencode",
});

/** Tools installed by `--tool all` (skills only; `--tool rules` selects the rule tools). */
export const ALL_SKILL_TOOLS = Object.freeze([
  "claude",
  "agents",
  "gemini",
  "opencode",
  "cursor",
  "copilot",
  "antigravity",
]);

/** Tools installed by `--tool rules`. */
export const ALL_RULE_TOOLS = Object.freeze([
  "cursor-rules",
  "windsurf",
  "cline",
  "roo",
  "copilot-instructions",
]);

/**
 * Look a target up by id or alias.
 * @param {string} id
 * @returns {Target | undefined}
 */
export function findTarget(id) {
  const key = id.toLowerCase();
  const canonical = /** @type {Record<string, string>} */ (ALIASES)[key] ?? key;
  return TARGETS.find((t) => t.id === canonical);
}
