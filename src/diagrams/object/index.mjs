/**
 * Object diagrams: `object`, `map` (key => value tables) and inline JSON.
 * @module diagrams/object
 */

import { graphModule } from "../graph/module.mjs";
import { DESCRIPTIVE_KEYWORDS, parseDeclaration, declare } from "../graph/parse.mjs";
import { label } from "../../syntax/text.mjs";
import { score } from "../detect.mjs";

/** @type {[string, import("../graph/parse.mjs").ElementKind][]} */
const KEYWORDS = [
  ["object", { shape: "class", role: "object", classLike: true }],
  ["map", { shape: "class", role: "map", classLike: true }],
  ["class", { shape: "class", role: "class", classLike: true }],
  ["diamond", { shape: "diamond", role: "default" }],
  ...DESCRIPTIVE_KEYWORDS,
];

export default graphModule({
  kind: "object",
  title: "Object diagram",
  keywords: KEYWORDS,
  rules: [
    // `map Name {` key => value rows
    (line, ctx, reader) => {
      if (!/^map\s/i.test(line)) return false;
      const decl = parseDeclaration(line, ctx.config.keywords);
      if (!decl) return false;
      const node = declare(ctx, decl, /** @type {any} */ (ctx.config.keywords.get("map")));
      node.classHeader = { ...node.classHeader, spot: null };
      if (decl.opensBlock) {
        /** @type {[string, string][]} */
        const rows = [];
        for (const l of reader.braceBlock()) {
          const m = /^\s*(.*?)\s*=>\s*(.*?)\s*$/.exec(l.text);
          if (m) {
            rows.push([label(m[1]), label(m[2])]);
            // `key => target` creates a link when target is a known object.
            const target = ctx.model.find(m[2].trim());
            if (target) ctx.model.connect(node.id, target.id, { endHead: "arrow" });
          }
        }
        node.data.table = rows;
      }
      return true;
    },
  ],
  finish: (model) => {
    for (const n of model.nodes.values()) {
      if (n.keyword === "object" && n.classHeader) n.classHeader.spot = null;
    }
  },
  detect: (lines) =>
    score(lines, [
      [/^(object|map)\s+\S/i, 3],
      [/^\S+\s*:\s*\w+\s*=\s*.+$/, 0.5],
    ]),
});
