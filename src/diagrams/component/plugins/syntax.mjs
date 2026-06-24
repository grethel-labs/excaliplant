/**
 * Component-diagram specific syntax plugins.
 * @module diagrams/component/plugins/syntax
 */

import {
  normalisePlantUmlText,
  slug,
  stripQuotes,
  STEREOTYPE,
} from "../../../util/plantuml_utils.mjs";

const COMPONENT_BRACKET =
  /^component\s+\[([^\]]*)\](?:\s+as\s+([A-Za-z_$][\w$.-]*))?(?:\s+#[^\s]+)?$/i;
const COMPONENT_LONG_START = /^component\s+([A-Za-z_$][\w$.-]*)\s+\[\s*$/i;
const JSON_HEADER = /^json\s+(.+?)(\s*\{)?$/i;

/**
 * @param {string} raw
 * @returns {{id:string,title:string,stereotype:string}}
 */
function parseAliasableName(raw) {
  let body = raw.trim();
  let stereotype = "";
  const stereo = body.match(STEREOTYPE);
  if (stereo) {
    stereotype = stereo[1].trim();
    body = body.replace(stereo[0], "").trim();
  }
  const alias = body.match(/^("[^"]+"|.+?)\s+as\s+([A-Za-z_$][\w$.-]*)$/i);
  if (alias) return { id: alias[2], title: stripQuotes(alias[1].trim()), stereotype };
  const title = stripQuotes(body);
  return { id: body.startsWith('"') ? slug(title) : body.split(/\s+/)[0], title, stereotype };
}

/**
 * Official `component [Label] as Alias` and long-description component block.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const componentBracketDeclarationPlugin = {
  name: "component.bracketDeclaration",
  tryStart(line, ctx) {
    const start = line.match(COMPONENT_LONG_START);
    if (!start) return null;
    const id = start[1];
    /** @type {string[]} */
    const lines = [];
    return {
      onLine(bodyLine) {
        lines.push(bodyLine);
      },
      tryEnd(bodyLine) {
        if (bodyLine !== "]") return false;
        ctx.addBox({
          id,
          title: normalisePlantUmlText(id),
          description: normalisePlantUmlText(lines.join("\n")),
          shape: "component",
        });
        return true;
      },
    };
  },
  tryLine(line, ctx) {
    const match = line.match(COMPONENT_BRACKET);
    if (!match) return false;
    const [, label, alias] = match;
    ctx.addBox({
      id: alias || slug(label),
      title: normalisePlantUmlText(label),
      shape: "component",
    });
    return true;
  },
};

/**
 * JSON display in component diagrams.
 * @type {import("../../../util/parser_engine.mjs").Plugin}
 */
export const componentJsonPlugin = {
  name: "component.json",
  tryStart(line, ctx) {
    const match = line.match(JSON_HEADER);
    if (!match || !match[2]) return null;
    const parsed = parseAliasableName(match[1]);
    const box = ctx.addBox({
      id: parsed.id,
      title: normalisePlantUmlText(parsed.title),
      shape: "map",
      stereotype: parsed.stereotype,
      members: [],
    });
    return {
      onLine(bodyLine) {
        if (!bodyLine || bodyLine === "--") return;
        box.members.push(normalisePlantUmlText(bodyLine.trim()));
      },
      tryEnd(bodyLine) {
        return bodyLine === "}";
      },
    };
  },
  tryLine(line, ctx) {
    const match = line.match(JSON_HEADER);
    if (!match || match[2]) return false;
    const parsed = parseAliasableName(match[1]);
    ctx.addBox({
      id: parsed.id,
      title: normalisePlantUmlText(parsed.title),
      shape: "map",
      stereotype: parsed.stereotype,
    });
    return true;
  },
};
