/**
 * Shared parser for graph diagrams. Diagram modules configure it with their
 * element keywords and implicit-node rules; everything else (declarations,
 * containers, members, links, notes, hide/remove) is common.
 * @module diagrams/graph/parse
 */

import { GraphModel } from "../../model/graph.mjs";
import { parseCommon } from "../../syntax/commons.mjs";
import { parseLink, headsOf } from "../../syntax/arrows.mjs";
import { parseColorSpec } from "../../syntax/color.mjs";
import { runRules, braceDelta } from "../../syntax/reader.mjs";
import {
  label,
  takeStereotypes,
  takeColor,
  takeBlockOpen,
  unquote,
  clampText,
} from "../../syntax/text.mjs";
import { LimitError } from "../../core/errors.mjs";

/** @typedef {import("../../model/graph.mjs").GraphNode} GraphNode */
/** @typedef {import("../../core/source.mjs").SourceLine} SourceLine */

/**
 * @typedef {object} ElementKind
 * @property {string} shape
 * @property {string} role
 * @property {boolean} [classLike] Body `{…}` contains members instead of children.
 * @property {boolean} [container] Always drawn as a container (package, namespace).
 */

/**
 * @typedef {object} GraphParserConfig
 * @property {string} kind Model kind.
 * @property {Map<string, ElementKind>} keywords Declaration keywords (lower case).
 * @property {(token: string) => { id: string, label: string, keyword: string } | null} [implicit] Map an undeclared endpoint token to a node.
 * @property {import("../../syntax/reader.mjs").Rule<GraphContext>[]} [rules] Extra rules tried before the generic ones.
 * @property {(model: GraphModel, ctx: GraphContext) => void} [finish] Post-processing hook.
 */

/**
 * @typedef {object} GraphContext
 * @property {GraphModel} model
 * @property {(GraphNode | null)[]} stack Open containers (`null` for `together`).
 * @property {GraphParserConfig} config
 * @property {import("../../core/registry.mjs").ModuleContext} module
 * @property {GraphNode | null} last Last declared node (for `note left:` etc.).
 * @property {import("../../model/graph.mjs").GraphEdge | null} lastEdge
 * @property {number} noteSeq
 */

/** Default spot letters and colours for class-like keywords. */
export const CLASS_SPOTS = new Map(
  Object.entries({
    class: ["C", "#2f9e44"],
    abstract: ["A", "#0c8599"],
    "abstract class": ["A", "#0c8599"],
    interface: ["I", "#6741d9"],
    enum: ["E", "#e8590c"],
    annotation: ["@", "#c92a2a"],
    entity: ["E", "#1971c2"],
    protocol: ["P", "#9c36b5"],
    struct: ["S", "#5c940d"],
    record: ["R", "#1098ad"],
    dataclass: ["D", "#1098ad"],
    exception: ["X", "#c92a2a"],
    metaclass: ["M", "#495057"],
    stereotype: ["S", "#495057"],
    circle: ["C", "#2f9e44"],
  }),
);

/**
 * Element keywords shared by component, deployment and use case diagrams.
 * @type {[string, ElementKind][]}
 */
export const DESCRIPTIVE_KEYWORDS = [
  ["actor", { shape: "actor", role: "actor" }],
  ["actor/", { shape: "actor", role: "actor" }],
  ["agent", { shape: "rectangle", role: "default" }],
  ["artifact", { shape: "artifact", role: "artifact" }],
  ["boundary", { shape: "boundary", role: "boundary" }],
  ["card", { shape: "card", role: "card" }],
  ["circle", { shape: "interface", role: "interface" }],
  ["cloud", { shape: "cloud", role: "cloud" }],
  ["collections", { shape: "collections", role: "default" }],
  ["component", { shape: "component", role: "component" }],
  ["control", { shape: "control", role: "control" }],
  ["database", { shape: "database", role: "database" }],
  ["entity", { shape: "entity", role: "entity" }],
  ["file", { shape: "file", role: "file" }],
  ["folder", { shape: "folder", role: "package", container: true }],
  ["frame", { shape: "frame", role: "package", container: true }],
  ["hexagon", { shape: "hexagon", role: "default" }],
  ["interface", { shape: "interface", role: "interface" }],
  ["label", { shape: "label", role: "label" }],
  ["node", { shape: "node", role: "node" }],
  ["package", { shape: "package", role: "package", container: true }],
  ["person", { shape: "person", role: "default" }],
  ["process", { shape: "process", role: "default" }],
  ["queue", { shape: "queue", role: "queue" }],
  ["rectangle", { shape: "rectangle", role: "default" }],
  ["rect", { shape: "rectangle", role: "default" }],
  ["stack", { shape: "stack", role: "default" }],
  ["storage", { shape: "storage", role: "storage" }],
  ["usecase", { shape: "usecase", role: "usecase" }],
  ["usecase/", { shape: "usecase", role: "usecase" }],
  ["action", { shape: "action", role: "default" }],
  ["port", { shape: "port", role: "default" }],
  ["portin", { shape: "port", role: "default" }],
  ["portout", { shape: "port", role: "default" }],
  ["together", { shape: "rectangle", role: "default" }],
];

/**
 * Parsed element declaration.
 * @typedef {object} Declaration
 * @property {string} keyword
 * @property {string} id
 * @property {string} label
 * @property {string[]} stereotypes
 * @property {import("../../syntax/color.mjs").ColorSpec} colors
 * @property {string | null} link
 * @property {boolean} opensBlock
 * @property {boolean} opensDescription
 * @property {string} description Inline `[description]` text.
 * @property {string} rest Remaining text (class headers: generics, extends …).
 */

/**
 * Strip endpoint decoration: quotes, `[ ]`, `( )`, `: :`, `()`.
 * @param {string} token
 * @returns {{ name: string, form: "plain" | "component" | "usecase" | "actor" | "interface" | "quoted" }}
 */
export function endpointForm(token) {
  const t = token.trim();
  if (/^\(\)\s*/.test(t)) return { name: unquote(t.replace(/^\(\)\s*/, "")), form: "interface" };
  if (t.startsWith("[") && t.endsWith("]"))
    return { name: t.slice(1, -1).trim(), form: "component" };
  if (t.startsWith("(") && t.endsWith(")")) return { name: t.slice(1, -1).trim(), form: "usecase" };
  if (t.startsWith(":") && t.endsWith(":") && t.length > 2)
    return { name: t.slice(1, -1).trim(), form: "actor" };
  if (t.startsWith('"') && t.endsWith('"')) return { name: t.slice(1, -1), form: "quoted" };
  return { name: t, form: "plain" };
}

/**
 * Parse `<name> [as <alias>]` with all PlantUML quoting forms.
 * @param {string} text
 * @returns {{ id: string, label: string, form: string } | null}
 */
export function parseNameAlias(text) {
  const t = text.trim();
  if (!t) return null;
  const TOKEN = String.raw`("[^"]*"|\[[^\]]*\]|\([^)]*\)|:[^:]+:|\(\)\s*"[^"]*"|\(\)\s*\S+|[^\s"]+)`;
  const asMatch = new RegExp(`^${TOKEN}\\s+as\\s+${TOKEN}$`, "i").exec(t);
  if (asMatch) {
    const a = endpointForm(asMatch[1]);
    const b = endpointForm(asMatch[2]);
    if (a.form !== "plain") return { id: b.name, label: a.name, form: a.form };
    if (b.form !== "plain") return { id: a.name, label: b.name, form: b.form };
    return { id: b.name, label: a.name, form: "plain" };
  }
  const single = new RegExp(`^${TOKEN}$`).exec(t);
  if (single) {
    const e = endpointForm(single[1]);
    return { id: e.name, label: e.name, form: e.form };
  }
  return null;
}

/**
 * Parse an element declaration line.
 * @param {string} line
 * @param {Map<string, ElementKind>} keywords
 * @returns {Declaration | null}
 */
export function parseDeclaration(line, keywords) {
  const kw = /^([a-z]+(?:\s+class)?\/?|abstract)\s+(.*)$/i.exec(line);
  if (!kw) return null;
  const keyword = kw[1].toLowerCase().replace(/\s+/g, " ");
  if (!keywords.has(keyword)) return null;
  let rest = kw[2];
  const block = takeBlockOpen(rest);
  rest = block.rest;
  let opensDescription = false;
  let description = "";
  // `node N [` starts a multi-line description; `node N [text]` is inline.
  const descOpen = /\s\[\s*$/.exec(rest);
  if (descOpen && !/\[[^\]]*\]\s*\[\s*$/.test(rest)) {
    opensDescription = true;
    rest = rest.slice(0, descOpen.index);
  } else {
    const inline = /\s\[([^\][]*)\]\s*$/.exec(rest);
    if (inline && !/^\[/.test(rest.trim())) {
      description = inline[1];
      rest = rest.slice(0, inline.index);
    }
  }
  let link = null;
  const linkMatch = /\[\[([^\]]*)\]\]/.exec(rest);
  if (linkMatch) {
    link = linkMatch[1].trim().split(/\s+/)[0];
    rest = rest.replace(linkMatch[0], " ");
  }
  const st = takeStereotypes(rest);
  const col = takeColor(st.rest);
  // Remaining text: `<name> [as alias] [extends …] [implements …] [<generics>]`
  const headerExtras = /\s+(extends|implements)\s+.*$/i.exec(col.rest);
  const nameText = headerExtras ? col.rest.slice(0, headerExtras.index) : col.rest;
  const generics = /^([^<\s"]+)\s*(<.*>)$/.exec(nameText.trim());
  const named = parseNameAlias(generics ? generics[1] : nameText);
  if (!named) return null;
  return {
    keyword,
    id: named.id,
    label: named.label,
    stereotypes: st.stereotypes,
    colors: parseColorSpec(col.color),
    link: link && /^(https?:|mailto:)/i.test(link) ? link : null,
    opensBlock: block.opens,
    opensDescription,
    description: label(description),
    rest: `${generics ? generics[2] : ""}${headerExtras ? headerExtras[0] : ""}`.trim(),
  };
}

/**
 * Parse class body members.
 * @param {SourceLine[]} lines
 * @returns {import("../../model/graph.mjs").Compartment[]}
 */
export function parseMembers(lines) {
  /** @type {import("../../model/graph.mjs").Compartment[]} */
  const compartments = [];
  /** @type {import("../../model/graph.mjs").Compartment | null} */
  let current = null;
  for (const { text } of lines) {
    const t = text.trim();
    if (!t) continue;
    const sep = /^(--|\.\.|==|__)(?:\s*(.*?)\s*\1)?$/.exec(t);
    if (sep) {
      current = {
        title: sep[2] ? label(sep[2]) : null,
        separator:
          sep[1] === ".."
            ? "dotted"
            : sep[1] === "=="
              ? "double"
              : sep[1] === "__"
                ? "line"
                : "line",
        members: [],
      };
      compartments.push(current);
      continue;
    }
    if (!current) {
      current = { title: null, separator: "line", members: [] };
      compartments.push(current);
    }
    current.members.push(parseMember(t));
  }
  return compartments;
}

/**
 * @param {string} raw
 * @returns {import("../../model/graph.mjs").Member}
 */
export function parseMember(raw) {
  let t = raw.trim();
  let isStatic = false;
  let isAbstract = false;
  /** @type {boolean | null} */
  let forced = null;
  /** @type {"+" | "-" | "#" | "~" | null} */
  let visibility = null;
  // Modifiers and visibility may appear in either order: `{static} +x` or `+ {static} x`.
  for (let guard = 0; guard < 6; guard++) {
    const m = /^\{(static|classifier|abstract|field|method)\}\s*/i.exec(t);
    if (m) {
      const k = m[1].toLowerCase();
      if (k === "static" || k === "classifier") isStatic = true;
      if (k === "abstract") isAbstract = true;
      if (k === "field") forced = false;
      if (k === "method") forced = true;
      t = t.slice(m[0].length);
      continue;
    }
    if (!visibility && /^[+\-#~]\s*\S/.test(t) && !/^(--|\.\.)/.test(t)) {
      visibility = /** @type {any} */ (t[0]);
      t = t.slice(1).trim();
      continue;
    }
    break;
  }
  return { text: label(t), visibility, isStatic, isAbstract, isMethod: forced ?? /\(.*\)/.test(t) };
}

/**
 * Build a parse function for a graph diagram.
 * @param {GraphParserConfig} config
 * @returns {(lines: SourceLine[], module: import("../../core/registry.mjs").ModuleContext) => GraphModel}
 */
export function createGraphParser(config) {
  return (lines, module) => {
    const model = new GraphModel(config.kind);
    /** @type {GraphContext} */
    const ctx = { model, stack: [], config, module, last: null, lastEdge: null, noteSeq: 0 };
    runRules(lines, [...(config.rules ?? []), ...GENERIC_RULES], ctx, module.diagnostics);
    if (model.nodes.size > module.limits.maxNodes)
      throw new LimitError(`More than ${module.limits.maxNodes} nodes`);
    if (model.edges.length > module.limits.maxEdges)
      throw new LimitError(`More than ${module.limits.maxEdges} edges`);
    model.direction = model.meta.direction;
    applyVisibility(model);
    config.finish?.(model, ctx);
    return model;
  };
}

/**
 * @param {GraphContext} ctx
 * @returns {GraphNode | null}
 */
function currentParent(ctx) {
  for (let i = ctx.stack.length - 1; i >= 0; i--) if (ctx.stack[i]) return ctx.stack[i];
  return null;
}

/**
 * Declare (or update) a node from a declaration.
 * @param {GraphContext} ctx
 * @param {Declaration} decl
 * @param {ElementKind} kind
 * @returns {GraphNode}
 */
export function declare(ctx, decl, kind) {
  const { model } = ctx;
  const limits = ctx.module.limits;
  const parent = currentParent(ctx);
  let node = model.find(decl.id);
  if (!node) {
    node = model.add(decl.id, {
      label: clampText(label(decl.label), limits.maxTextLength),
      shape: kind.shape,
      role: kind.role,
      keyword: decl.keyword,
      parent,
    });
  } else {
    node.shape = kind.shape;
    node.role = kind.role;
    node.keyword = decl.keyword;
    if (decl.label !== decl.id) node.label = label(decl.label);
    if (parent && node.parent !== parent) model.reparent(node, parent);
  }
  if (decl.label !== decl.id && !model.aliases.has(decl.label))
    model.aliases.set(decl.label, node.id);
  node.stereotypes.push(...decl.stereotypes.filter((s) => !node.stereotypes.includes(s)));
  Object.assign(node.colors, decl.colors);
  if (decl.link) node.link = decl.link;
  if (decl.description) node.description = decl.description;
  if (kind.container) node.container = true;
  if (kind.classLike) {
    const spot = CLASS_SPOTS.get(decl.keyword) ?? CLASS_SPOTS.get("class");
    const custom = decl.stereotypes
      .map((s) => /^\(\s*(\S)\s*,\s*(#?\w+)\s*\)\s*(.*)$/.exec(s))
      .find(Boolean);
    node.classHeader = {
      keyword: decl.keyword,
      generics: (/^<(.*)>/.exec(decl.rest)?.[1] ?? "").trim(),
      spot: custom
        ? { char: custom[1], color: parseColorSpec(custom[2]).fill ?? "#2f9e44" }
        : spot
          ? { char: spot[0], color: spot[1] }
          : null,
      abstract: /abstract/.test(decl.keyword),
    };
    if (custom)
      node.stereotypes = node.stereotypes
        .map((s) => s.replace(/^\(\s*\S\s*,\s*#?\w+\s*\)\s*/, ""))
        .filter(Boolean);
    const ext = /\bextends\s+(.+?)(?=\s+implements\b|$)/i.exec(decl.rest);
    const impl = /\bimplements\s+(.+)$/i.exec(decl.rest);
    for (const target of ext?.[1].split(",") ?? []) {
      const t = ensureNode(ctx, target.trim());
      model.connect(node.id, t.id, { endHead: "triangle_outline" });
    }
    for (const target of impl?.[1].split(",") ?? []) {
      const t = ensureNode(ctx, target.trim(), "interface");
      model.connect(node.id, t.id, { endHead: "triangle_outline", lineStyle: "dashed" });
    }
  }
  ctx.last = node;
  return node;
}

/**
 * Resolve an endpoint token to a node, creating it implicitly when needed.
 * @param {GraphContext} ctx
 * @param {string} token
 * @param {string} [keywordHint]
 * @returns {GraphNode}
 */
export function ensureNode(ctx, token, keywordHint) {
  const { model, config } = ctx;
  const ep = endpointForm(token);
  const existing = model.find(ep.name);
  if (existing) return existing;
  const implicit = config.implicit?.(token) ?? null;
  const keyword =
    keywordHint ?? implicit?.keyword ?? formKeyword(ep.form) ?? [...config.keywords.keys()][0];
  const kind = config.keywords.get(keyword) ?? config.keywords.values().next().value;
  /** @type {Declaration} */
  const decl = {
    keyword,
    id: implicit?.id ?? ep.name,
    label: implicit?.label ?? ep.name,
    stereotypes: [],
    colors: {},
    link: null,
    opensBlock: false,
    opensDescription: false,
    description: "",
    rest: "",
  };
  const saved = ctx.last;
  const node = declare(ctx, decl, /** @type {ElementKind} */ (kind));
  ctx.last = saved;
  return node;
}

/** @param {string} form */
function formKeyword(form) {
  return (
    { component: "component", usecase: "usecase", actor: "actor", interface: "interface" }[form] ??
    null
  );
}

/** @type {import("../../syntax/reader.mjs").Rule<GraphContext>[]} */
const GENERIC_RULES = [
  // shared commands
  (line, ctx, reader) => parseCommon(line, ctx.model.meta, reader),
  // together { … }
  (line, ctx) => {
    if (!/^together\s*\{\s*$/i.test(line)) return false;
    ctx.stack.push(null);
    return true;
  },
  // closing brace
  (line, ctx) => {
    if (!/^}\s*$/.test(line)) return false;
    ctx.stack.pop();
    return true;
  },
  // notes
  noteRule,
  // element declarations
  (line, ctx, reader) => {
    const decl = parseDeclaration(line, ctx.config.keywords);
    if (!decl) return false;
    const kind = /** @type {ElementKind} */ (ctx.config.keywords.get(decl.keyword));
    if (decl.keyword === "together") return false;
    const node = declare(ctx, decl, kind);
    if (decl.opensDescription) {
      const body = reader.until(/^\s*\]\s*$/);
      node.description = body.map((l) => l.text.trim()).join("\n");
    }
    if (decl.opensBlock) {
      if (kind.classLike) {
        const body = reader.braceBlock();
        node.compartments.push(...parseMembers(body));
      } else {
        node.container = true;
        ctx.stack.push(node);
      }
    }
    return true;
  },
  // links
  (line, ctx) => {
    const link = parseLink(line);
    if (!link) return false;
    const from = ensureNode(ctx, link.from);
    const to = ensureNode(ctx, link.to);
    const heads = headsOf(link.arrow);
    let text = link.label ? label(link.label) : null;
    /** @type {"<" | ">" | null} */
    let labelArrow = null;
    if (text && /[^>]\s*>$/.test(text) && !/>>$/.test(text) && !/<\/?[\w:#=" -]*>$/.test(text)) {
      labelArrow = ">";
      text = text.replace(/\s*>$/, "");
    } else if (text && /^<\s*[^<]/.test(text)) {
      labelArrow = "<";
      text = text.replace(/^<\s*/, "");
    }
    ctx.lastEdge = ctx.model.connect(from.id, to.id, {
      startHead: heads.start,
      endHead: heads.end,
      lineStyle: link.arrow.lineStyle,
      bold: link.arrow.bold,
      hidden: link.arrow.hidden,
      color: link.arrow.color,
      thickness: link.arrow.thickness,
      label: text,
      fromLabel: link.fromLabel,
      toLabel: link.toLabel,
      direction: link.arrow.direction,
      length: link.arrow.length,
    });
    if (labelArrow) ctx.lastEdge.data.labelArrow = labelArrow;
    return true;
  },
  // `Class : member` rows and `Element : description`
  (line, ctx) => {
    const m = /^("[^"]+"|[^\s:"]+(?:::[^\s:"]+)*)\s*:\s*(.*)$/.exec(line);
    if (!m) return false;
    const node = ctx.model.find(unquote(m[1]));
    if (!node) return false;
    if (node.classHeader) {
      if (!node.compartments.length)
        node.compartments.push({ title: null, separator: "line", members: [] });
      node.compartments[node.compartments.length - 1].members.push(parseMember(m[2]));
    } else {
      node.description = node.description ? `${node.description}\n${label(m[2])}` : label(m[2]);
    }
    return true;
  },
  // bare `[Component]`, `(Use case)`, `:Actor:`, `() Interface` declarations
  (line, ctx, reader) => {
    const { rest: noBlock, opens } = takeBlockOpen(line);
    const st = takeStereotypes(noBlock);
    const col = takeColor(st.rest);
    if (!/^(\[|\(|:|\(\))/.test(col.rest)) return false;
    const named = parseNameAlias(col.rest);
    if (!named || named.form === "plain" || named.form === "quoted") return false;
    const keyword = /** @type {string} */ (formKeyword(named.form));
    const kind = ctx.config.keywords.get(keyword);
    if (!kind) return false;
    const node = declare(
      ctx,
      {
        keyword,
        id: named.id,
        label: named.label,
        stereotypes: st.stereotypes,
        colors: parseColorSpec(col.color),
        link: null,
        opensBlock: opens,
        opensDescription: false,
        description: "",
        rest: "",
      },
      kind,
    );
    if (opens) {
      node.container = true;
      ctx.stack.push(node);
    }
    void reader;
    return true;
  },
];

/**
 * Notes: attached (`note left of A`), floating (`note "x" as N`) and on links.
 * @type {import("../../syntax/reader.mjs").Rule<GraphContext>}
 */
function noteRule(line, ctx, reader) {
  const m = /^(?:note|hnote|rnote)\b\s*(.*)$/i.exec(line);
  if (!m) return false;
  let rest = m[1];
  const { model } = ctx;
  const col = takeColor(rest.replace(/:.*$/, ""));
  const colors = parseColorSpec(col.color);
  rest = rest.replace(/\s#[^\s:]+/, "");
  /** @type {string | null} */
  let text = null;
  const colon = /^(.*?)\s*:\s*(.*)$/.exec(rest);
  if (colon) {
    rest = colon[1];
    text = colon[2];
  }
  const readBody = () =>
    reader
      .until(/^\s*end\s*note\s*$/i)
      .map((l) => l.text.trim())
      .join("\n");

  const onLink = /^on\s+link\b/i.exec(rest);
  if (onLink) {
    const body = text ?? readBody();
    if (ctx.lastEdge)
      ctx.lastEdge.label = ctx.lastEdge.label
        ? `${ctx.lastEdge.label}\n${label(body)}`
        : label(body);
    return true;
  }
  const attached = /^(left|right|top|bottom|over)?\s*(?:of\s+)?(.*?)$/i.exec(rest.trim());
  const floating =
    /^"([^"]*)"\s+as\s+(\S+)$/i.exec(rest.trim()) ?? /^as\s+(\S+)$/i.exec(rest.trim());
  if (floating) {
    const id = floating.length === 3 ? floating[2] : floating[1];
    const body = floating.length === 3 ? floating[1] : (text ?? readBody());
    model.add(id, {
      label: label(body),
      shape: "note",
      role: "note",
      keyword: "note",
      colors,
      parent: currentParent(ctx),
    });
    return true;
  }
  const side = attached?.[1]?.toLowerCase() ?? null;
  const targetName = attached?.[2]?.trim() ?? "";
  const target = targetName ? model.find(endpointForm(targetName).name) : ctx.last;
  const body = text ?? readBody();
  const id = `__note${ctx.noteSeq++}`;
  const note = model.add(id, {
    label: label(body),
    shape: "note",
    role: "note",
    keyword: "note",
    colors,
    parent: target?.parent ?? currentParent(ctx),
  });
  if (target) {
    const e =
      side === "left" || side === "top"
        ? model.connect(note.id, target.id, { lineStyle: "dashed", role: "note" })
        : model.connect(target.id, note.id, { lineStyle: "dashed", role: "note" });
    e.data.note = true;
    e.direction =
      side === "left"
        ? "right"
        : side === "right"
          ? "right"
          : side === "top"
            ? "down"
            : side === "bottom"
              ? "down"
              : null;
  }
  return true;
}

/**
 * Apply `hide`/`remove` directives that target elements.
 * @param {GraphModel} model
 */
function applyVisibility(model) {
  const linked = new Set(model.edges.flatMap((e) => [e.from, e.to]));
  for (const directive of model.meta.hide) {
    const target = directive.replace(/^\$/, "");
    if (target === "@unlinked") {
      for (const n of model.nodes.values())
        if (!linked.has(n.id) && !n.container && !n.children.length) n.hidden = true;
      continue;
    }
    const stereo = /^<<(.+)>>$/.exec(target);
    for (const n of model.nodes.values()) {
      if (
        stereo
          ? n.stereotypes.some((s) => s.toLowerCase() === stereo[1])
          : n.id.toLowerCase() === target
      )
        n.hidden = true;
    }
  }
}

/** Re-exported helper for modules writing custom brace handling. */
export { braceDelta };
