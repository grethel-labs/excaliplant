// JSDoc → single-page API Markdown generator.
//
// Walks every `.mjs` source file under `src/` plus the entry
// `index.mjs`, parses the leading JSDoc block in front of each
// `export` declaration, and returns a structured model that the
// nunjucks template (`docs/API.template.md.njk`) renders into a
// single Markdown document at `docs/API.md`.
//
// The parser is intentionally regex-based — full JS AST parsing
// would pull in additional dependencies (acorn etc.) and the
// existing `extract-docs.mjs` already proves a regex extractor is
// reliable enough for our JSDoc style. Edge cases this code handles
// explicitly:
//
//   * leading `*` lines stripped with the same helper as
//     `extract-docs.mjs`;
//   * `@param`, `@returns`, `@template`, `@public`, `@internal`,
//     `@deprecated`, `@throws`, `@example`;
//   * `export` declarations of `function`, `class`, `const`, `let`,
//     `async function`;
//   * class bodies are extracted via brace-balanced scan and method
//     JSDoc blocks are pulled out (constructor + public methods).
//
// What is intentionally *not* handled (would over-engineer this):
//
//   * decorators, generators, getters/setters with complex types;
//   * `export default` (the codebase only uses named exports);
//   * type-only exports (`export type Foo = …`); JSDoc `@typedef`
//     blocks are surfaced under the "types" section instead.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const BLOCK_RE = /\/\*\*([\s\S]*?)\*\//g;
const EXPORT_RE = /export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

/**
 * @typedef {{
 *   name: string,
 *   kind: "function"|"class"|"const"|"let"|"var",
 *   async: boolean,
 *   signature: string,
 *   description: string,
 *   params: {name:string,type:string,description:string,optional:boolean}[],
 *   returns: {type:string,description:string} | null,
 *   templates: string[],
 *   visibility: "public"|"internal"|"unspecified",
 *   deprecated: string | null,
 *   throws: string[],
 *   examples: string[],
 *   members?: ApiSymbol[],
 * }} ApiSymbol
 *
 * @typedef {{
 *   name: string,
 *   relPath: string,
 *   description: string,
 *   typedefs: {name:string,description:string,raw:string}[],
 *   symbols: ApiSymbol[],
 * }} ApiModule
 */

/**
 * Walk `roots` and return a structured API model grouped per module.
 *
 * @param {string[]} roots Absolute paths to files or directories.
 * @param {string} repoRoot Absolute path to the repository root, used
 *   to compute clean relative paths for the output document.
 * @returns {Promise<ApiModule[]>}
 */
export async function buildApiModel(roots, repoRoot) {
  const files = [];
  for (const r of roots) {
    const s = await stat(r);
    if (s.isDirectory()) files.push(...(await collectFiles(r)));
    else files.push(r);
  }
  files.sort();
  /** @type {ApiModule[]} */
  const out = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const mod = parseModule(text, file, repoRoot);
    if (mod.symbols.length === 0 && mod.typedefs.length === 0) continue;
    out.push(mod);
  }
  return out;
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} d */
  const walk = async (d) => {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile() && /\.mjs$/.test(p)) out.push(p);
    }
  };
  await walk(dir);
  return out;
}

/**
 * @param {string} text Raw file content.
 * @param {string} file Absolute file path.
 * @param {string} repoRoot Absolute repository root.
 * @returns {ApiModule}
 */
function parseModule(text, file, repoRoot) {
  const relPath = path.relative(repoRoot, file).split(path.sep).join("/");
  // Module-level description: first JSDoc at column 0 with no @export
  // anchor, prior to any `export`. We special-case `@module` blocks
  // (used by `extract-docs.mjs` for the README) and bare top-of-file
  // doc blocks.
  let description = "";
  /** @type {{name:string,description:string,raw:string}[]} */
  const typedefs = [];
  /** @type {ApiSymbol[]} */
  const symbols = [];

  // Collect typedef + module-level descriptions.
  for (const m of text.matchAll(BLOCK_RE)) {
    const body = stripStars(m[1]);
    const td = body.match(/@typedef\s+\{([\s\S]+?)\}\s+([A-Za-z_$][\w$]*)/);
    if (td) {
      typedefs.push({
        name: td[2],
        description: extractTypedefDescription(body),
        raw: td[1].trim(),
      });
      continue;
    }
    if (!description) {
      const trimmed = body.trim();
      if (trimmed && !/@(param|returns|public|internal|diagram)/.test(trimmed.split("\n")[0])) {
        // Use the first leading paragraph if it looks like prose
        // rather than a single tag line.
        if (m.index !== undefined && text.slice(0, m.index).trim() === "") {
          description = stripTags(body).trim();
        }
      }
    }
  }

  // Walk every `export` declaration and pair it with the JSDoc block
  // that precedes it (closest preceding block on a separate line).
  /** @type {{idx:number,body:string}[]} */
  const blocks = [];
  for (const m of text.matchAll(BLOCK_RE)) {
    blocks.push({ idx: m.index ?? 0, body: stripStars(m[1]) });
  }

  for (const m of text.matchAll(EXPORT_RE)) {
    const exportIdx = m.index ?? 0;
    const kindRaw = m[1];
    const name = m[2];
    const isAsync = /^async/.test(kindRaw);
    /** @type {ApiSymbol["kind"]} */
    let kind = "const";
    if (/function/.test(kindRaw)) kind = "function";
    else if (kindRaw === "class") kind = "class";
    else if (kindRaw === "let") kind = "let";
    else if (kindRaw === "var") kind = "var";
    else if (kindRaw === "const") kind = "const";

    // Find the closest preceding doc block (must be on its own line
    // and end before the export).
    let doc = "";
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].idx >= exportIdx) continue;
      const between = text.slice(blocks[i].idx, exportIdx);
      // Only match if there's just whitespace + at most blank lines
      // between the comment and the export.
      const closeIdx = between.indexOf("*/") + 2;
      const tail = between.slice(closeIdx);
      if (/^\s*$/.test(tail)) {
        doc = blocks[i].body;
      }
      break;
    }
    const sym = parseSymbol({ kind, name, isAsync, text, exportIdx, doc });
    symbols.push(sym);
  }

  // For classes, attach method members.
  for (const sym of symbols) {
    if (sym.kind !== "class") continue;
    sym.members = parseClassMembers(text, sym.name);
  }

  return { name: deriveModuleName(relPath), relPath, description, typedefs, symbols };
}

/**
 * Extract a free-form description from a typedef block (everything
 * before the first `@` tag line, with the `@typedef` line stripped).
 *
 * @param {string} body
 * @returns {string}
 */
function extractTypedefDescription(body) {
  const lines = body.split("\n");
  /** @type {string[]} */
  const out = [];
  let seenTypedef = false;
  for (const line of lines) {
    if (/^\s*@typedef\b/.test(line)) {
      seenTypedef = true;
      continue;
    }
    if (!seenTypedef) continue;
    if (/^\s*@\w+/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Convert a name like `src/general/render/svg.mjs` into a friendly module id.
 * `index.mjs` becomes the package root entry.
 *
 * @param {string} rel Repo-relative path.
 * @returns {string}
 */
function deriveModuleName(rel) {
  if (rel === "index.mjs") return "(package root)";
  return rel.replace(/^src\//, "").replace(/\.mjs$/, "");
}

/**
 * @param {string} raw
 * @returns {string}
 */
function stripStars(raw) {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, ""))
    .join("\n");
}

/**
 * Strip the `@tag` section of a JSDoc body so only the leading prose
 * remains. JSDoc descriptions always come before the first tag, so a
 * simple cut-at-first-`@tag` is the most reliable rule.
 *
 * @param {string} body
 * @returns {string}
 */
function stripTags(body) {
  /** @type {string[]} */
  const out = [];
  for (const line of body.split("\n")) {
    if (/^\s*@\w+/.test(line)) break;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * @param {{kind:ApiSymbol["kind"],name:string,isAsync:boolean,text:string,exportIdx:number,doc:string}} args
 * @returns {ApiSymbol}
 */
function parseSymbol({ kind, name, isAsync, text, exportIdx, doc }) {
  const description = extractDescription(doc);
  const params = extractParams(doc);
  const returns = extractReturns(doc);
  const templates = extractAllTagValues(doc, "template");
  const throws = extractAllTagValues(doc, "throws");
  const examples = extractExamples(doc);
  /** @type {ApiSymbol["visibility"]} */
  const visibility = /@public\b/.test(doc)
    ? "public"
    : /@internal\b/.test(doc)
      ? "internal"
      : "unspecified";
  const deprecatedMatch = doc.match(/@deprecated\s*([^\n]*)/);
  const deprecated = deprecatedMatch ? deprecatedMatch[1].trim() || "deprecated" : null;

  let signature = "";
  if (kind === "function") {
    signature =
      (isAsync ? "async function " : "function ") +
      name +
      extractFunctionSignature(text, exportIdx);
  } else if (kind === "class") {
    signature = `class ${name}`;
    const heritage = extractClassHeritage(text, exportIdx, name);
    if (heritage) signature += ` ${heritage}`;
  } else {
    signature = `${kind} ${name}`;
  }

  return {
    name,
    kind,
    async: isAsync,
    signature,
    description,
    params,
    returns,
    templates,
    visibility,
    deprecated,
    throws,
    examples,
  };
}

/**
 * Pull the first prose paragraph out of a JSDoc body.
 *
 * @param {string} doc
 * @returns {string}
 */
function extractDescription(doc) {
  if (!doc) return "";
  return stripTags(doc).trim();
}

/**
 * @param {string} doc
 * @returns {ApiSymbol["params"]}
 */
function extractParams(doc) {
  /** @type {ApiSymbol["params"]} */
  const out = [];
  const re = /^@param\b/gm;
  let m;
  while ((m = re.exec(doc)) !== null) {
    let i = (m.index ?? 0) + m[0].length;
    while (i < doc.length && /[ \t]/.test(doc[i])) i++;
    /** @type {string} */
    let type = "";
    if (doc[i] === "{") {
      let depth = 1;
      let j = i + 1;
      for (; j < doc.length && depth > 0; j++) {
        if (doc[j] === "{") depth++;
        else if (doc[j] === "}") depth--;
      }
      type = doc
        .slice(i + 1, j - 1)
        .replace(/\s+/g, " ")
        .trim();
      i = j;
    }
    while (i < doc.length && /[ \t]/.test(doc[i])) i++;
    // Name (possibly bracketed for optional, possibly with default)
    const nameMatch = doc.slice(i).match(/^(\[[^\]]+\]|[\w.$]+)/);
    if (!nameMatch) continue;
    let nameRaw = nameMatch[1];
    i += nameRaw.length;
    let optional = false;
    let defaultValue = "";
    if (nameRaw.startsWith("[") && nameRaw.endsWith("]")) {
      optional = true;
      nameRaw = nameRaw.slice(1, -1);
      const eq = nameRaw.indexOf("=");
      if (eq >= 0) {
        defaultValue = nameRaw.slice(eq + 1).trim();
        nameRaw = nameRaw.slice(0, eq).trim();
      }
    }
    if (nameRaw.includes(".")) continue; // skip nested @param paths
    // Description: rest of line + indented continuation lines until
    // next @tag or blank line.
    const tail = doc.slice(i);
    const stop = tail.search(/\n\s*@\w+|\n\s*\n/);
    const descChunk = stop >= 0 ? tail.slice(0, stop) : tail;
    const description = descChunk
      .replace(/^[ \t-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    out.push({
      name: nameRaw,
      type,
      description: defaultValue
        ? `${description}${description ? " " : ""}_(default: \`${defaultValue}\`)_`
        : description,
      optional,
    });
  }
  return out;
}

/**
 * @param {string} doc
 * @returns {ApiSymbol["returns"]}
 */
function extractReturns(doc) {
  const m = doc.match(/^@returns?\b/m);
  if (!m) return null;
  const start = (m.index ?? 0) + m[0].length;
  let i = start;
  while (i < doc.length && /\s/.test(doc[i])) i++;
  /** @type {string} */
  let type = "";
  if (doc[i] === "{") {
    let depth = 1;
    let j = i + 1;
    for (; j < doc.length && depth > 0; j++) {
      if (doc[j] === "{") depth++;
      else if (doc[j] === "}") depth--;
    }
    type = doc
      .slice(i + 1, j - 1)
      .replace(/\s+/g, " ")
      .trim();
    i = j;
  }
  // Description = everything from i up to the next @tag or end.
  const tail = doc.slice(i);
  const stop = tail.search(/\n\s*@\w+/);
  const desc = (stop >= 0 ? tail.slice(0, stop) : tail).trim();
  return { type, description: desc };
}

/**
 * @param {string} doc
 * @param {string} tag
 * @returns {string[]}
 */
function extractAllTagValues(doc, tag) {
  /** @type {string[]} */
  const out = [];
  const re = new RegExp(`^@${tag}\\b\\s*([^\\n]*)`, "gm");
  let m;
  while ((m = re.exec(doc)) !== null) {
    const value = m[1].trim();
    if (value) out.push(value);
  }
  return out;
}

/**
 * @param {string} doc
 * @returns {string[]}
 */
function extractExamples(doc) {
  /** @type {string[]} */
  const out = [];
  const re = /^@example\b[^\n]*\n([\s\S]*?)(?=^@\w+|$)/gm;
  let m;
  while ((m = re.exec(doc)) !== null) out.push(m[1].replace(/\n$/, ""));
  return out;
}

/**
 * Extract `(...)` for a function declaration starting at `exportIdx`.
 *
 * @param {string} text
 * @param {number} exportIdx
 * @returns {string}
 */
function extractFunctionSignature(text, exportIdx) {
  const open = text.indexOf("(", exportIdx);
  if (open < 0) return "()";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return text.slice(open, i + 1).replace(/\s+/g, " ");
    }
  }
  return "(…)";
}

/**
 * Extract `extends Foo implements Bar` for `class X` declarations.
 *
 * @param {string} text
 * @param {number} exportIdx
 * @param {string} className
 * @returns {string}
 */
function extractClassHeritage(text, exportIdx, className) {
  const declRe = new RegExp(`class\\s+${className}\\b([^\\{]*)\\{`);
  const m = text.slice(exportIdx).match(declRe);
  if (!m) return "";
  return m[1].trim();
}

/**
 * For `export class X { ... }`, find every method declaration whose
 * preceding JSDoc block annotates it, and return them as `ApiSymbol`s
 * with a `parentClass`-style description.
 *
 * @param {string} text
 * @param {string} className
 * @returns {ApiSymbol[]}
 */
function parseClassMembers(text, className) {
  const declMatch = new RegExp(`class\\s+${className}\\b[^\\{]*\\{`).exec(text);
  if (!declMatch) return [];
  const start = declMatch.index + declMatch[0].length;
  // Find the matching closing brace.
  let depth = 1;
  let end = start;
  let inString = false;
  /** @type {string} */
  let quote = "";
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) inString = false;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = text.slice(start, end);
  // Collect JSDoc blocks inside the class body.
  /** @type {{idx:number,body:string}[]} */
  const blocks = [];
  for (const m of body.matchAll(BLOCK_RE)) {
    blocks.push({ idx: m.index ?? 0, body: stripStars(m[1]) });
  }
  // Method header: `name(...)` or `async name(...)` or `static name(...)`.
  const methodRe = /(?:^|\n)\s*(static\s+)?(async\s+)?(get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
  /** @type {ApiSymbol[]} */
  const out = [];
  let m;
  while ((m = methodRe.exec(body)) !== null) {
    const name = m[4];
    if (name === "if" || name === "for" || name === "while" || name === "switch") continue;
    const headerIdx = m.index + m[0].lastIndexOf(name);
    let doc = "";
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].idx >= headerIdx) continue;
      const between = body.slice(blocks[i].idx, headerIdx);
      const closeIdx = between.indexOf("*/") + 2;
      const tail = between.slice(closeIdx);
      if (/^\s*$/.test(tail)) doc = blocks[i].body;
      break;
    }
    if (!doc) continue;
    if (/@internal\b/.test(doc) && !/@public\b/.test(doc)) continue;
    const description = extractDescription(doc);
    const params = extractParams(doc);
    const returns = extractReturns(doc);
    const isAsync = !!m[2];
    const isGetter = !!m[3] && m[3].trim() === "get";
    const isSetter = !!m[3] && m[3].trim() === "set";
    const sigPrefix = `${m[1] ? "static " : ""}${isAsync ? "async " : ""}${isGetter ? "get " : isSetter ? "set " : ""}`;
    const sig = sigPrefix + name + extractFunctionSignature(body, headerIdx);
    out.push({
      name,
      kind: "function",
      async: isAsync,
      signature: sig,
      description,
      params,
      returns,
      templates: [],
      visibility: /@public\b/.test(doc) ? "public" : "unspecified",
      deprecated: null,
      throws: [],
      examples: extractExamples(doc),
    });
  }
  return out;
}
