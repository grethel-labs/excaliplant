/**
 * Allow-list SVG sanitiser for inlining diagrams into HTML/Markdown.
 *
 * The renderer already escapes all text, but inline SVG shares the page with
 * untrusted content, so the output is re-parsed and rebuilt from an allow-list:
 * only known elements and attributes survive, there are no scripts, event
 * handlers, `foreignObject`, external resources or `url(...)` references, and
 * the result is always well-formed. The scanner is linear (no backtracking).
 * @module markdown/sanitize
 */

/** Elements that may appear in a diagram. */
const ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "style",
  "rect",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "a",
  "title",
  "desc",
]);

/** Elements whose content is raw text: skipped up to the matching close tag. */
const RAW_TEXT = new Set(["script", "style", "textarea", "xmp", "noscript", "iframe", "noembed"]);

/** Presentation and geometry attributes that are safe on every element. */
const ATTRIBUTES = new Set([
  "x",
  "y",
  "dx",
  "dy",
  "width",
  "height",
  "viewBox",
  "preserveAspectRatio",
  "d",
  "points",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "transform",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "text-anchor",
  "text-decoration",
  "dominant-baseline",
  "letter-spacing",
  "paint-order",
  "xml:space",
]);

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const HOOK_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

/** Maximum input handled; the renderer is bounded far below this. */
const MAX_INPUT = 64 * 1024 * 1024;

/**
 * @typedef {object} SanitizeOptions
 * @property {string} [scope] CSS scope prefix for the `text` rule (e.g. `.excaliplant`).
 * @property {number} [width] Rescale the root element to this pixel width.
 */

/** @param {string} c */
const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

/**
 * Escape character data. Valid entity references are kept, everything else is
 * escaped; control characters that are illegal in XML are dropped.
 * @param {string} text
 */
function escapeText(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const code = text.charCodeAt(i);
    if (code < 0x20 && c !== "\t" && c !== "\n" && c !== "\r") continue;
    if (c === "&") {
      const m = /^&(?:amp|lt|gt|quot|apos|#[0-9]{1,7}|#x[0-9a-fA-F]{1,6});/.exec(
        text.slice(i, i + 12),
      );
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else out += "&amp;";
    } else if (c === ">") out += "&gt;";
    else if (c === "<") out += "&lt;";
    else out += c;
  }
  return out;
}

/**
 * Lower-cased value with whitespace and control characters removed, used to
 * spot scheme/function tricks such as `java\tscript:`.
 * @param {string} value
 */
function compact(value) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x20) out += value[i];
  }
  return out.toLowerCase();
}

/**
 * Whether an attribute value is acceptable on a plain presentation attribute.
 * @param {string} value
 */
function safeValue(value) {
  if (value.length > 1_000_000) return false;
  if (value.includes("<")) return false;
  const c = compact(value);
  return !(
    c.includes("url(") ||
    c.includes("javascript:") ||
    c.includes("expression(") ||
    c.includes("@import") ||
    c.includes("&#")
  );
}

/** @param {string} value */
const isHookToken = (value) => HOOK_TOKEN.test(value) && value === value.trim();

/**
 * Allow only the markers and visibility controls generated for hook groups.
 * @param {string} key
 * @param {string} value
 */
function safeHookAttribute(key, value) {
  switch (key) {
    case "data-excaliplant-hook":
    case "data-excaliplant-hook-parent":
      return (
        isHookToken(value) ||
        (/^@line:[0-9]{1,15}:[0-9]{1,15}$/.test(value) && value === value.trim())
      );
    case "data-excaliplant-click-from-children":
      return value === "true";
    case "data-excaliplant-hook-id":
      return isHookToken(value);
    case "data-excaliplant-hook-classes": {
      if (value.length > 32 * 65 - 1) return false;
      const classes = value.split(" ");
      return classes.length <= 32 && classes.every(isHookToken);
    }
    case "data-excaliplant-element-id":
      return /^[A-Za-z0-9_-]{1,256}$/.test(value) && value === value.trim();
    case "data-excaliplant-variant":
      return value === "base" || value === "hover" || value === "click";
    case "display":
      return value === "none";
    case "pointer-events":
      return value === "painted" || value === "none";
    case "aria-hidden":
      return value === "true";
    default:
      return false;
  }
}

/**
 * Links may only be absolute `http(s)` or `mailto:` URLs. Checked on the raw
 * text so entity-encoded scheme tricks cannot slip through.
 * @param {string} value
 */
function safeHref(value) {
  const v = value.trim();
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 0x20) return false;
  if (v.includes("<") || v.length > 4096) return false;
  const lower = v.slice(0, 8).toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:");
}

/**
 * Keep only `@font-face` rules with an embedded font and the diagram's own
 * `text{...}` rule.
 * @param {string} css
 * @param {string} scope
 */
function filterCss(css, scope) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && isSpace(css[i])) i++;
    if (i >= css.length) break;
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const close = css.indexOf("}", open + 1);
    if (close < 0) break;
    const selector = css.slice(i, open).trim();
    const body = css.slice(open + 1, close);
    i = close + 1;
    if (selector === "@font-face") {
      const decls = parseDeclarations(body);
      const family = decls.get("font-family");
      const src = decls.get("src");
      if (family && /^"?[A-Za-z0-9 _-]{1,64}"?$/.test(family) && src && safeFontSrc(src)) {
        rules.push(`@font-face{font-family:${family};src:${src};}`);
      }
    } else if (selector === "text") {
      const decls = parseDeclarations(body);
      let out = "";
      const family = decls.get("font-family");
      if (family && /^[A-Za-z0-9 ",_-]{1,200}$/.test(family)) out += `font-family:${family};`;
      const ws = decls.get("white-space");
      if (ws === "pre" || ws === "normal" || ws === "pre-wrap") out += `white-space:${ws};`;
      if (out) rules.push(`${scope ? `${scope} ` : ""}text{${out}}`);
    }
  }
  return rules.join("");
}

/**
 * @param {string} body
 * @returns {Map<string, string>}
 */
function parseDeclarations(body) {
  /** @type {Map<string, string>} */
  const out = new Map();
  let depth = 0;
  let quote = "";
  let start = 0;
  /** @param {number} end */
  const flush = (end) => {
    const part = body.slice(start, end);
    const colon = part.indexOf(":");
    if (colon >= 0)
      out.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim());
    start = end + 1;
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) flush(i);
  }
  flush(body.length);
  return out;
}

/**
 * `url(data:font/...;base64,...)` optionally followed by `format("...")`.
 * @param {string} src
 */
function safeFontSrc(src) {
  const head = "url(data:font/";
  if (!src.startsWith(head)) return false;
  const end = src.indexOf(")", head.length);
  if (end < 0) return false;
  const url = src.slice(head.length, end);
  const semi = url.indexOf(";base64,");
  if (semi < 0) return false;
  const type = url.slice(0, semi);
  if (!["woff2", "woff", "ttf", "otf"].includes(type)) return false;
  const data = url.slice(semi + 8);
  for (let i = 0; i < data.length; i++) {
    const c = data.charCodeAt(i);
    const ok =
      (c >= 48 && c <= 57) ||
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      c === 43 ||
      c === 47 ||
      c === 61;
    if (!ok) return false;
  }
  const rest = src.slice(end + 1).trim();
  return rest === "" || /^format\("[a-z0-9]{1,8}"\)$/.test(rest);
}

/**
 * Parse one tag starting at `lt` (the `<`).
 * @param {string} s
 * @param {number} lt
 * @returns {{ name: string, closing: boolean, selfClosing: boolean, attrs: [string, string][], end: number } | null}
 */
function parseTag(s, lt) {
  let j = lt + 1;
  const closing = s[j] === "/";
  if (closing) j++;
  const nameStart = j;
  while (j < s.length && !isSpace(s[j]) && s[j] !== "/" && s[j] !== ">") j++;
  const name = s.slice(nameStart, j);
  if (!name) return null;
  /** @type {[string, string][]} */
  const attrs = [];
  let selfClosing = false;
  for (;;) {
    while (j < s.length && isSpace(s[j])) j++;
    if (j >= s.length) return null;
    if (s[j] === ">") {
      j++;
      break;
    }
    if (s[j] === "/") {
      selfClosing = true;
      j++;
      continue;
    }
    const start = j;
    while (j < s.length && !isSpace(s[j]) && s[j] !== "=" && s[j] !== ">" && s[j] !== "/") j++;
    const attr = s.slice(start, j);
    while (j < s.length && isSpace(s[j])) j++;
    let value = "";
    if (s[j] === "=") {
      j++;
      while (j < s.length && isSpace(s[j])) j++;
      const q = s[j];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, j + 1);
        if (close < 0) return null;
        value = s.slice(j + 1, close);
        j = close + 1;
      } else {
        const vs = j;
        while (j < s.length && !isSpace(s[j]) && s[j] !== ">") j++;
        value = s.slice(vs, j);
      }
    }
    if (attr && attrs.length < 200) attrs.push([attr, value]);
  }
  return { name, closing, selfClosing, attrs, end: j };
}

/**
 * Rebuild an SVG document from an allow-list.
 * @param {string} svg
 * @param {SanitizeOptions} [options]
 * @returns {string} Sanitised SVG; throws if there is no `<svg>` root.
 */
export function sanitizeSvg(svg, options = {}) {
  return rebuildSvg(svg, options, false);
}

/**
 * Sanitize a playground hook preview for inline SVG under the site's CSP.
 * @param {string} svg
 */
export function sanitizeHookPreview(svg) {
  return rebuildSvg(svg, {}, true);
}

/**
 * @param {string} svg
 * @param {SanitizeOptions} options
 * @param {boolean} hookPreview
 */
function rebuildSvg(svg, options, hookPreview) {
  if (typeof svg !== "string") throw new TypeError("SVG must be a string");
  if (svg.length > MAX_INPUT) throw new RangeError("SVG too large to sanitise");
  const scope = options.scope ?? "";
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const stack = [];
  let skip = 0;
  let sawRoot = false;
  let i = 0;
  const n = svg.length;
  /** @type {string | null} */
  let lowerSvg = null;
  const lower = () => (lowerSvg ??= svg.toLowerCase());
  while (i < n) {
    const lt = svg.indexOf("<", i);
    const textEnd = lt < 0 ? n : lt;
    if (!skip && stack.length > 0 && textEnd > i) out.push(escapeText(svg.slice(i, textEnd)));
    if (lt < 0) break;
    if (svg.startsWith("<!--", lt)) {
      const end = svg.indexOf("-->", lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (svg.startsWith("<![CDATA[", lt)) {
      const end = svg.indexOf("]]>", lt + 9);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (svg[lt + 1] === "!" || svg[lt + 1] === "?") {
      const end = svg.indexOf(">", lt);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const tag = parseTag(svg, lt);
    if (!tag) {
      // Malformed markup: drop the rest rather than guess.
      break;
    }
    i = tag.end;
    const { name } = tag;
    if (skip) {
      if (tag.closing) skip--;
      else if (!tag.selfClosing) skip++;
      continue;
    }
    if (tag.closing) {
      const at = stack.lastIndexOf(name);
      if (at < 0) continue;
      while (stack.length > at) out.push(`</${stack.pop()}>`);
      if (stack.length === 0) break; // the root is closed; ignore anything after it
      continue;
    }
    if (!ELEMENTS.has(name) || (!sawRoot && name !== "svg") || (hookPreview && name === "style")) {
      if (RAW_TEXT.has(name) && !tag.selfClosing) {
        const end = lower().indexOf(`</${name}`, i);
        if (end < 0) {
          i = n;
        } else {
          const gt = svg.indexOf(">", end);
          i = gt < 0 ? n : gt + 1;
        }
      } else if (!tag.selfClosing) skip = 1;
      continue;
    }
    if (name === "svg") sawRoot = true;
    if (name === "style") {
      const end = lower().indexOf("</style", i);
      const cssEnd = end < 0 ? n : end;
      const css = filterCss(svg.slice(i, cssEnd), scope);
      if (css) out.push(`<style>${css.replace(/</g, "")}</style>`);
      if (end < 0) i = n;
      else {
        const gt = svg.indexOf(">", end);
        i = gt < 0 ? n : gt + 1;
      }
      continue;
    }
    out.push(openTag(name, tag.attrs, stack.length === 0 && name === "svg", options, hookPreview));
    if (tag.selfClosing) out[out.length - 1] = out[out.length - 1].replace(/>$/, "/>");
    else stack.push(name);
  }
  while (stack.length > 0) out.push(`</${stack.pop()}>`);
  if (!sawRoot) throw new Error("No <svg> root element found");
  return out.join("");
}

/**
 * @param {string} name
 * @param {[string, string][]} attrs
 * @param {boolean} root
 * @param {SanitizeOptions} options
 * @param {boolean} hookPreview
 */
function openTag(name, attrs, root, options, hookPreview) {
  /** @type {Map<string, string>} */
  const kept = new Map();
  for (const [key, value] of attrs) {
    if (kept.has(key)) continue;
    if (key === "xmlns") {
      if (root && value === SVG_NS) kept.set(key, value);
    } else if (key === "xmlns:xlink") {
      if (root && value === XLINK_NS) kept.set(key, value);
    } else if (key === "href" || key === "xlink:href") {
      if (name === "a" && safeHref(value)) kept.set(key, value);
    } else if (
      (ATTRIBUTES.has(key) && (!hookPreview || !value.includes("\\")) && safeValue(value)) ||
      (hookPreview && name === "g" && safeHookAttribute(key, value))
    ) {
      kept.set(key, value);
    }
  }
  if (root) {
    if (!kept.has("xmlns")) kept.set("xmlns", SVG_NS);
    const target = options.width;
    const w = Number(kept.get("width"));
    const h = Number(kept.get("height"));
    if (typeof target === "number" && Number.isFinite(target) && w > 0 && h > 0) {
      const width = Math.round(Math.min(16_000, Math.max(16, target)));
      kept.set("width", String(width));
      kept.set("height", String(Math.round(((h * width) / w) * 100) / 100));
    }
  }
  let text = `<${name}`;
  for (const [key, value] of kept) text += ` ${key}="${escapeText(value).replace(/"/g, "&quot;")}"`;
  return `${text}>`;
}
