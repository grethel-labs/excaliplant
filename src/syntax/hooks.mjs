/** PlantUML extension for named, declarative element interactions. */

import { LimitError, ParseError } from "../core/errors.mjs";
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
 * @property {"toggle" | "button"} [clickMode] Activation behavior. Defaults to toggle.
 * @property {string} [parentId] Explicit author-defined parent ID.
 * @property {number} line
 * @property {RoleStyle} hover
 * @property {RoleStyle} click
 */

/** @typedef {Pick<Hook, "selector" | "target" | "line"> & { text: string }} Tooltip */

/** @param {Diagnostics} diagnostics @param {number} line @param {string} message */
export function reportHookError(diagnostics, line, message) {
  if (diagnostics.strict) throw new ParseError(message, { line, code: "INVALID_HOOK" });
  diagnostics.warn(message, line);
}

/** @param {Diagnostics} diagnostics @param {number} line @param {string} message */
export function reportTooltipError(diagnostics, line, message) {
  if (diagnostics.strict) throw new ParseError(message, { line, code: "INVALID_TOOLTIP" });
  diagnostics.warn(message, line);
}

/**
 * Remove consecutive hook and tooltip directives in a page's preamble. The first body line
 * ends the preamble so notes, diagram labels and raw payloads retain their text.
 * @param {SourceLine[]} lines
 * @param {Diagnostics} diagnostics
 * @param {{ raw?: boolean, maxTextLength: number }} options
 * @returns {{ lines: SourceLine[], hooks: Hook[], tooltips: Tooltip[] }}
 */
export function extractInteractions(lines, diagnostics, options) {
  /** @type {Hook[]} */
  const hooks = [];
  /** @type {Tooltip[]} */
  const tooltips = [];
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
    if (/^@tooltip(?:\s|$)/i.test(trimmed)) {
      const tooltip = parseTooltip(trimmed, line);
      if (!tooltip && options.raw) break;
      found = true;
      if (!tooltip) reportTooltipError(diagnostics, line, "Invalid @tooltip declaration");
      else {
        if (tooltip.text.length > options.maxTextLength)
          throw new LimitError(`Tooltip longer than ${options.maxTextLength} characters`, { line });
        tooltips.push(tooltip);
      }
      continue;
    }
    if (!/^@hook(?:\s|$)/i.test(trimmed)) break;
    const declaration =
      /^@hook\s+(?:#?([A-Za-z_][\w-]{0,63})\s+)?(alias|element):(?:"([^"\r\n]+)"|([^"\s]+))((?:\s+\.[A-Za-z_][\w-]{0,63})*)((?:\s+(?:click-from-children|parent:#[A-Za-z_][\w-]{0,63}|click-mode:(?:toggle|button))){0,3})$/i.exec(
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
      const clickMode = modifiers.find((modifier) => /^click-mode:/i.test(modifier))?.slice(11);
      if (
        modifiers.length >
        new Set(modifiers.map((modifier) => modifier.split(":")[0].toLowerCase())).size
      ) {
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
        ...(clickMode && { clickMode: clickMode.toLowerCase() === "button" ? "button" : "toggle" }),
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
  return { lines: found ? lines.slice(index) : lines, hooks, tooltips };
}

/** @param {string} directive @param {number} line @returns {Tooltip | null} */
function parseTooltip(directive, line) {
  const match = /^@tooltip\s+(alias|element):(?:"([^"\r\n]+)"|([^"\s]+))\s+("[^\r\n]*")$/i.exec(
    directive,
  );
  if (!match) return null;
  const [, selector, quoted, token, literal] = match;
  try {
    const text = JSON.parse(literal);
    return typeof text === "string" && text.trim()
      ? {
          selector: selector.toLowerCase() === "alias" ? "alias" : "element",
          target: quoted ?? token,
          text,
          line,
        }
      : null;
  } catch {
    return null;
  }
}
