/** PlantUML extension for named, declarative element interactions. */

import { ParseError } from "../core/errors.mjs";
import { parseStyleProperty } from "./skin.mjs";

/** @typedef {import("../draw/theme.mjs").RoleStyle} RoleStyle */
/** @typedef {import("../core/diagnostics.mjs").Diagnostics} Diagnostics */
/** @typedef {import("../core/source.mjs").SourceLine} SourceLine */

/**
 * @typedef {object} Hook
 * @property {string} name Internal identity shared across scene primitives.
 * @property {string} [id] Author-defined ID.
 * @property {string[]} classes
 * @property {"alias" | "element"} selector
 * @property {string} target
 * @property {true} [clickFromChildren] Forward descendant clicks to this binding.
 * @property {string} [parentId] Explicit author-defined parent ID.
 * @property {number} line
 * @property {RoleStyle} hover
 * @property {RoleStyle} click
 */

/** @param {Diagnostics} diagnostics @param {number} line @param {string} message */
export function reportHookError(diagnostics, line, message) {
  if (diagnostics.strict) throw new ParseError(message, { line, code: "INVALID_HOOK" });
  diagnostics.warn(message, line);
}

/**
 * Remove consecutive hook directives in a page's preamble. The first body line
 * ends the preamble so notes, diagram labels and raw payloads retain their text.
 * @param {SourceLine[]} lines
 * @param {Diagnostics} diagnostics
 * @param {{ raw?: boolean }} [options]
 * @returns {{ lines: SourceLine[], hooks: Hook[] }}
 */
export function extractHooks(lines, diagnostics, options = {}) {
  /** @type {Hook[]} */
  const hooks = [];
  /** @type {Map<string, Hook>} */
  const byId = new Map();
  /** @type {Map<string, Pick<Hook, "hover" | "click">>} */
  const byClass = new Map();
  /** @type {{ selector: string, state: "hover" | "click", value: RoleStyle, line: number }[]} */
  const styles = [];
  let index = 0;
  let found = false;
  for (; index < lines.length; index++) {
    const { text, line } = lines[index];
    const trimmed = text.trim();
    if (!trimmed) continue;
    if (!/^@hook(?:\s|$)/i.test(trimmed)) break;
    const declaration =
      /^@hook\s+(?:#?([A-Za-z_][\w-]{0,63})\s+)?(alias|element):(?:"([^"\r\n]+)"|([^"\s]+))((?:\s+\.[A-Za-z_][\w-]{0,63})*)((?:\s+(?:click-from-children|parent:#[A-Za-z_][\w-]{0,63})){0,2})$/i.exec(
        trimmed,
      );
    const style = declaration
      ? null
      : /^@hook\s+([#.]?[A-Za-z_][\w-]{0,63})\s+(hover|click)\s+([A-Za-z][\w-]*)(?:\s*:\s*|\s+)(.+)$/i.exec(
          trimmed,
        );
    // Raw formats can start with literal @hook text, such as a Ditaa row.
    if (options.raw && !declaration && !(found && style)) break;
    found = true;
    if (declaration) {
      const [, id, selector, quoted, token, classList, modifierList] = declaration;
      const classes = [
        ...new Set(
          classList
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((s) => s.slice(1)),
        ),
      ];
      if (!id && classes.length === 0) {
        reportHookError(diagnostics, line, "A hook needs an ID or a class");
        continue;
      }
      if (classes.length > 32) {
        reportHookError(diagnostics, line, "A hook can have up to 32 classes");
        continue;
      }
      if (id && byId.has(id)) {
        reportHookError(diagnostics, line, `Duplicate hook ID "${id}"`);
        continue;
      }
      const modifiers = modifierList.trim().split(/\s+/).filter(Boolean);
      const clickFromChildren = modifiers.some((modifier) =>
        /^click-from-children$/i.test(modifier),
      );
      const parentId = modifiers.find((modifier) => /^parent:#/i.test(modifier))?.slice(8);
      if (modifiers.length > Number(clickFromChildren) + Number(Boolean(parentId))) {
        reportHookError(diagnostics, line, "Duplicate hook modifier");
        continue;
      }
      /** @type {Hook} */
      const hook = {
        name: id ?? `@line:${line}:${hooks.length}`,
        id,
        classes,
        selector: /** @type {Hook["selector"]} */ (selector.toLowerCase()),
        target: quoted ?? token,
        ...(clickFromChildren && { clickFromChildren: true }),
        ...(parentId && { parentId }),
        line,
        hover: {},
        click: {},
      };
      hooks.push(hook);
      if (id) byId.set(id, hook);
      for (const name of classes)
        if (!byClass.has(name)) byClass.set(name, { hover: {}, click: {} });
      continue;
    }
    if (style) {
      const [, selector, state, property, raw] = style;
      const value = parseStyleProperty(property, raw);
      if (!value) reportHookError(diagnostics, line, `Invalid hook style "${property}"`);
      else
        styles.push({
          selector,
          state: /** @type {"hover" | "click"} */ (state.toLowerCase()),
          value,
          line,
        });
      continue;
    }
    reportHookError(diagnostics, line, "Invalid @hook declaration");
  }
  for (const { selector, state, value, line } of styles) {
    const target = selector.startsWith(".")
      ? byClass.get(selector.slice(1))
      : byId.get(selector.replace(/^#/, ""));
    if (!target) reportHookError(diagnostics, line, `Unknown hook "${selector}"`);
    else Object.assign(target[state], value);
  }
  for (const hook of hooks) {
    const hover = {};
    const click = {};
    for (const name of hook.classes) {
      const group = byClass.get(name);
      Object.assign(hover, group.hover);
      Object.assign(click, group.click);
    }
    hook.hover = { ...hover, ...hook.hover };
    hook.click = { ...click, ...hook.click };
  }
  return { lines: found ? lines.slice(index) : lines, hooks };
}
