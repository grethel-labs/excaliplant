import { readFileSync, readdirSync } from "node:fs";
import { parse } from "acorn";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Visit AST nodes without walking parser metadata. */
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else {
      walk(value, visit);
    }
  }
}

export function parseThemeDefinition(source, filename) {
  const definition = JSON.parse(source);
  walk(parse("(" + source + ")", { ecmaVersion: "latest" }), (node) => {
    if (node.type !== "ObjectExpression") return;
    const keys = new Set();
    for (const property of node.properties) {
      const key = property.key.value;
      if (keys.has(key)) throw new Error(`${filename}: duplicate key "${key}"`);
      keys.add(key);
    }
  });
  return definition;
}

const kebab = (key) => key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
const channels = ["fill", "stroke", "text"];

export function scanThemeSource(source, filename, { checkLiterals = true } = {}) {
  const paths = new Map();
  walk(parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true }), (node) => {
    const line = node.loc.start.line;
    if (node.type === "Literal" && typeof node.value === "string") {
      if (/^special\.[a-z0-9.-]+$/.test(node.value)) paths.set(node.value, line);
      if (checkLiterals && /^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(node.value))
        throw new Error(`${filename}:${line}: hard-coded diagram colour ${node.value}`);
    }
    if (node.type === "CallExpression" && node.callee.name === "themeColor") {
      const path = node.arguments[1];
      if (path?.type === "Literal" && typeof path.value === "string") paths.set(path.value, line);
    }
    if (
      node.type === "Property" &&
      (node.key.name ?? node.key.value) === "role" &&
      node.value.type === "Literal" &&
      typeof node.value.value === "string"
    ) {
      for (const channel of channels)
        paths.set(`roles.${kebab(node.value.value)}.${channel}`, line);
    }
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      (node.object.name === "theme" || node.object.property?.name === "theme")
    ) {
      const property = node.property.name;
      if (property === "background" || property === "surface")
        paths.set(`canvas.${property}`, line);
      if (property === "ink" || property === "muted") paths.set(`colors.${property}`, line);
    }
    if (node.type === "CallExpression" && node.callee.name === "roleStyle") {
      const role = node.arguments[1];
      if (role?.type === "Literal" && typeof role.value === "string")
        for (const channel of channels) paths.set(`roles.${kebab(role.value)}.${channel}`, line);
    }
  });
  return paths;
}

// Literal endpoints in colour algebra and sanitizing fallbacks for imported documents
// are outside theme paint. Other source files use named theme colours.
const literalExceptions = new Set([
  "core/preprocess/builtins.mjs",
  "draw/theme_registry.mjs",
  "render/svg.mjs",
  "syntax/color.mjs",
]);

export function checkThemeInventory(root, base) {
  const directory = fileURLToPath(root);
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mjs") || entry.name.endsWith(".generated.mjs"))
      continue;
    const filename = path.join(entry.parentPath, entry.name);
    const checkLiterals = !literalExceptions.has(
      path.relative(directory, filename).split(path.sep).join("/"),
    );
    for (const [key, line] of scanThemeSource(readFileSync(filename, "utf8"), filename, {
      checkLiterals,
    })) {
      if (!Object.hasOwn(base.colors, key))
        throw new Error(`${filename}:${line}: missing base theme colour "${key}"`);
    }
  }
}
