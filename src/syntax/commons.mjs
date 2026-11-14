/**
 * Commands shared by every diagram type: `title`, `caption`, `header`,
 * `footer`, `legend`, `mainframe`, `skinparam`, `<style>`, `hide`/`show`,
 * `scale` and layout direction.
 * @module syntax/commons
 */

import { label } from "./text.mjs";

/**
 * @typedef {object} DiagramMeta
 * @property {string | null} title
 * @property {string | null} caption
 * @property {{ text: string, align: "left" | "center" | "right" } | null} header
 * @property {{ text: string, align: "left" | "center" | "right" } | null} footer
 * @property {{ text: string, h: "left" | "center" | "right", v: "top" | "bottom" } | null} legend
 * @property {string | null} mainframe
 * @property {"TB" | "LR"} direction
 * @property {Map<string, string>} skin Lower-cased skinparam keys (dotted for style selectors).
 * @property {Set<string>} hide Lower-cased `hide …` arguments.
 * @property {Set<string>} show Lower-cased `show …` arguments.
 * @property {Map<string, string>} settings Misc `set`/`skin`/`scale` values.
 */

/** @returns {DiagramMeta} */
export function createMeta() {
  return {
    title: null,
    caption: null,
    header: null,
    footer: null,
    legend: null,
    mainframe: null,
    direction: "TB",
    skin: new Map(),
    hide: new Set(),
    show: new Set(),
    settings: new Map(),
  };
}

/** @typedef {import("./reader.mjs").LineReader} LineReader */

/**
 * Parse a shared command. Returns true when the line was consumed.
 * @param {string} line Trimmed line.
 * @param {DiagramMeta} meta
 * @param {LineReader} reader
 * @returns {boolean}
 */
export function parseCommon(line, meta, reader) {
  let m;
  if ((m = /^title\s*$/i.exec(line))) {
    meta.title = reader.until(/^\s*end\s*title\s*$/i).map((l) => l.text.trim()).join("\n");
    return true;
  }
  if ((m = /^title\s*:?\s+(.+)$/i.exec(line))) {
    meta.title = label(m[1]);
    return true;
  }
  if ((m = /^caption\s*:?\s+(.+)$/i.exec(line))) {
    meta.caption = label(m[1]);
    return true;
  }
  if ((m = /^(left|center|right)?\s*(header|footer)\s*$/i.exec(line))) {
    const text = reader
      .until(new RegExp(`^\\s*end\\s*${m[2]}\\s*$`, "i"))
      .map((l) => l.text.trim())
      .join("\n");
    meta[/** @type {"header" | "footer"} */ (m[2].toLowerCase())] = { text, align: align(m[1], m[2]) };
    return true;
  }
  if ((m = /^(left|center|right)?\s*(header|footer)\s*:?\s+(.+)$/i.exec(line))) {
    meta[/** @type {"header" | "footer"} */ (m[2].toLowerCase())] = { text: label(m[3]), align: align(m[1], m[2]) };
    return true;
  }
  if ((m = /^legend\b\s*(top|bottom)?\s*(left|right|center)?\s*$/i.exec(line))) {
    const text = reader
      .until(/^\s*end\s*legend\s*$/i)
      .map((l) => l.text.trim())
      .join("\n");
    meta.legend = {
      text,
      h: /** @type {any} */ ((m[2] ?? "center").toLowerCase()),
      v: /** @type {any} */ ((m[1] ?? "bottom").toLowerCase()),
    };
    return true;
  }
  if ((m = /^mainframe\s+(.+)$/i.exec(line))) {
    meta.mainframe = label(m[1]);
    return true;
  }
  if (/^left\s+to\s+right\s+direction$/i.test(line)) {
    meta.direction = "LR";
    return true;
  }
  if (/^top\s+to\s+bottom\s+direction$/i.test(line)) {
    meta.direction = "TB";
    return true;
  }
  if ((m = /^skinparam\s+([\w.]+)\s*(?:<<([^>]+)>>)?\s*\{\s*$/i.exec(line))) {
    const prefix = m[1].toLowerCase();
    for (const l of reader.braceBlock()) {
      const kv = /^\s*([\w.]+)\s*(?:<<[^>]+>>)?\s+(.+?)\s*$/.exec(l.text);
      if (kv) meta.skin.set(`${prefix}${kv[1].toLowerCase()}`, kv[2]);
    }
    return true;
  }
  if ((m = /^skinparam\s+([\w.]+)\s*(?:<<[^>]+>>)?\s+(.+?)\s*$/i.exec(line))) {
    meta.skin.set(m[1].toLowerCase(), m[2]);
    return true;
  }
  if (/^<style>\s*$/i.test(line) || /^<style\b/i.test(line)) {
    const body = reader.until(/^\s*<\/style>\s*$/i).map((l) => l.text);
    parseStyleSheet(body.join("\n"), meta.skin);
    return true;
  }
  if ((m = /^(hide|show)\s+(.+)$/i.exec(line))) {
    const set = m[1].toLowerCase() === "hide" ? meta.hide : meta.show;
    set.add(m[2].trim().toLowerCase());
    return true;
  }
  if ((m = /^(scale|skin|set\s+\w+|allowmixing|allow_mixing|page|outputformat)\b\s*(.*)$/i.exec(line))) {
    meta.settings.set(m[1].toLowerCase().replace(/\s+/g, " "), m[2].trim());
    return true;
  }
  if (/^(hide\s+footbox|remove\s+.+|restore\s+.+)$/i.test(line)) return true;
  return false;
}

/**
 * @param {string | undefined} explicit
 * @param {string} kind
 * @returns {"left" | "center" | "right"}
 */
function align(explicit, kind) {
  if (explicit) return /** @type {any} */ (explicit.toLowerCase());
  return kind.toLowerCase() === "header" ? "right" : "center";
}

/**
 * Parse a PlantUML `<style>` sheet into dotted skin keys:
 * `classDiagram { class { BackgroundColor red } }` → `class.backgroundcolor = red`.
 * Diagram-scope selectors (`…Diagram`, `root`, `element`) are flattened.
 * @param {string} css
 * @param {Map<string, string>} skin
 */
export function parseStyleSheet(css, skin) {
  /** @type {string[]} */
  const stack = [];
  const tokens = css.replace(/\/\/[^\n]*/g, "").split(/([{};\n])/);
  let buffer = "";
  for (const tok of tokens) {
    if (tok === "{") {
      const selector = buffer.trim().toLowerCase();
      buffer = "";
      stack.push(selector);
      continue;
    }
    if (tok === "}") {
      flushDecl(buffer, stack, skin);
      buffer = "";
      stack.pop();
      continue;
    }
    if (tok === ";" || tok === "\n") {
      flushDecl(buffer, stack, skin);
      buffer = "";
      continue;
    }
    buffer += tok;
  }
}

/**
 * @param {string} decl
 * @param {string[]} stack
 * @param {Map<string, string>} skin
 */
function flushDecl(decl, stack, skin) {
  const m = /^\s*([\w-]+)\s*:?\s+(.+?)\s*$/.exec(decl);
  if (!m || stack.length === 0) return;
  const selectors = stack.filter((s) => !/diagram$/.test(s) && s !== "root" && s !== "document");
  const key = (selectors.length ? selectors[selectors.length - 1] : "element").replace(/^\./, "");
  for (const sel of key.split(",")) skin.set(`${sel.trim()}.${m[1].toLowerCase()}`, m[2]);
}
