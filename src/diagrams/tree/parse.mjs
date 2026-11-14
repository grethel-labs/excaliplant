/**
 * Outline parser shared by MindMap and WBS: OrgMode (`*`, `**`), +/- side
 * markers, Markdown-style indentation, colours `*[#red]`, boxless `*_`,
 * multi-line `*:text;` nodes and `left side` / `right side` switches.
 * @module diagrams/tree/parse
 */

import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { LimitError } from "../../core/errors.mjs";

/**
 * @typedef {object} TreeNode
 * @property {string} text
 * @property {TreeNode[]} children
 * @property {"left" | "right"} side
 * @property {import("../../syntax/color.mjs").ColorSpec} colors
 * @property {boolean} boxless
 * @property {number} depth 0 = root.
 * @property {number} branch Index of the root child this node descends from.
 * @property {string[]} stereotypes
 */

/**
 * @typedef {object} TreeModel
 * @property {import("../../syntax/commons.mjs").DiagramMeta} meta
 * @property {TreeNode[]} roots
 * @property {boolean} leftDirection WBS `left direction` (children hang left).
 */

const NODE_RE = /^(\s*)([*+\-#]+)(\[[^\]]*\])?(_)?\s*(<<[^>]*>>)?\s*([<>])?\s*(.*)$/;

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 * @returns {TreeModel}
 */
export function parseOutline(lines, module) {
  /** @type {TreeModel} */
  const model = { meta: createMeta(), roots: [], leftDirection: false };
  const reader = new LineReader(lines);
  /** @type {TreeNode[]} */
  const stack = [];
  /** @type {number[]} */
  const indents = [];
  let side = /** @type {"left" | "right"} */ ("right");
  let count = 0;
  while (!reader.done) {
    const src = reader.next();
    const raw = src.text;
    const line = raw.trim();
    if (!line) continue;
    if (/^left\s+side$/i.test(line)) {
      side = "left";
      continue;
    }
    if (/^right\s+side$/i.test(line)) {
      side = "right";
      continue;
    }
    if (/^(left|right|top|bottom)\s+(to\s+\w+\s+)?direction$/i.test(line)) {
      model.leftDirection = /^left/i.test(line);
      continue;
    }
    const m = NODE_RE.exec(raw);
    if (!m || (m[2].length === 1 && m[2] === "-" && !m[7] && !m[3]) || !/^\s*[*+\-#]/.test(raw)) {
      if (parseCommon(line, model.meta, reader)) continue;
      module.diagnostics.unknown(line, src.line);
      continue;
    }
    const marker = m[2];
    let depth;
    if (marker.length === 1 && m[1].length > 0) {
      // Markdown style: depth from indentation.
      const ind = m[1].replace(/\t/g, "    ").length;
      while (indents.length && indents[indents.length - 1] >= ind && indents[indents.length - 1] !== ind) indents.pop();
      if (!indents.includes(ind)) indents.push(ind);
      depth = indents.indexOf(ind) + 2;
    } else {
      depth = marker.length;
      if (marker.length === 1) indents.length = 0;
    }
    let text = m[7];
    if (text.startsWith(":")) {
      text = text.slice(1);
      while (!/;\s*$/.test(text) && !reader.done) text += `\n${reader.next().text}`;
      text = text.replace(/;\s*$/, "");
    }
    const nodeSide = marker[0] === "-" ? "left" : marker[0] === "+" ? "right" : side;
    /** @type {TreeNode} */
    const node = {
      text: label(text.trim()),
      children: [],
      side: nodeSide,
      colors: m[3] ? parseColorSpec(m[3].slice(1, -1)) : {},
      boxless: !!m[4],
      depth: depth - 1,
      branch: 0,
      stereotypes: m[5] ? [m[5].slice(2, -2)] : [],
    };
    if (++count > module.limits.maxNodes) throw new LimitError("Tree has too many nodes");
    stack.length = Math.min(stack.length, depth - 1);
    const parent = stack[depth - 2];
    if (parent) {
      parent.children.push(node);
      node.branch = parent.depth === 0 ? parent.children.length - 1 : parent.branch;
    } else model.roots.push(node);
    stack[depth - 1] = node;
  }
  return model;
}
