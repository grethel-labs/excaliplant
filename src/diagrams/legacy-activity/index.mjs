/**
 * Legacy activity syntax: `(*) --> "Activity"`, synchronisation bars
 * `===B1===`, labelled arrows `-->[label]`, and `if … then … else … endif`.
 * @module diagrams/legacy-activity
 */

import { graphModule } from "../graph/module.mjs";
import { label } from "../../syntax/text.mjs";
import { score } from "../detect.mjs";

/** @typedef {import("../graph/parse.mjs").GraphContext} GraphContext */
/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */

const ENDPOINT = String.raw`(\(\*(?:top)?\)|===[^=]+===|"[^"]*"(?:\s+as\s+\w+)?|\w+)`;
const LINK = new RegExp(
  `^${ENDPOINT}?\\s*-+(?:(up|down|left|right)-+)?(?:\\[([^\\]]*)\\])?\\s*>\\s*(?:\\[([^\\]]*)\\])?\\s*${ENDPOINT}(?:\\s*\\[([^\\]]*)\\])?$`,
  "i",
);

/**
 * @param {GraphContext} ctx
 * @param {string} token
 * @param {"source" | "target"} side
 * @returns {GraphNode}
 */
function resolve(ctx, token, side) {
  const { model } = ctx;
  if (/^\(\*(top)?\)$/.test(token)) {
    const id = side === "source" ? "__start" : "__end";
    let n = model.find(id);
    if (!n) {
      n = model.add(id, {
        label: "",
        shape: side === "source" ? "start" : "end",
        role: "pseudo",
        keyword: "pseudo",
      });
      n.data.fixed = side === "source" ? [22, 22] : [26, 26];
      n.data.round = true;
      n.data.draw = (/** @type {any} */ c, /** @type {any} */ node) => {
        const ink = c.theme.ink;
        if (side === "source")
          return c.ellipse(node.x, node.y, node.width, node.height, {
            fill: ink,
            stroke: ink,
            fillStyle: "solid",
          });
        const id2 = c.ellipse(node.x, node.y, node.width, node.height, {
          fill: c.theme.background,
          stroke: ink,
        });
        c.ellipse(node.x + 6, node.y + 6, node.width - 12, node.height - 12, {
          fill: ink,
          stroke: ink,
          fillStyle: "solid",
        });
        return id2;
      };
    }
    return n;
  }
  const bar = /^===([^=]+)===$/.exec(token);
  if (bar) {
    let n = model.find(`__bar_${bar[1]}`);
    if (!n) {
      n = model.add(`__bar_${bar[1]}`, {
        label: "",
        shape: "rectangle",
        role: "bar",
        keyword: "bar",
      });
      n.data.fixed = [120, 8];
      n.data.draw = (/** @type {any} */ c, /** @type {any} */ node) =>
        c.rect(node.x, node.y, node.width, node.height, {
          fill: c.theme.ink,
          stroke: c.theme.ink,
          fillStyle: "solid",
          strokeWidth: 1,
        });
    }
    return n;
  }
  const named = /^"([^"]*)"(?:\s+as\s+(\w+))?$/.exec(token);
  const id = named ? (named[2] ?? named[1]) : token;
  const existing = model.find(id);
  if (existing) return existing;
  return model.add(id, {
    label: label(named ? named[1] : token),
    shape: "rounded",
    role: "action",
    keyword: "activity",
  });
}

/** @type {import("../../syntax/reader.mjs").Rule<GraphContext>[]} */
const RULES = [
  (line, ctx) => {
    const m = LINK.exec(line);
    if (!m) return false;
    const from = m[1] ? resolve(ctx, m[1], "source") : (ctx.last ?? resolve(ctx, "(*)", "source"));
    const to = resolve(ctx, m[5], "target");
    ctx.model.connect(from.id, to.id, {
      endHead: "triangle",
      label: label(m[3] ?? m[4] ?? m[6] ?? "") || null,
      direction: /** @type {any} */ (m[2]?.toLowerCase() ?? null),
    });
    ctx.last = to;
    return true;
  },
  (line, ctx) => {
    const m = /^if\s+"([^"]*)"\s+then$/i.exec(line);
    if (!m) return false;
    const d = ctx.model.add(`__if${ctx.noteSeq++}`, {
      label: label(m[1]),
      shape: "diamond",
      role: "decision",
      keyword: "if",
    });
    d.data.round = true;
    if (ctx.last) ctx.model.connect(ctx.last.id, d.id, { endHead: "triangle" });
    const state = /** @type {any} */ (ctx);
    state.ifs ??= [];
    state.ifs.push(d);
    ctx.last = d;
    return true;
  },
  (line, ctx) => {
    if (!/^else$/i.test(line)) return false;
    const ifs = /** @type {any} */ (ctx).ifs ?? [];
    const d = ifs[ifs.length - 1];
    if (d) ctx.last = d;
    return true;
  },
  (line, ctx) => {
    if (!/^endif$/i.test(line)) return false;
    /** @type {any} */ (ctx).ifs?.pop();
    return true;
  },
];

export default graphModule({
  kind: "legacy-activity",
  title: "Activity diagram (legacy syntax)",
  keywords: [["partition", { shape: "rectangle", role: "partition", container: true }]],
  rules: RULES,
  detect: (lines) =>
    score(lines, [
      [/\(\*(top)?\)/, 5],
      [/===[^=]+===/, 3],
      [/^if\s+".*"\s+then$/i, 3],
    ]),
});
