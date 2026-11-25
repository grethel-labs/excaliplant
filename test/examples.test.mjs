// Every file in examples/<kind>/ must be detected as <kind>, parse without
// warnings and render to valid Excalidraw, SVG and PNG output. The same
// files feed the documentation gallery, so docs and tests cannot drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILTIN_DIAGRAMS, render } from "../src/index.mjs";
import { createMeta } from "../src/syntax/commons.mjs";
import { TYPES } from "../scripts/showcase.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
const kinds = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());

test("every registered kind has an example and a showcase entry", () => {
  const registered = BUILTIN_DIAGRAMS.map(({ kind }) => kind).sort();
  assert.deepEqual(kinds.map(({ name }) => name).sort(), registered);
  assert.deepEqual(TYPES.map(([kind]) => kind).sort(), registered);
  for (const { name } of kinds) {
    assert.ok(
      readdirSync(path.join(root, name), { withFileTypes: true }).some(
        (entry) => entry.isFile() && entry.name.endsWith(".puml"),
      ),
      `${name} needs a .puml example`,
    );
  }
});

const metaFields = Object.keys(createMeta());
for (const dir of kinds) {
  for (const file of readdirSync(path.join(root, dir.name)).filter((f) => f.endsWith(".puml"))) {
    test(`example ${dir.name}/${file}`, async () => {
      const source = readFileSync(path.join(root, dir.name, file), "utf8");
      const result = await render(source);
      assert.equal(result.kind, dir.name, "diagram kind is detected from the source");
      assert.deepEqual(
        result.diagnostics.filter((d) => d.severity === "warning"),
        [],
        "example parses without warnings",
      );
      for (const field of metaFields) {
        assert.ok(Object.hasOwn(result.model.meta, field), `model meta is missing ${field}`);
      }

      const doc = result.excalidraw;
      assert.equal(doc.type, "excalidraw");
      assert.ok(doc.elements.length >= 5, "renders a meaningful number of elements");
      const ids = new Set(doc.elements.map((e) => e.id));
      assert.equal(ids.size, doc.elements.length, "element ids are unique");
      assert.ok(
        doc.elements.some((e) => e.type === "text" && e.text.trim()),
        "contains text",
      );

      const svg = await result.toSvg({ embedFont: false });
      assert.match(svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"/);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/);

      const png = await result.toPng({ width: 320 });
      assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNG signature");
    });
  }
}

test("rendering is deterministic", async () => {
  const source = readFileSync(path.join(root, "class", "shop-domain.puml"), "utf8");
  const a = await render(source);
  const b = await render(source);
  assert.deepEqual(a.excalidraw, b.excalidraw);
  assert.equal(await a.toSvg({ embedFont: false }), await b.toSvg({ embedFont: false }));
  assert.deepEqual(await a.toPng({ width: 320 }), await b.toPng({ width: 320 }));
  const c = await render(source, { seed: "other" });
  assert.notDeepEqual(
    a.excalidraw.elements.map((e) => e.seed),
    c.excalidraw.elements.map((e) => e.seed),
  );
});
