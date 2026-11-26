/**
 * File tree diagrams (`@startfiles`): one path per line, optional
 * `: note` suffix and `<note>…</note>` blocks attached to the last path.
 * @module diagrams/files
 */

import { defineDiagram } from "../../core/registry.mjs";
import { createMeta, parseCommon } from "../../syntax/commons.mjs";
import { LineReader } from "../../syntax/reader.mjs";
import { label } from "../../syntax/text.mjs";
import { layoutText } from "../../layout/measure.mjs";
import { roleStyle, themeColor } from "../../draw/theme.mjs";
import { LimitError } from "../../core/errors.mjs";

/**
 * @typedef {object} FileEntry
 * @property {string} name
 * @property {boolean} folder
 * @property {Map<string, FileEntry>} children
 * @property {string | null} note
 */

/**
 * @param {import("../../core/source.mjs").SourceLine[]} lines
 * @param {import("../../core/registry.mjs").ModuleContext} module
 */
function parseFiles(lines, module) {
  const meta = createMeta();
  /** @type {FileEntry} */
  const root = { name: "", folder: true, children: new Map(), note: null };
  const reader = new LineReader(lines);
  /** @type {FileEntry | null} */
  let last = null;
  let count = 0;
  while (!reader.done) {
    const src = reader.next();
    const line = src.text.trim();
    if (!line) continue;
    if (/^<note>/i.test(line)) {
      const body = [line.replace(/^<note>/i, "")];
      if (!/<\/note>/i.test(line)) body.push(...reader.until(/<\/note>/i).map((l) => l.text));
      if (last)
        last.note = label(
          body
            .join("\n")
            .replace(/<\/note>.*/i, "")
            .trim(),
        );
      continue;
    }
    if (!/^[/~.\w]/.test(line) || /^(title|caption|legend|header|footer|skinparam)\b/i.test(line)) {
      if (parseCommon(line, meta, reader)) continue;
      module.diagnostics.unknown(line, src.line);
      continue;
    }
    const [path, note] = line.split(/\s+:\s+/, 2);
    const parts = path.split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = {
          name: part,
          folder: i < parts.length - 1 || path.endsWith("/"),
          children: new Map(),
          note: null,
        };
        node.children.set(part, child);
        if (++count > module.limits.maxNodes) throw new LimitError("Too many files");
      }
      if (i < parts.length - 1) child.folder = true;
      node = child;
    });
    if (note) node.note = label(note);
    last = node;
  }
  return { meta, root };
}

/**
 * @param {ReturnType<typeof parseFiles>} model
 * @param {import("../../core/registry.mjs").ModuleContext} ctx
 */
function layoutFiles(model, ctx) {
  const fs = ctx.theme.fontSize * 0.9;
  /** @type {{ entry: FileEntry, depth: number, y: number, laid: import("../../layout/measure.mjs").RichLayout, last: boolean[] }[]} */
  const rows = [];
  const rowH = fs * 1.25 + 10;
  /** @param {FileEntry} e @param {number} depth @param {boolean[]} trail */
  const walk = (e, depth, trail) => {
    const kids = [...e.children.values()].sort(
      (a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name),
    );
    kids.forEach((k, i) => {
      const isLast = i === kids.length - 1;
      rows.push({
        entry: k,
        depth,
        y: rows.length * rowH,
        laid: layoutText(k.name, { fontSize: fs, align: "left" }),
        last: [...trail, isLast],
      });
      walk(k, depth + 1, [...trail, isLast]);
    });
  };
  walk(model.root, 0, []);
  return { rows, rowH, fs };
}

/**
 * @param {ReturnType<typeof layoutFiles>} laid
 * @param {import("../../draw/canvas.mjs").Canvas} c
 */
function drawFiles(laid, c) {
  const { rows, rowH, fs } = laid;
  const theme = c.theme;
  const folder = roleStyle(theme, "package");
  const file = roleStyle(theme, "file");
  const indent = 26;
  const guide = { stroke: theme.muted, strokeWidth: 1, roughness: theme.edgeRoughness };
  const iconRoughness = Math.min(theme.roughness, 0.5);
  const maxRight = Math.max(...rows.map((r) => r.depth * indent + 28 + r.laid.width), 0);
  rows.forEach((r, i) => {
    const x = r.depth * indent;
    const cy = r.y + rowH / 2;
    // tree guides
    if (r.depth > 0) {
      const gx = x - indent + 8;
      c.line(
        [
          [gx, cy],
          [x, cy],
        ],
        guide,
      );
    }
    if (r.depth > 0) {
      const gx = x - indent + 8;
      const parentRow = [...rows.slice(0, i)].reverse().find((p) => p.depth === r.depth - 1);
      const top = parentRow ? parentRow.y + rowH - 4 : 0;
      c.line(
        [
          [gx, top],
          [gx, cy],
        ],
        guide,
      );
    }
    if (r.entry.folder) {
      c.line(
        [
          [x, cy - 5],
          [x, cy - 8],
          [x + 7, cy - 8],
          [x + 9, cy - 5],
        ],
        {
          stroke: themeColor(theme, "special.folder.stroke"),
          strokeWidth: 1.5,
          roughness: iconRoughness,
        },
      );
      c.rect(x, cy - 5, 18, 12, {
        fill: themeColor(theme, "special.folder.fill"),
        stroke: themeColor(theme, "special.folder.stroke"),
        strokeWidth: 1.5,
        roughness: iconRoughness,
      });
    } else {
      c.line(
        [
          [x + 2, cy - 8],
          [x + 11, cy - 8],
          [x + 15, cy - 4],
          [x + 15, cy + 8],
          [x + 2, cy + 8],
        ],
        {
          closed: true,
          fill: theme.surface ?? theme.background,
          stroke: theme.muted,
          strokeWidth: 1.5,
          roughness: iconRoughness,
        },
      );
    }
    c.richText(r.laid, x + 24, cy - r.laid.height / 2, {
      color: r.entry.folder ? folder.text : file.text,
      align: "left",
    });
    if (r.entry.note) {
      const t = layoutText(r.entry.note, { fontSize: fs * 0.8, align: "left" });
      const nx = maxRight + 30;
      const note = roleStyle(theme, "note");
      c.line(
        [
          [x + 28 + r.laid.width + 4, cy],
          [nx, cy],
        ],
        { ...guide, stroke: note.stroke, strokeStyle: "dotted" },
      );
      c.rect(nx, cy - t.height / 2 - 4, t.width + 16, t.height + 8, {
        fill: note.fill,
        stroke: note.stroke,
        strokeWidth: 1,
      });
      c.richText(t, nx + 8, cy - t.height / 2, { color: note.text, align: "left" });
    }
  });
}

export default defineDiagram({
  kind: "files",
  title: "File tree",
  starts: ["files"],
  parse: parseFiles,
  layout: layoutFiles,
  draw: drawFiles,
});
