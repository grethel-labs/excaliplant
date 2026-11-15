// Every file in examples/<kind>/ must be detected as <kind>, parse without
// warnings and render to valid Excalidraw, SVG and PNG output. The same
// files feed the documentation gallery, so docs and tests cannot drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
const kinds = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());

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
  const c = await render(source, { seed: "other" });
  assert.notDeepEqual(
    a.excalidraw.elements.map((e) => e.seed),
    c.excalidraw.elements.map((e) => e.seed),
  );
});
