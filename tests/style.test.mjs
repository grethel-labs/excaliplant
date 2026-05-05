// Style configuration tests.
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEFAULT_STYLE,
  getStyle,
  setStyle,
  resetStyle,
  loadStyleFromFile,
  parseSimpleYaml,
  resolveFontFamilyId,
  EXCALIDRAW_FONT_FAMILY,
  renderPlantUml,
} from "../index.mjs";

test("DEFAULT_STYLE is frozen and exposes the documented shape", () => {
  assert.equal(Object.isFrozen(DEFAULT_STYLE), true);
  assert.equal(typeof DEFAULT_STYLE.font.sizeTitle, "number");
  assert.equal(DEFAULT_STYLE.shape.connectionRoughness, 0);
  assert.equal(DEFAULT_STYLE.edgeLabel.useLineColor, true);
  assert.equal(DEFAULT_STYLE.edgeLabel.textColor, "#ffffff");
});

test("setStyle deep-merges and resetStyle restores defaults", () => {
  resetStyle();
  setStyle({ font: { sizeTitle: 99 }, edgeLabel: { textColor: "#abcdef" } });
  const s = getStyle();
  assert.equal(s.font.sizeTitle, 99);
  assert.equal(s.font.sizeDescription, DEFAULT_STYLE.font.sizeDescription);
  assert.equal(s.edgeLabel.textColor, "#abcdef");
  assert.equal(s.edgeLabel.useLineColor, true);
  resetStyle();
  assert.equal(getStyle().font.sizeTitle, DEFAULT_STYLE.font.sizeTitle);
});

test("setStyle ignores prototype-pollution keys", () => {
  resetStyle();
  setStyle({ __proto__: { polluted: true }, constructor: { evil: 1 } });
  // @ts-ignore — verifying nothing leaked onto Object.prototype.
  assert.equal({}.polluted, undefined);
  assert.equal(getStyle().constructor, Object);
  resetStyle();
});

test("resolveFontFamilyId handles names, ids, and unknown values", () => {
  assert.equal(resolveFontFamilyId("Excalifont"), EXCALIDRAW_FONT_FAMILY.Excalifont);
  assert.equal(resolveFontFamilyId(3), 3);
  assert.equal(resolveFontFamilyId("Unknown"), EXCALIDRAW_FONT_FAMILY.Excalifont);
});

test("parseSimpleYaml parses scalars, nested maps, and comments", () => {
  const yaml = `
# top-level comment
font:
  sizeTitle: 22  # inline comment
  family: "Excalifont"
  glyphRatio: 0.5
flags:
  on: true
  off: false
  none: null
`;
  const out = parseSimpleYaml(yaml);
  assert.equal(out.font.sizeTitle, 22);
  assert.equal(out.font.family, "Excalifont");
  assert.equal(out.font.glyphRatio, 0.5);
  assert.equal(out.flags.on, true);
  assert.equal(out.flags.off, false);
  assert.equal(out.flags.none, null);
});

test("parseSimpleYaml skips dangerous keys", () => {
  const out = parseSimpleYaml("__proto__: bad\nconstructor: bad\nok: 1\n");
  assert.equal(out.ok, 1);
  // @ts-ignore
  assert.equal({}.__proto__, Object.prototype);
});

test("loadStyleFromFile reads JSON and YAML and is silent on missing files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "excaliplant-style-"));
  try {
    const jsonPath = path.join(dir, "style.json");
    writeFileSync(jsonPath, JSON.stringify({ font: { sizeTitle: 7 } }));
    resetStyle();
    loadStyleFromFile(jsonPath);
    assert.equal(getStyle().font.sizeTitle, 7);

    const yamlPath = path.join(dir, "style.yaml");
    writeFileSync(yamlPath, "font:\n  sizeTitle: 8\n");
    resetStyle();
    loadStyleFromFile(yamlPath);
    assert.equal(getStyle().font.sizeTitle, 8);

    // Missing file: returns the active style without throwing.
    resetStyle();
    const before = getStyle().font.sizeTitle;
    loadStyleFromFile(path.join(dir, "does-not-exist.json"));
    assert.equal(getStyle().font.sizeTitle, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    resetStyle();
  }
});

test("style overrides flow into the renderer (edge label colour + font)", async () => {
  resetStyle();
  setStyle({
    font: { sizeEdgeLabel: 9 },
    edgeLabel: { useLineColor: false, backgroundColor: "#112233", textColor: "#fefefe" },
  });
  const doc = await renderPlantUml(
    `@startuml
[A] as a
[B] as b
a --> b : hello
@enduml`,
    { sourceLabel: "style-test" },
  );
  const chip = doc.elements.find(
    (e) => e.type === "rectangle" && e.customData?.role === "edgeLabelChip",
  );
  const lbl = doc.elements.find((e) => e.type === "text" && e.customData?.role === "edgeLabelText");
  assert.ok(chip, "expected an edge-label chip");
  assert.ok(lbl, "expected an edge-label text");
  assert.equal(chip.backgroundColor, "#112233");
  assert.equal(lbl.strokeColor, "#fefefe");
  assert.equal(lbl.fontSize, 9);
  assert.equal(chip.roughness, 0);
  resetStyle();
});

test("auto-shrink reduces font size for unbreakable long titles", async () => {
  resetStyle();
  // Verify the wrap-and-shrink helper directly: a single very long
  // unbreakable token at 18 px is wider than 200 px, so the helper
  // must shrink the font size to fit.
  const { measureFitted } = await import("../src/style/text.mjs");
  const fitted = measureFitted("VeryLongUnbreakableSingleWordTitleThatCannotWrap", 18, 200);
  assert.ok(fitted.fontSize < 18, `expected shrunken fontSize, got ${fitted.fontSize}`);
  assert.ok(fitted.fontSize >= DEFAULT_STYLE.text.minFontSize);
  resetStyle();
});

test("auto-shrink can be disabled via style", async () => {
  resetStyle();
  setStyle({ text: { autoShrink: false } });
  const { measureFitted } = await import("../src/style/text.mjs");
  const fitted = measureFitted("VeryLongUnbreakableSingleWordTitleThatCannotWrap", 18, 200);
  assert.equal(fitted.fontSize, 18);
  resetStyle();
});
