// UML class-diagram declarations.
//
// Handles the `class` / `abstract class` / `interface` / `enum` /
// `annotation` / `record` family of
// PlantUML lines, including the bits that the generic keyword-shape plugin
// doesn't speak: generic type parameters, `extends`, `implements`, and the
// `{abstract}` / `{static}` member modifier tags. Block forms enter
// member-collection mode (the same model field as `class { … }`); inline
// forms with `extends` / `implements` still queue the corresponding
// inheritance / realisation connections so headers like
// `class Child extends Parent` (the canonical tplant output) work even
// without an explicit arrow line.
//
// This plugin only takes ownership of lines whose first non-modifier
// token is one of the PlantUML class-family keywords; other shape keywords
// (`component`, `entity`, `database`, …) flow through to the generic
// `shapeKeywordPlugin`, preserving existing behaviour.

import { slug, normalisePlantUmlText, normaliseShape } from "../../../util/plantuml_utils.mjs";

/**
 * Parsed pieces of a class-diagram declaration line.
 * @typedef {{
 *   shape: "class"|"interface"|"enum"|"annotation"|"record"|"protocol"|"struct"|"exception"|"metaclass"|"stereotype"|"dataclass"|"circle"|"entity",
 *   isAbstract: boolean,
 *   name: string,
 *   alias: string|null,
 *   generics: string,
 *   stereotype: string,
 *   extendsList: string[],
 *   implementsList: string[],
 *   description: string,
 *   opensBrace: boolean,
 * }} ClassHeader
 */

/**
 * Walk `<…>` from `s[0]` and return the index just past the matching
 * `>`. Returns `-1` when the angle brackets are unbalanced. Used so the
 * generic parameter list of a declaration (which can itself contain
 * `<>` and spaces) survives whitespace-aware parsing.
 * @param {string} s
 * @returns {number}
 */
function scanAngles(s) {
  if (s[0] !== "<") return -1;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "<") depth++;
    else if (c === ">") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Capture a comma-separated parent list (used for both `extends` and
 * `implements`). Stops at `{`, `:`, `<<` or another `extends`/`implements`
 * keyword. Generic parameters in parent names are tolerated.
 * @param {string} rest
 * @returns {{parents: string[], rest: string}}
 */
function scanParents(rest) {
  /** @type {string[]} */
  const parents = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < rest.length) {
    const c = rest[i];
    if (depth === 0) {
      if (c === "{" || c === ":") break;
      if (c === "<" && rest[i + 1] === "<") break;
      if (/\s/.test(c)) {
        const tail = rest.slice(i).trimStart();
        if (/^(extends|implements)\b/.test(tail)) break;
      }
    }
    if (c === "<") depth++;
    else if (c === ">") depth--;
    if (depth === 0 && c === ",") {
      parents.push(rest.slice(start, i).trim());
      start = i + 1;
    }
    i++;
  }
  const last = rest.slice(start, i).trim();
  if (last) parents.push(last);
  return { parents: parents.filter(Boolean), rest: rest.slice(i) };
}

/**
 * Strip the optional generic parameter list from a parent type so the
 * extends/implements target resolves against the box id table.
 * @param {string} parent
 * @returns {string}
 */
function bareParentName(parent) {
  const lt = parent.indexOf("<");
  return (lt >= 0 ? parent.slice(0, lt) : parent).trim();
}

/**
 * Parse a class-diagram header line. Returns `null` when the line does
 * not start with `class | interface | enum` (optionally preceded by an
 * `abstract` modifier). Designed to be lenient about ordering of the
 * `<<stereo>>`, `extends` and `implements` clauses since PlantUML itself
 * accepts them in either order.
 * @param {string} line
 * @returns {ClassHeader|null}
 */
export function parseClassHeader(line) {
  let rest = line.trim();
  rest = rest.replace(/^[+#~-]\s*/, "");
  let isAbstract = false;
  const absM = rest.match(/^abstract\s+/);
  if (absM) {
    isAbstract = true;
    rest = rest.slice(absM[0].length);
  }
  const kwM = rest.match(
    /^(class|interface|enum|annotation|record|protocol|struct|exception|metaclass|stereotype|dataclass|circle|entity)\s+/,
  );
  if (!kwM && !isAbstract) return null;
  const shape = /** @type {ClassHeader["shape"]} */ (kwM?.[1] || "class");
  if (kwM) rest = rest.slice(kwM[0].length).trimStart();

  // Name (quoted or bare identifier).
  let name = "";
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    if (end < 0) return null;
    name = rest.slice(1, end);
    rest = rest.slice(end + 1).trimStart();
  } else {
    const m = rest.match(/^[A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*/);
    if (!m) return null;
    name = m[0];
    rest = rest.slice(m[0].length);
  }
  // Optional generic parameter list.
  let generics = "";
  if (rest.startsWith("<")) {
    const end = scanAngles(rest);
    if (end < 0) return null;
    generics = rest.slice(0, end);
    rest = rest.slice(end);
  }
  rest = rest.trimStart();

  // Optional `as alias`.
  let alias = null;
  const asM = rest.match(/^as\s+("[^"]+"|\S+)\s*/);
  if (asM) {
    const rawAlias = asM[1];
    if (rawAlias.startsWith('"') && rawAlias.endsWith('"') && /^[A-Za-z_$][\w$.]*$/.test(name)) {
      alias = name;
      name = rawAlias.slice(1, -1);
    } else {
      alias = rawAlias.startsWith('"') && rawAlias.endsWith('"') ? rawAlias.slice(1, -1) : rawAlias;
    }
    rest = rest.slice(asM[0].length);
  }
  // Optional <<stereotype>> (may also follow extends/implements; loop below).
  let stereotype = "";
  const eatStereo = () => {
    const m = rest.match(/^<<\s*([^>]+?)\s*>>\s*/);
    if (m) {
      if (!stereotype) stereotype = m[1];
      rest = rest.slice(m[0].length);
      return true;
    }
    return false;
  };
  eatStereo();

  /** @type {string[]} */
  const extendsList = [];
  /** @type {string[]} */
  const implementsList = [];
  let progress = true;
  while (progress) {
    progress = false;
    if (eatStereo()) {
      progress = true;
      continue;
    }
    const color = rest.match(/^#[^\s{]+(?:\s+|$)/);
    if (color) {
      rest = rest.slice(color[0].length).trimStart();
      progress = true;
      continue;
    }
    if (/^extends\s+/.test(rest)) {
      rest = rest.replace(/^extends\s+/, "");
      const got = scanParents(rest);
      extendsList.push(...got.parents);
      rest = got.rest.trimStart();
      progress = true;
      continue;
    }
    if (/^implements\s+/.test(rest)) {
      rest = rest.replace(/^implements\s+/, "");
      const got = scanParents(rest);
      implementsList.push(...got.parents);
      rest = got.rest.trimStart();
      progress = true;
    }
  }

  // Optional `: description`.
  let description = "";
  const descM = rest.match(/^:\s*([^{]*?)\s*(\{)?\s*$/);
  if (descM) {
    description = descM[1].trim();
    const opensBrace = !!descM[2];
    return {
      shape,
      isAbstract,
      name,
      alias,
      generics,
      stereotype,
      extendsList,
      implementsList,
      description,
      opensBrace,
    };
  }
  // Trailing `{` only?
  if (rest === "{") {
    return {
      shape,
      isAbstract,
      name,
      alias,
      generics,
      stereotype,
      extendsList,
      implementsList,
      description: "",
      opensBrace: true,
    };
  }
  if (rest === "") {
    return {
      shape,
      isAbstract,
      name,
      alias,
      generics,
      stereotype,
      extendsList,
      implementsList,
      description: "",
      opensBrace: false,
    };
  }
  return null;
}

/**
 * Queue inheritance / realisation connections derived from `extends` /
 * `implements` clauses on a class-diagram header. The arrow shapes here
 * mirror the PlantUML defaults: solid triangle for inheritance, dashed
 * triangle for realisation.
 * @param {ClassHeader} hdr
 * @param {string} childId
 * @param {any} ctx
 */
function queueInheritance(hdr, childId, ctx) {
  for (const parent of hdr.extendsList) {
    const parentId = bareParentName(parent);
    if (!parentId) continue;
    ctx.queueConnection({
      fromId: childId,
      toId: parentId,
      label: "",
      kind: "inheritance",
      dashed: false,
      reversed: false,
      startArrowhead: null,
      endArrowhead: "triangle_outline",
      directionHint: null,
      // Class-diagram parents are implicitly declared per PlantUML
      // semantics — opt this edge into endpoint auto-vivification.
      allowVivify: true,
    });
  }
  for (const parent of hdr.implementsList) {
    const parentId = bareParentName(parent);
    if (!parentId) continue;
    ctx.queueConnection({
      fromId: childId,
      toId: parentId,
      label: "",
      kind: "realization",
      dashed: true,
      reversed: false,
      startArrowhead: null,
      endArrowhead: "triangle_outline",
      directionHint: null,
      allowVivify: true,
    });
  }
}

/**
 * Build the box title from the parsed header. Generics are kept on the
 * title so users still see `Container<T>`, while the box id is derived
 * from the bare name to match arrow endpoints (`Container --> Item`).
 * @param {ClassHeader} hdr
 * @returns {string}
 */
function headerTitle(hdr) {
  return normalisePlantUmlText(hdr.name + (hdr.generics || ""));
}

/**
 * Pick the stereotype shown on the box. Honour any explicit
 * `<<stereo>>` first; otherwise synthesise a class-diagram default
 * (`<<interface>>`, `<<enumeration>>`, `<<abstract>>`) so the rendered
 * shape carries the same visual hint PlantUML draws.
 * @param {ClassHeader} hdr
 * @returns {string}
 */
function headerStereotype(hdr) {
  if (hdr.stereotype) return hdr.stereotype;
  if (hdr.shape === "interface") return "interface";
  if (hdr.shape === "enum") return "enumeration";
  if (hdr.shape === "annotation") return "annotation";
  if (hdr.shape === "record") return "record";
  if (hdr.shape === "protocol") return "protocol";
  if (hdr.shape === "struct") return "struct";
  if (hdr.shape === "exception") return "exception";
  if (hdr.shape === "metaclass") return "metaclass";
  if (hdr.shape === "stereotype") return "stereotype";
  if (hdr.shape === "dataclass") return "dataclass";
  if (hdr.shape === "circle") return "circle";
  if (hdr.shape === "entity") return "entity";
  if (hdr.isAbstract) return "abstract";
  return "";
}

/**
 * Class-diagram block plugin. Runs before the generic keyword-shape
 * plugin so class-family declarations with `[extends|implements] [{ … }]` are
 * routed here, while everything else (`component`, `database`, …)
 * keeps flowing through {@link shapeKeywordPlugin}.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const classBlockPlugin = {
  name: "component.classBlock",
  tryStart(line, ctx) {
    const hdr = parseClassHeader(line);
    if (!hdr || !hdr.opensBrace) return null;
    // Match the shared shape plugin's id convention: prefer the explicit
    // alias, otherwise use the bare type name verbatim so arrow lines
    // like `Child --> Parent` resolve against it. Quoted titles fall
    // back to a slug since they are free-form labels.
    const id = hdr.alias || (/^[A-Za-z_][\w.]*$/.test(hdr.name) ? hdr.name : slug(hdr.name));
    const box = ctx.addBox({
      id,
      title: headerTitle(hdr),
      description: normalisePlantUmlText(hdr.description),
      shape: normaliseShape(hdr.shape),
      stereotype: headerStereotype(hdr),
      members: [],
    });
    queueInheritance(hdr, id, ctx);
    /** @type {string[]} */
    const collected = [];
    return {
      onLine(memberLine) {
        // Drop blank separators inside the body but keep all real
        // member lines verbatim — the renderer prints them as-is so
        // visibility prefixes (`+`, `-`, `#`, `~`) and modifier tags
        // (`{static}`, `{abstract}`) survive.
        if (memberLine !== "") collected.push(normalisePlantUmlText(memberLine));
      },
      tryEnd(memberLine) {
        if (memberLine !== "}") return false;
        box.members = collected;
        return true;
      },
    };
  },
  tryLine(line, ctx) {
    const hdr = parseClassHeader(line);
    if (!hdr || hdr.opensBrace) return false;
    const id = hdr.alias || (/^[A-Za-z_][\w.]*$/.test(hdr.name) ? hdr.name : slug(hdr.name));
    ctx.addBox({
      id,
      title: headerTitle(hdr),
      description: normalisePlantUmlText(hdr.description),
      shape: normaliseShape(hdr.shape),
      stereotype: headerStereotype(hdr),
    });
    queueInheritance(hdr, id, ctx);
    return true;
  },
};
