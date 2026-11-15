/**
 * Source handling: split a text into `@startX … @endX` blocks, strip PlantUML
 * comments and split pages at `newpage`.
 * @module core/source
 */

import { LimitError } from "./errors.mjs";

/**
 * A single source line with its original 1-based line number.
 * @typedef {object} SourceLine
 * @property {string} text
 * @property {number} line
 */

/**
 * @typedef {object} SourceBlock
 * @property {string} type Start keyword without `@start`, e.g. `uml`, `json`, `mindmap`.
 * @property {string | null} name Optional block name (`@startuml name` / `@startuml(id=name)`).
 * @property {SourceLine[]} lines Lines between the start and end markers.
 * @property {number} line Line number of the start marker.
 */

const START_RE = /^\s*@start([a-z]+)\b\s*(.*)$/i;
const END_RE = /^\s*@end([a-z]+)\b/i;

/**
 * Split raw text into blocks. Text without any `@start` marker is treated as a
 * single implicit `@startuml` block, which matches how most PlantUML tools
 * behave with bare snippets.
 * @param {string} text
 * @param {{ maxBlocks?: number }} [options]
 * @returns {SourceBlock[]}
 */
export function extractBlocks(text, options = {}) {
  const maxBlocks = options.maxBlocks ?? 100;
  const raw = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  /** @type {SourceBlock[]} */
  const blocks = [];
  /** @type {SourceBlock | null} */
  let current = null;
  for (let i = 0; i < raw.length; i++) {
    const lineText = raw[i];
    if (!current) {
      const m = START_RE.exec(lineText);
      if (m) {
        if (blocks.length >= maxBlocks)
          throw new LimitError(`More than ${maxBlocks} diagram blocks`);
        current = { type: m[1].toLowerCase(), name: parseBlockName(m[2]), lines: [], line: i + 1 };
      }
      continue;
    }
    const end = END_RE.exec(lineText);
    if (end && end[1].toLowerCase() === current.type) {
      blocks.push(current);
      current = null;
      continue;
    }
    current.lines.push({ text: lineText, line: i + 1 });
  }
  if (current) blocks.push(current);
  if (blocks.length === 0) {
    const lines = raw.map((t, i) => ({ text: t, line: i + 1 }));
    blocks.push({ type: "uml", name: null, lines, line: 1 });
  }
  return blocks;
}

/**
 * @param {string} rest Text after `@startX`.
 * @returns {string | null}
 */
function parseBlockName(rest) {
  const trimmed = rest.trim();
  if (!trimmed) return null;
  const id = /^\(\s*id\s*=\s*([^)]+)\)/i.exec(trimmed);
  if (id) return id[1].trim();
  return trimmed.replace(/^["']|["']$/g, "");
}

/**
 * Remove PlantUML comments: whole-line `'` comments and (possibly multi-line)
 * `/' … '/` block comments. Quoted strings are respected for block comment
 * openers so labels like `"/'"` survive.
 * @param {SourceLine[]} lines
 * @returns {SourceLine[]}
 */
export function stripComments(lines) {
  /** @type {SourceLine[]} */
  const out = [];
  let inBlock = false;
  for (const { text, line } of lines) {
    let rest = text;
    let kept = "";
    while (rest.length) {
      if (inBlock) {
        const close = rest.indexOf("'/");
        if (close < 0) {
          rest = "";
          break;
        }
        rest = rest.slice(close + 2);
        inBlock = false;
        continue;
      }
      const open = findUnquoted(rest, "/'");
      if (open < 0) {
        kept += rest;
        rest = "";
        break;
      }
      kept += rest.slice(0, open);
      rest = rest.slice(open + 2);
      inBlock = true;
    }
    if (/^\s*'/.test(kept)) continue;
    if (kept.trim() === "" && text.trim() !== "") continue;
    out.push({ text: kept, line });
  }
  return out;
}

/**
 * @param {string} text
 * @param {string} needle
 * @returns {number}
 */
function findUnquoted(text, needle) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    else if (!quoted && text.startsWith(needle, i)) return i;
  }
  return -1;
}

/**
 * Split block lines at `newpage` separators.
 * @param {SourceLine[]} lines
 * @returns {SourceLine[][]}
 */
export function splitPages(lines) {
  /** @type {SourceLine[][]} */
  const pages = [[]];
  for (const l of lines) {
    if (/^\s*newpage\b/i.test(l.text)) pages.push([]);
    else pages[pages.length - 1].push(l);
  }
  return pages.filter((p, i) => i === 0 || p.some((l) => l.text.trim() !== ""));
}
