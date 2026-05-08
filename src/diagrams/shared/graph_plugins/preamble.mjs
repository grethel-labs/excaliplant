// Title + closing brace.
//
// Each plugin file deliberately handles ONE PlantUML concept. To support
// a new construct, drop a new file in this folder and register it.

import { createTitlePlugin } from "../common_plugins/title.mjs";

/**
 * `title …` line.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const titlePlugin = createTitlePlugin("component.title");

/**
 * Closing `}` for any open container.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const closeBracePlugin = {
  name: "component.close",
  tryLine(line, ctx) {
    if (line !== "}") return false;
    ctx.closeContainer();
    return true;
  },
};

/**
 * Component diagrams currently tolerate PlantUML skinparams without applying
 * them so strict parsing stays compatible with common style preambles.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const skinparamPlugin = {
  name: "component.skinparam",
  tryLine(line) {
    return /^skinparam\b/i.test(line);
  },
  tryStart(line) {
    if (!/^skinparam\b.*\{$/i.test(line)) return null;
    return {
      onLine() {},
      tryEnd(blockLine) {
        return blockLine === "}";
      },
    };
  },
};

/**
 * Shared graph direction hints such as `left to right direction`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const directionPlugin = {
  name: "component.direction",
  tryLine(line, ctx) {
    const m = line.match(/^(left\s+to\s+right|top\s+to\s+bottom)\s+direction$/i);
    if (!m) return false;
    ctx.diagram.layoutDirection = /^left/i.test(m[1]) ? "RIGHT" : "DOWN";
    return true;
  },
};
