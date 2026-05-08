// Title + closing brace.
//
// Each plugin file deliberately handles ONE PlantUML concept. To support
// a new construct, drop a new file in this folder and register it.

import { createTitlePlugin } from "../common_plugins/title.mjs";
import { collectBlockLines, unescapeLabel } from "../../../util/plantuml_utils.mjs";

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

/**
 * Shared graph presentation commands that are currently stored as
 * metadata or tolerated for strict parsing.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const presentationPlugin = {
  name: "component.presentation",
  tryLine(line, ctx) {
    const caption = line.match(/^caption\s+(.+)$/i);
    if (caption) {
      ctx.diagram.caption = unescapeLabel(caption[1].trim());
      return true;
    }
    const header = line.match(/^header\s+(.+)$/i);
    if (header) {
      ctx.diagram.header = unescapeLabel(header[1].trim());
      return true;
    }
    const footer = line.match(/^footer\s+(.+)$/i);
    if (footer) {
      ctx.diagram.footer = unescapeLabel(footer[1].trim());
      return true;
    }
    const mainframe = line.match(/^mainframe\s+(.+)$/i);
    if (mainframe) {
      ctx.diagram.mainframe = unescapeLabel(mainframe[1].trim());
      return true;
    }
    return /^allowmixing\b/i.test(line);
  },
  tryStart(line) {
    if (!/^legend\b/i.test(line)) return null;
    return collectBlockLines(/^end\s+legend$/i, (lines, ctx) => {
      ctx.diagram.legend = lines.join("\n");
    });
  },
};
