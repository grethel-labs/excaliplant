/**
 * ArchiMate diagrams: `archimate #Layer "Label" as id <<layer-type>>`,
 * junctions, and the `Rel_*` / element macros of the bundled
 * `<archimate/Archimate>` stdlib shim.
 * @module diagrams/archimate
 */

import { themeColor } from "../../draw/theme.mjs";
import { graphModule } from "../graph/module.mjs";
import { DESCRIPTIVE_KEYWORDS } from "../graph/parse.mjs";
import { score } from "../detect.mjs";

/** Layer → fill colour (ArchiMate standard palette). */
export const ARCHIMATE_LAYERS = {
  business: "special.archimate-business.fill",
  application: "special.archimate-application.fill",
  technology: "special.archimate-technology.fill",
  physical: "special.archimate-physical.fill",
  motivation: "special.archimate-motivation.fill",
  strategy: "special.archimate-strategy.fill",
  implementation: "special.archimate-implementation.fill",
  migration: "special.archimate-migration.fill",
  other: "special.archimate-other.fill",
};

/**
 * Draw a small type icon in the top-right corner.
 * @param {import("../../draw/canvas.mjs").Canvas} c
 * @param {string} type
 * @param {number} x Right edge.
 * @param {number} y Top edge.
 * @param {string} stroke
 */
function icon(c, type, x, y, stroke) {
  const s = { stroke, strokeWidth: 1, roughness: 0 };
  const ix = x - 24;
  const iy = y + 6;
  if (/actor/.test(type)) {
    c.ellipse(ix + 6, iy, 6, 6, s);
    c.line(
      [
        [ix + 9, iy + 6],
        [ix + 9, iy + 11],
      ],
      s,
    );
    c.line(
      [
        [ix + 5, iy + 8],
        [ix + 13, iy + 8],
      ],
      s,
    );
    c.line(
      [
        [ix + 5, iy + 15],
        [ix + 9, iy + 11],
        [ix + 13, iy + 15],
      ],
      s,
    );
  } else if (/service/.test(type)) c.rect(ix, iy + 3, 18, 9, { ...s, rounded: true });
  else if (/(process|function|event|interaction|flow)/.test(type))
    c.line(
      [
        [ix, iy + 4],
        [ix + 12, iy + 4],
        [ix + 12, iy],
        [ix + 18, iy + 7],
        [ix + 12, iy + 14],
        [ix + 12, iy + 10],
        [ix, iy + 10],
      ],
      { ...s, closed: true },
    );
  else if (/component/.test(type)) {
    c.rect(ix + 4, iy, 14, 14, s);
    c.rect(ix, iy + 3, 8, 3, s);
    c.rect(ix, iy + 8, 8, 3, s);
  } else if (/(node|device|equipment|facility|system-software)/.test(type)) {
    c.rect(ix, iy + 3, 15, 11, s);
    c.line(
      [
        [ix, iy + 3],
        [ix + 3, iy],
        [ix + 18, iy],
        [ix + 18, iy + 11],
        [ix + 15, iy + 14],
      ],
      s,
    );
  } else if (/(object|artifact|data|representation|contract|deliverable)/.test(type)) {
    c.rect(ix, iy, 18, 14, s);
    c.line(
      [
        [ix, iy + 4],
        [ix + 18, iy + 4],
      ],
      s,
    );
  } else if (/interface/.test(type)) {
    c.ellipse(ix + 8, iy + 3, 9, 9, s);
    c.line(
      [
        [ix, iy + 7],
        [ix + 8, iy + 7],
      ],
      s,
    );
  } else if (
    /(goal|outcome|principle|requirement|constraint|driver|assessment|value|meaning)/.test(type)
  ) {
    c.ellipse(ix + 2, iy, 14, 14, s);
    c.ellipse(ix + 6, iy + 4, 6, 6, s);
  } else if (/role/.test(type)) {
    c.rect(ix, iy + 2, 16, 10, { ...s, rounded: true });
    c.ellipse(ix + 12, iy + 2, 6, 10, s);
  }
}

export default graphModule({
  kind: "archimate",
  title: "ArchiMate diagram",
  keywords: [["archimate", { shape: "rectangle", role: "default" }], ...DESCRIPTIVE_KEYWORDS],
  finish: (model, ctx) => {
    for (const n of model.nodes.values()) {
      if (
        n.keyword !== "archimate" &&
        !n.stereotypes.some((s) =>
          /^(business|application|technology|motivation|strategy|implementation|physical|migration)-/i.test(
            s,
          ),
        )
      )
        continue;
      const type = (n.stereotypes.find((s) => /-/.test(s)) ?? "").toLowerCase();
      const layer = /** @type {keyof typeof ARCHIMATE_LAYERS} */ (type.split("-")[0] || "other");
      n.stereotypes = n.stereotypes.filter((s) => !/-/.test(s));
      if (!n.colors.fill)
        n.colors.fill = themeColor(
          ctx.module.theme,
          ARCHIMATE_LAYERS[layer] ?? ARCHIMATE_LAYERS.other,
        );
      if (!n.colors.stroke)
        n.colors.stroke = themeColor(ctx.module.theme, "special.archimate.stroke");
      if (/junction/.test(type)) {
        n.data.fixed = [16, 16];
        n.data.round = true;
        n.data.draw = (/** @type {any} */ c, /** @type {any} */ node, /** @type {any} */ st) =>
          c.ellipse(node.x, node.y, node.width, node.height, {
            ...st,
            fill: /or/.test(type) ? (c.theme.surface ?? c.theme.background) : st.stroke,
            fillStyle: "solid",
          });
        continue;
      }
      n.shape = /service/.test(type)
        ? "rounded"
        : /(process|function|event)/.test(type)
          ? "rounded"
          : "rectangle";
      n.data.archimateType = type;
      n.data.padX = 40;
      n.data.draw = (
        /** @type {any} */ c,
        /** @type {any} */ node,
        /** @type {any} */ st,
        /** @type {any} */ s,
      ) => {
        const rid = c.rect(node.x, node.y, node.width, node.height, {
          ...st,
          rounded: n.shape === "rounded",
        });
        const geo = node.data.geo;
        let ty = node.y + (node.height - geo.textHeight) / 2;
        for (const b of geo.blocks) {
          c.richText(b, node.x + (node.width - b.width) / 2, ty, { color: s.text });
          ty += b.height + 4;
        }
        icon(c, type, node.x + node.width, node.y, st.stroke);
        return rid;
      };
    }
  },
  detect: (lines) =>
    score(lines, [
      [/^archimate\b/i, 4],
      [
        /<<(business|application|technology|motivation|strategy|implementation|physical)-[\w-]+>>/i,
        3,
      ],
      [/^(Business|Application|Technology|Motivation|Strategy|Implementation|Physical)_\w+\(/, 4],
      [/^Rel_\w+\(/, 2],
    ]),
});
