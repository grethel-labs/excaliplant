// Tiny JSDoc extractor.
//
// Walks src/, parses block comments, and returns blocks that are
// explicitly tagged with `@diagram <id>` (rendered under the matching
// SVG in the README) or `@module <name>` (rendered in the
// "Module documentation" section).
//
// Format expected in the source code:
//
//   /**
//    * @diagram modules
//    *
//    * The module graph shows the parser, layout and renderer
//    * subsystems …
//    */
//
// Markdown is supported verbatim inside the comment body — leading
// `* ` is stripped per line.
//
// We deliberately avoid a full AST parser (acorn etc.); the regex
// approach keeps zero dependencies and is enough for our doc tags.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const BLOCK_RE = /\/\*\*([\s\S]*?)\*\//g;

/**
 * @param {string|string[]} roots  Directory or list of files/directories.
 * @returns {Promise<Record<string, string>>}  key → markdown body.
 */
export async function extractDocBlocks(roots) {
  const list = Array.isArray(roots) ? roots : [roots];
  const out = {};
  const files = [];
  const { stat } = await import("node:fs/promises");
  for (const r of list) {
    const s = await stat(r);
    if (s.isDirectory()) files.push(...await collectFiles(r));
    else files.push(r);
  }
  for (const file of files) {
    const text = await readFile(file, "utf8");
    let m;
    while ((m = BLOCK_RE.exec(text)) !== null) {
      const body = stripStars(m[1]);
      const tag = parseTag(body);
      if (!tag) continue;
      out[tag.key] = tag.body;
    }
  }
  return out;
}

function parseTag(body) {
  const diagram = body.match(/^\s*@diagram\s+(\S+)\s*\n([\s\S]*)$/m);
  if (diagram) return { key: `diagram:${diagram[1].trim()}`, body: diagram[2].trim() };
  const mod = body.match(/^\s*@module\s+(\S+)\s*\n([\s\S]*)$/m);
  if (mod) return { key: mod[1].trim(), body: mod[2].trim() };
  return null;
}

function stripStars(raw) {
  return raw.split("\n").map((l) => l.replace(/^\s*\*\s?/, "")).join("\n");
}

async function collectFiles(dir) {
  const out = [];
  const walk = async (d) => {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile() && /\.(mjs|js|ts)$/.test(p)) out.push(p);
    }
  };
  await walk(dir);
  return out;
}
