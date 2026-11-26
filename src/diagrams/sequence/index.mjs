/**
 * Sequence diagrams.
 * @module diagrams/sequence
 */

import { defineDiagram } from "../../core/registry.mjs";
import { roleStyle, themeColor } from "../../draw/theme.mjs";
import { SHAPES } from "../../draw/shapes.mjs";
import { TRANSPARENT } from "../../syntax/color.mjs";
import { score } from "../detect.mjs";
import { parseSequence } from "./parse.mjs";
import { layoutSequence, DESTROY_HALF } from "./layout.mjs";

/** @typedef {import("../../draw/canvas.mjs").Canvas} Canvas */
/** @typedef {import("./layout.mjs").SeqItem} SeqItem */

/**
 * @param {{ items: SeqItem[] }} laid
 * @param {Canvas} c
 */
function drawSequence(laid, c) {
  const theme = c.theme;
  const msg = roleStyle(theme, "message");
  const layer = {
    box: 0,
    group: 1,
    lifeline: 2,
    activation: 3,
    head: 4,
    message: 5,
    ref: 6,
    note: 7,
    divider: 8,
    delay: 8,
    destroy: 9,
  };
  const items = laid.items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => layer[a.it.type] - layer[b.it.type] || a.i - b.i);
  /** @type {(() => void)[]} */
  const groupLabels = [];
  let labelsDrawn = false;
  for (const { it } of items) {
    if (!labelsDrawn && layer[it.type] > layer.activation) {
      groupLabels.forEach((f) => f());
      labelsDrawn = true;
    }
    switch (it.type) {
      case "box": {
        const s = roleStyle(theme, "participantBox", {
          fill: it.color ?? undefined,
          text: it.textColor ?? undefined,
        });
        c.rect(it.x, it.y, it.w, it.h, {
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: 1,
          rounded: true,
          roughness: Math.min(theme.roughness, 0.5),
        });
        if (it.text)
          c.richText(it.text, it.x + (it.w - it.text.width) / 2, it.y + 6, { color: s.text });
        break;
      }
      case "group": {
        const s = roleStyle(theme, "fragment");
        const tagStyle = roleStyle(theme, "fragmentTag");
        c.rect(it.x, it.y, it.w, it.h, {
          stroke: s.stroke,
          strokeWidth: 1.5,
          fill: it.color ?? TRANSPARENT,
          opacity: it.color ? 60 : 100,
        });
        const tw = it.tag.width + 16;
        const th = it.tag.height + 6;
        for (const el of it.elses) {
          c.line(
            [
              [it.x, el.y],
              [it.x + it.w, el.y],
            ],
            { stroke: s.stroke, strokeWidth: 1, strokeStyle: "dashed" },
          );
        }
        // Tag pentagon and guard texts sit above lifelines and activation bars.
        const plate = (/** @type {number} */ x, /** @type {number} */ y, /** @type {any} */ t) =>
          c.rect(x - 2, y + 1, t.width + 4, t.height - 2, {
            fill: theme.surface ?? theme.background,
            stroke: TRANSPARENT,
            strokeWidth: 1,
            roughness: 0,
          });
        groupLabels.push(() => {
          c.line(
            [
              [it.x, it.y],
              [it.x + tw + 8, it.y],
              [it.x + tw + 8, it.y + th - 6],
              [it.x + tw, it.y + th],
              [it.x, it.y + th],
            ],
            {
              closed: true,
              fill: tagStyle.fill,
              fillStyle: "solid",
              stroke: s.stroke,
              strokeWidth: 1.5,
            },
          );
          c.richText(it.tag, it.x + 8, it.y + 3, { color: tagStyle.text });
          if (it.text) {
            plate(it.x + tw + 16, it.y + 3, it.text);
            c.richText(it.text, it.x + tw + 16, it.y + 3, { color: s.text });
          }
          for (const el of it.elses) {
            if (!el.text) continue;
            plate(it.x + 10, el.y + 4, el.text);
            c.richText(el.text, it.x + 10, el.y + 4, { color: s.text });
          }
        });
        break;
      }
      case "lifeline": {
        const s = roleStyle(theme, "lifeline");
        const line = {
          stroke: s.stroke,
          strokeWidth: s.strokeWidth,
          roughness: theme.edgeRoughness,
        };
        let y1 = it.y1;
        for (const [g1, g2] of it.gaps) {
          if (g2 <= y1 || g1 >= it.y2) continue;
          c.line(
            [
              [it.x, y1],
              [it.x, g1],
            ],
            { ...line, strokeStyle: "dashed" },
          );
          c.line(
            [
              [it.x, g1],
              [it.x, g2],
            ],
            { ...line, strokeStyle: "dotted" },
          );
          y1 = g2;
        }
        c.line(
          [
            [it.x, y1],
            [it.x, it.y2],
          ],
          { ...line, strokeStyle: "dashed" },
        );
        break;
      }
      case "activation": {
        const s = roleStyle(theme, "activation", { fill: it.color ?? undefined });
        c.rect(it.x, it.y1, 10, it.y2 - it.y1, {
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: 1,
          roughness: Math.min(theme.roughness, 0.5),
        });
        break;
      }
      case "head": {
        const p = it.p;
        const s = roleStyle(theme, "participant", {
          fill: p.colors.fill,
          stroke: p.colors.stroke,
          text: p.colors.text ?? it.textColor,
        });
        const drawHead = () => {
          if (it.icon) {
            const [iw, ih] = it.icon;
            const ix = it.x + (it.w - iw) / 2;
            const kind =
              p.kind === "database"
                ? "database"
                : p.kind === "queue"
                  ? "queue"
                  : p.kind === "collections"
                    ? "collections"
                    : p.kind;
            const def = SHAPES[kind];
            const iconStyle = {
              stroke: s.stroke,
              fill: p.kind === "actor" ? (p.colors.fill ?? TRANSPARENT) : s.fill,
              strokeWidth: s.strokeWidth,
            };
            if (it.foot) {
              def.draw(c, ix, it.y + it.text.height + 6, iw, ih, iconStyle);
              c.richText(it.text, it.x + (it.w - it.text.width) / 2, it.y, { color: s.text });
            } else {
              def.draw(c, ix, it.y, iw, ih, iconStyle);
              c.richText(it.text, it.x + (it.w - it.text.width) / 2, it.y + ih + 6, {
                color: s.text,
              });
            }
          } else {
            c.rect(it.x, it.y, it.w, it.h, {
              fill: s.fill,
              stroke: s.stroke,
              strokeWidth: s.strokeWidth,
              rounded: true,
            });
            c.richText(
              it.text,
              it.x + (it.w - it.text.width) / 2,
              it.y + (it.h - it.text.height) / 2,
              { color: s.text },
            );
          }
        };
        c.withHookAlias(p.id, () => c.group(drawHead));
        break;
      }
      case "message": {
        const stroke = it.arrow.color ?? msg.stroke;
        c.arrow(it.points, {
          stroke,
          strokeWidth: 1.5,
          strokeStyle: it.arrow.lineStyle,
          start: it.arrow.startHead,
          end: it.arrow.endHead,
          roughness: theme.edgeRoughness,
        });
        if (it.text) {
          // A solid plate covers lines that pass through the label.
          if (it.plate)
            c.rect(it.textX - 4, it.textY - 1, it.text.width + 8, it.text.height + 2, {
              fill: theme.surface ?? theme.background,
              stroke: "transparent",
              strokeWidth: 1,
              roughness: 0,
            });
          c.richText(it.text, it.textX, it.textY, {
            color: it.arrow.color ?? msg.text,
            align: "left",
          });
        }
        break;
      }
      case "note": {
        const s = roleStyle(theme, "note", {
          fill: it.colors.fill,
          stroke: it.colors.stroke,
          text: it.colors.text,
        });
        const style = {
          fill: s.fill,
          stroke: s.stroke,
          strokeWidth: 1,
          fillStyle: /** @type {const} */ ("solid"),
        };
        c.group(() => {
          if (it.shape === "hnote") {
            c.line(
              [
                [it.x + 8, it.y],
                [it.x + it.w - 8, it.y],
                [it.x + it.w, it.y + it.h / 2],
                [it.x + it.w - 8, it.y + it.h],
                [it.x + 8, it.y + it.h],
                [it.x, it.y + it.h / 2],
              ],
              { ...style, closed: true },
            );
          } else if (it.shape === "rnote")
            c.rect(it.x, it.y, it.w, it.h, { ...style, rounded: true });
          else SHAPES.note.draw(c, it.x, it.y, it.w, it.h, style);
          c.richText(it.text, it.x + 10, it.y + 7, { color: s.text, align: "left" });
        });
        break;
      }
      case "divider": {
        const s = roleStyle(theme, "divider");
        c.line(
          [
            [it.x1, it.y - 2],
            [it.x2, it.y - 2],
          ],
          { stroke: s.stroke, strokeWidth: 1, roughness: 0 },
        );
        c.line(
          [
            [it.x1, it.y + 2],
            [it.x2, it.y + 2],
          ],
          { stroke: s.stroke, strokeWidth: 1, roughness: 0 },
        );
        if (it.text) {
          const w = it.text.width + 24;
          const h = it.text.height + 8;
          const x = (it.x1 + it.x2 - w) / 2;
          c.rect(x, it.y - h / 2, w, h, {
            fill: themeColor(theme, "special.sequence-divider.fill"),
            fillStyle: "solid",
            stroke: s.stroke,
            strokeWidth: 1,
            rounded: true,
          });
          c.richText(it.text, x + 12, it.y - h / 2 + 4, { color: s.text });
        }
        break;
      }
      case "delay":
        if (it.text)
          c.richText(it.text, (it.x1 + it.x2 - it.text.width) / 2, it.y - it.text.height / 2, {
            color: theme.muted,
          });
        break;
      case "ref": {
        const s = roleStyle(theme, "reference");
        c.rect(it.x, it.y, it.w, it.h, {
          fill: s.fill,
          fillStyle: "solid",
          stroke: s.stroke,
          strokeWidth: 1.5,
        });
        c.line(
          [
            [it.x, it.y + 22],
            [it.x + 34, it.y + 22],
            [it.x + 42, it.y + 14],
            [it.x + 42, it.y],
          ],
          { stroke: s.stroke, strokeWidth: 1.5 },
        );
        c.text("ref", it.x + 8, it.y + 2, { size: 14, bold: true, color: s.text });
        c.richText(it.text, it.x + (it.w - it.text.width) / 2, it.y + 20, { color: s.text });
        break;
      }
      case "destroy": {
        const st = { stroke: themeColor(theme, "special.sequence-destroy.stroke"), strokeWidth: 2 };
        c.line(
          [
            [it.x - DESTROY_HALF, it.y - DESTROY_HALF],
            [it.x + DESTROY_HALF, it.y + DESTROY_HALF],
          ],
          st,
        );
        c.line(
          [
            [it.x + DESTROY_HALF, it.y - DESTROY_HALF],
            [it.x - DESTROY_HALF, it.y + DESTROY_HALF],
          ],
          st,
        );
        break;
      }
    }
  }
  if (!labelsDrawn) groupLabels.forEach((f) => f());
}

export default defineDiagram({
  kind: "sequence",
  title: "Sequence diagram",
  starts: ["uml", "sequence"],
  fallback: true,
  detect: (lines) =>
    score(lines, [
      [/^(participant|boundary|control|collections|queue)\s/i, 3],
      [/^(actor|entity|database)\s+("[^"]*"|\S+)(\s+as\s+\S+)?\s*(#\S+)?\s*(<<.*>>)?\s*$/i, 0.8],
      [/^(activate|deactivate|destroy|autonumber|return|create)\b/i, 3],
      [/^(alt|opt|loop|par|break|critical)\b/i, 2],
      [/^(else|end|group)\b/i, 0.5],
      [/^note\s+(over|across)\b/i, 3],
      [/^ref\s+over\b/i, 3],
      [/^(==.*==|\.\.\..*|\|\|\d*\|\|?)$/, 2],
      [/^box\b/i, 1],
      [/^hide\s+footbox/i, 3],
      [
        /^[\[?]?\s*("[^"]+"|[\w.]+)?\s*[ox]?(<<?|\\\\?|\/\/?)?-{1,2}(\[[^\]]*\])?(>>?|\\\\?|\/\/?)[ox]?\s*("[^"]+"|[\w.]+|\]|\?)?\s*(\+\+|--|\*\*|!!)?\s*(:.*)?$/,
        1,
      ],
      [/^("[^"]+"|[\w.]+)\s*<-{1,2}\s*("[^"]+"|[\w.]+)\s*(:.*)?$/, 1],
    ]),
  parse: parseSequence,
  layout: (model, ctx) => layoutSequence(model, ctx),
  draw: (laid, canvas) => drawSequence(laid, canvas),
});
