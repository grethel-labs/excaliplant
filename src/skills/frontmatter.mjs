/**
 * Minimal reader and validator for `SKILL.md` frontmatter (Agent Skills spec,
 * https://agentskills.io/specification). It understands exactly the YAML subset
 * skills use: scalar `key: value` pairs (plain or quoted) and one level of
 * nested string maps (`metadata:`).
 * @module skills/frontmatter
 */

/** Frontmatter keys accepted by claude.ai uploads and the Skills API. */
export const PORTABLE_KEYS = Object.freeze([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/**
 * Longest `description` every documented consumer accepts. The Agent Skills
 * spec allows 1024 characters, but Anthropic's help center for claude.ai
 * documents 200; staying below the stricter limit keeps one file portable.
 */
export const MAX_DESCRIPTION = 200;

/**
 * @typedef {object} Frontmatter
 * @property {Record<string, string | Record<string, string>>} data Parsed fields.
 * @property {string} body Markdown after the closing delimiter.
 */

/**
 * @param {string} raw
 * @returns {string}
 */
function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v
      .slice(1, -1)
      .replace(/\\(["\\])/g, "$1")
      .replace(/\\n/g, "\n");
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

/**
 * Split `SKILL.md` text into frontmatter fields and body.
 * @param {string} text
 * @returns {Frontmatter}
 * @throws {Error} When the frontmatter block is missing or malformed.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error("SKILL.md must start with a --- frontmatter block");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error("Frontmatter block is not closed with ---");
  /** @type {Record<string, string | Record<string, string>>} */
  const data = Object.create(null);
  /** @type {Record<string, string> | null} */
  let map = null;
  /** @type {string | null} Key of a scalar whose value continues on indented lines. */
  let scalarKey = null;
  /** @type {string[]} */
  let scalarParts = [];
  const flush = () => {
    if (scalarKey !== null) data[scalarKey] = unquote(scalarParts.join(" "));
    scalarKey = null;
    scalarParts = [];
  };
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      // Indented: either an entry of the metadata map or the continuation of
      // a long scalar (formatters fold long descriptions onto several lines).
      const nested = /^\s+([^\s:][^:]*):(.*)$/.exec(line);
      if (map && nested) map[nested[1].trim()] = unquote(nested[2]);
      else if (scalarKey !== null) scalarParts.push(line.trim());
      else throw new Error(`Unexpected indented line ${i + 1} in frontmatter`);
      continue;
    }
    flush();
    const top = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!top) throw new Error(`Cannot parse frontmatter line ${i + 1}: ${line}`);
    const [, key, rest] = top;
    if (key in data) throw new Error(`Duplicate frontmatter key ${key}`);
    map = null;
    if (key === "metadata" && rest.trim() === "") {
      map = Object.create(null);
      data[key] = /** @type {Record<string, string>} */ (map);
    } else {
      scalarKey = key;
      scalarParts = rest.trim() ? [rest.trim()] : [];
    }
  }
  flush();
  return { data, body: lines.slice(end + 1).join("\n") };
}

/**
 * Check a `SKILL.md` against the Agent Skills spec plus the stricter rules of
 * claude.ai uploads (six frontmatter keys, no XML tags, no reserved words).
 * @param {string} text Full `SKILL.md` text.
 * @param {string} dirName Name of the folder that contains it.
 * @returns {string[]} Problems; empty when the skill is valid.
 */
export function validateSkill(text, dirName) {
  /** @type {string[]} */
  const problems = [];
  /** @type {Frontmatter} */
  let fm;
  try {
    fm = parseFrontmatter(text);
  } catch (err) {
    return [/** @type {Error} */ (err).message];
  }
  const { data } = fm;
  for (const key of Object.keys(data)) {
    if (!PORTABLE_KEYS.includes(key)) problems.push(`Unsupported frontmatter key: ${key}`);
  }
  const name = data.name;
  if (typeof name !== "string" || !name) problems.push("name is required");
  else {
    if (name.length > 64) problems.push("name is longer than 64 characters");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name))
      problems.push("name must be lowercase letters, digits and single hyphens");
    if (name !== dirName) problems.push(`name "${name}" must match the folder "${dirName}"`);
    if (/anthropic|claude/.test(name)) problems.push("name contains a reserved word");
  }
  const description = data.description;
  if (typeof description !== "string" || !description.trim())
    problems.push("description is required");
  else {
    if (description.length > MAX_DESCRIPTION)
      problems.push(`description is longer than ${MAX_DESCRIPTION} characters`);
    if (/<\/?[a-z][^>]*>/i.test(description)) problems.push("description contains an XML tag");
  }
  const compatibility = data.compatibility;
  if (compatibility !== undefined) {
    if (typeof compatibility !== "string" || compatibility.length < 1 || compatibility.length > 500)
      problems.push("compatibility must be 1-500 characters");
  }
  const metadata = data.metadata;
  if (metadata !== undefined && (typeof metadata !== "object" || metadata === null))
    problems.push("metadata must be a map of strings");
  if (!fm.body.trim()) problems.push("SKILL.md body is empty");
  return problems;
}
