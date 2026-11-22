import assert from "node:assert/strict";
import { test } from "node:test";
import { THEME_NAMES } from "../src/index.mjs";
import { readThemeEnvironment } from "../src/draw/theme_env.mjs";
import { assertThemeContrast } from "../scripts/theme_contrast.mjs";
import { createTheme } from "../src/draw/theme.mjs";
import { createThemeRegistry, resolveColors } from "../src/draw/theme_registry.mjs";
import { parseThemeDefinition, scanThemeSource } from "../scripts/theme_inventory.mjs";

const base = {
  id: "base",
  colors: { "palette.blue.fill": "#fff", "palette.blue.stroke": "#000000" },
  palette: ["blue"],
};

test("theme inheritance permits indirect parents and reports full cycles", () => {
  const definitions = [
    base,
    { id: "grandchild", extends: "child" },
    { id: "child", colors: { "palette.blue.fill": "transparent" } },
  ];
  const registry = createThemeRegistry(definitions);
  assert.equal(
    resolveColors(registry.get("grandchild").colors).get("palette.blue.fill"),
    "transparent",
  );
  assert.equal(resolveColors(registry.get("base").colors).get("palette.blue.fill"), "#ffffff");
  assert.throws(
    () => createThemeRegistry([base, { id: "child", extends: "child" }]),
    /child → child/,
  );
  assert.throws(
    () =>
      createThemeRegistry([
        base,
        { id: "child", extends: "other" },
        { id: "other", extends: "child" },
      ]),
    /child → other → child/,
  );
  assert.throws(
    () => createThemeRegistry([base, { id: "child", extends: "missing" }]),
    /child → missing/,
  );
  assert.throws(() => createThemeRegistry([base, base]), /duplicate/);
});

test("colour references see overrides and support explicit alpha", () => {
  const definitions = {
    "colors.ink": "#111827",
    "roles.note.text": { ref: "colors.ink", alpha: 0.5 },
    "roles.label.fill": { ref: "colors.ink", alpha: 0 },
    "roles.label.text": { ref: "colors.ink", alpha: 1 },
  };
  const result = resolveColors(definitions, { "colors.ink": "#224466" });
  assert.equal(result.get("roles.note.text"), "#22446680");
  assert.equal(result.get("roles.label.fill"), "transparent");
  assert.equal(result.get("roles.label.text"), "#224466");
  assert.throws(() => resolveColors({ a: { ref: "b" }, b: { ref: "a" } }), /a → b → a/);
  assert.throws(() => resolveColors({ a: { ref: "b" } }), /a → b/);
  assert.throws(() => resolveColors(definitions, { "colors.ink": "#1122334" }), /Invalid/);
  assert.throws(() => resolveColors(definitions, { "colors.typo": "#fff" }), /Unknown/);
});

test("inventory discovers colour and role references and rejects literal paint", () => {
  const paths = scanThemeSource(
    'themeColor(theme, "new.paint"); roleStyle(theme, "fragmentTag");',
    "fixture.mjs",
  );
  assert.ok(paths.has("new.paint"));
  assert.ok(paths.has("roles.fragment-tag.text"));
  assert.throws(
    () => scanThemeSource('c.rect(0, 0, 10, 10, { fill: "#f80" });', "fixture.mjs"),
    /fixture.mjs:1: hard-coded diagram colour/,
  );
  assert.throws(() => parseThemeDefinition('{"id":"a","id":"b"}', "fixture.json"), /duplicate key/);
});

test("host colour overrides resolve independently and reach aliases", () => {
  const path = "roles.class.fill";
  const colors = readThemeEnvironment({ EXCALIPLANT_COLOR__ROLES__CLASS__FILL: "#123456" });
  assert.equal(createTheme("plain", { colors }).roles.class.fill, "#123456");
  assert.equal(createTheme("plain", { colors: { [path]: "#abcdef" } }).roles.class.fill, "#abcdef");
  assert.notEqual(createTheme("plain").roles.class.fill, "#123456");
  assert.throws(
    () => readThemeEnvironment({ EXCALIPLANT_COLOR__ROLES__CLASS__TYPO: "#fff" }),
    /Unknown theme colour environment variable/,
  );
  assert.ok(THEME_NAMES.includes("grethel-labs-dark"));
  assert.equal(createTheme("transparent-dark").background, "transparent");
  assert.equal(createTheme("transparent-dark").surface, "#111827");
});

test("contrast is checked from inherited tokens and alpha without rendering", () => {
  const definition = {
    ...base,
    colors: {
      ...base.colors,
      "canvas.background": "transparent",
      "canvas.surface": "#ffffff80",
      "roles.note.text": { ref: "palette.blue.stroke" },
    },
    contrast: {
      backdrops: ["#ffffff"],
      pairs: [{ foreground: "roles.note.text", backgrounds: ["canvas.surface"], kind: "text" }],
    },
  };
  const [resolved] = createThemeRegistry([definition]).values();
  assert.doesNotThrow(() => assertThemeContrast(resolved));
  const invalid = { ...resolved, colors: { ...resolved.colors, "roles.note.text": "#00000040" } };
  assert.throws(() => assertThemeContrast(invalid), /roles.note.text.*< 4.5:1/);
  assert.throws(
    () => assertThemeContrast({ ...resolved, contrast: { ...resolved.contrast, backdrops: [] } }),
    /requires contrast backdrops/,
  );
  assert.throws(
    () =>
      assertThemeContrast({
        ...resolved,
        contrast: {
          ...resolved.contrast,
          pairs: [{ foreground: "roles.note.typo", backgrounds: [], kind: "text" }],
        },
      }),
    /unknown contrast colour "roles.note.typo"/,
  );
});
