// Title + closing brace.
//
// Each plugin file deliberately handles ONE PlantUML concept. To support
// a new construct, drop a new file in this folder and register it.

import { createTitlePlugin } from "../common_plugins/title.mjs";
import {
  collectBlockLines,
  extractPlantUmlLink,
  normalisePlantUmlText,
  sanitizePlantUmlColor,
  stripQuotes,
} from "../../../util/plantuml_utils.mjs";

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

/** @type {Map<string, keyof import("../../../general/model/diagram.mjs").Diagram["style"]>} */
const STYLE_KEYS = new Map([
  ["backgroundcolor", "backgroundColor"],
  ["arrowcolor", "arrowColor"],
  ["linetextcolor", "edgeFontColor"],
  ["defaultfontcolor", "boxFontColor"],
  ["componentbackgroundcolor", "boxBackgroundColor"],
  ["componentbordercolor", "boxBorderColor"],
  ["componentfontcolor", "boxFontColor"],
  ["rectanglebackgroundcolor", "boxBackgroundColor"],
  ["rectanglebordercolor", "boxBorderColor"],
  ["rectanglefontcolor", "boxFontColor"],
  ["classbackgroundcolor", "boxBackgroundColor"],
  ["classbordercolor", "boxBorderColor"],
  ["classfontcolor", "boxFontColor"],
  ["objectbackgroundcolor", "boxBackgroundColor"],
  ["objectbordercolor", "boxBorderColor"],
  ["objectfontcolor", "boxFontColor"],
  ["usecasebackgroundcolor", "boxBackgroundColor"],
  ["usecasebordercolor", "boxBorderColor"],
  ["usecasefontcolor", "boxFontColor"],
  ["databasebackgroundcolor", "boxBackgroundColor"],
  ["databasebordercolor", "boxBorderColor"],
  ["databasefontcolor", "boxFontColor"],
  ["entitybackgroundcolor", "boxBackgroundColor"],
  ["entitybordercolor", "boxBorderColor"],
  ["entityfontcolor", "boxFontColor"],
  ["notebackgroundcolor", "noteBackgroundColor"],
  ["notebordercolor", "noteBorderColor"],
  ["notefontcolor", "noteFontColor"],
  ["packagebackgroundcolor", "containerBackgroundColor"],
  ["packagebordercolor", "containerBorderColor"],
  ["packagefontcolor", "containerFontColor"],
  ["folderbackgroundcolor", "containerBackgroundColor"],
  ["folderbordercolor", "containerBorderColor"],
  ["folderfontcolor", "containerFontColor"],
  ["framebackgroundcolor", "containerBackgroundColor"],
  ["framebordercolor", "containerBorderColor"],
  ["framefontcolor", "containerFontColor"],
  ["nodebackgroundcolor", "containerBackgroundColor"],
  ["nodebordercolor", "containerBorderColor"],
  ["nodefontcolor", "containerFontColor"],
]);

/**
 * Apply a safe subset of PlantUML graph skinparams. Unknown keys are consumed
 * tolerantly so strict parsing remains compatible with broader PlantUML files.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const skinparamPlugin = {
  name: "component.skinparam",
  tryLine(line, ctx) {
    const compact = line.match(/^skinparam\s+([A-Za-z][\w]*)\s+(\S+)$/i);
    if (!compact) return /^skinparam\b/i.test(line);
    applySkinparam(ctx, compact[1], compact[2]);
    return true;
  },
  tryStart(line) {
    if (!/^skinparam\b.*\{$/i.test(line)) return null;
    return {
      onLine(blockLine, ctx) {
        const item = blockLine.match(/^([A-Za-z][\w]*)\s+(\S+)$/);
        if (item) applySkinparam(ctx, item[1], item[2]);
      },
      tryEnd(blockLine) {
        return blockLine === "}";
      },
    };
  },
};

/**
 * CSS-like PlantUML `<style>...</style>` blocks are parsed only for a safe
 * colour subset that maps directly onto renderer style fields.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const styleBlockPlugin = {
  name: "component.style",
  tryStart(line) {
    if (!/^<style>\s*$/i.test(line)) return null;
    return collectBlockLines(/^<\/style>\s*$/i, (lines, ctx) => {
      applyStyleBlock(ctx, lines);
    });
  },
};

/**
 * @param {any} ctx
 * @param {string} rawName
 * @param {string} value
 * @returns {void}
 */
function applySkinparam(ctx, rawName, value) {
  const key = STYLE_KEYS.get(rawName.toLowerCase());
  if (!key) return;
  const safeColor = sanitizePlantUmlColor(value);
  if (safeColor) ctx.setGraphStyle(key, safeColor);
}

/**
 * @param {any} ctx
 * @param {string[]} lines
 * @returns {void}
 */
function applyStyleBlock(ctx, lines) {
  /** @type {string[]} */
  const selectors = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\*.*?\*\//g, "").trim();
    if (!line) continue;
    if (line === "}") {
      selectors.pop();
      continue;
    }
    const open = line.match(/^([A-Za-z][\w-]*)\s*\{$/);
    if (open) {
      selectors.push(open[1].toLowerCase());
      continue;
    }
    const item = line.match(/^([A-Za-z][\w-]*)\s*:\s*([^;]+);?$/);
    if (!item) continue;
    const selector = selectors[selectors.length - 1] || "";
    const key = styleBlockKey(selector, item[1]);
    if (!key) continue;
    const safeColor = sanitizePlantUmlColor(item[2]);
    if (safeColor) ctx.setGraphStyle(key, safeColor);
  }
}

/**
 * @param {string} selector Lower-case PlantUML style selector.
 * @param {string} property Raw CSS-like property name.
 * @returns {keyof import("../../../general/model/diagram.mjs").Diagram["style"]|""}
 */
function styleBlockKey(selector, property) {
  const prop = property.toLowerCase();
  if (selector === "root" || selector === "diagram") {
    if (prop === "backgroundcolor") return "backgroundColor";
  }
  if (selector === "arrow") {
    if (prop === "linecolor" || prop === "bordercolor" || prop === "color") return "arrowColor";
    if (prop === "fontcolor") return "edgeFontColor";
  }
  if (
    selector === "component" ||
    selector === "rectangle" ||
    selector === "class" ||
    selector === "object" ||
    selector === "usecase" ||
    selector === "database" ||
    selector === "entity"
  ) {
    if (prop === "backgroundcolor") return "boxBackgroundColor";
    if (prop === "linecolor" || prop === "bordercolor") return "boxBorderColor";
    if (prop === "fontcolor") return "boxFontColor";
  }
  if (selector === "note") {
    if (prop === "backgroundcolor") return "noteBackgroundColor";
    if (prop === "linecolor" || prop === "bordercolor") return "noteBorderColor";
    if (prop === "fontcolor") return "noteFontColor";
  }
  if (
    selector === "package" ||
    selector === "folder" ||
    selector === "frame" ||
    selector === "node" ||
    selector === "container"
  ) {
    if (prop === "backgroundcolor") return "containerBackgroundColor";
    if (prop === "linecolor" || prop === "bordercolor") return "containerBorderColor";
    if (prop === "fontcolor") return "containerFontColor";
  }
  return "";
}

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
 * PlantUML URL directives attach link metadata to an already declared or
 * later-declared graph element, for example `url of Dog is [[https://...]]`.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const urlOfPlugin = {
  name: "component.url",
  tryLine(line, ctx) {
    const m = line.match(/^url\s+of\s+(.+?)\s+is\s+(.+)$/i);
    if (!m) return false;
    const targetId = stripQuotes(m[1].trim());
    const parsed = extractPlantUmlLink(m[2].trim());
    ctx.queueBoxLink({
      targetId,
      link: parsed.link,
      tooltip: parsed.tooltip,
    });
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
      ctx.diagram.caption = normalisePlantUmlText(caption[1].trim());
      return true;
    }
    const header = line.match(/^header\s+(.+)$/i);
    if (header) {
      ctx.diagram.header = normalisePlantUmlText(header[1].trim());
      return true;
    }
    const footer = line.match(/^footer\s+(.+)$/i);
    if (footer) {
      ctx.diagram.footer = normalisePlantUmlText(footer[1].trim());
      return true;
    }
    const mainframe = line.match(/^mainframe\s+(.+)$/i);
    if (mainframe) {
      ctx.diagram.mainframe = normalisePlantUmlText(mainframe[1].trim());
      return true;
    }
    return /^allowmixing\b/i.test(line);
  },
  tryStart(line) {
    if (!/^legend\b/i.test(line)) return null;
    return collectBlockLines(/^end\s+legend$/i, (lines, ctx) => {
      ctx.diagram.legend = normalisePlantUmlText(lines.join("\n"));
    });
  },
};
