// Hostile-input regression tests: SVG injection, prototype pollution,
// resource limits, regex backtracking and file-system access.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render, preprocessText } from "../src/index.mjs";
import { LimitError } from "../src/core/errors.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import { svgToPng } from "../src/render/png.mjs";

test("labels are escaped in SVG output", async () => {
  const r = await render(
    '@startuml\nclass "<script>alert(1)</script>" as X\nX : "a&b<img src=x onerror=alert(1)>"\n@enduml',
  );
  const svg = await r.toSvg({ embedFont: false });
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;script&gt;/);
});

test("colours that are not colours never reach SVG attributes", async () => {
  const r = await render('@startuml\nclass A #red"onload="alert(1)\n@enduml');
  const svg = await r.toSvg({ embedFont: false });
  assert.doesNotMatch(svg, /onload/);
  const doc = structuredClone(r.excalidraw);
  doc.elements[0].strokeColor = '"/><script>alert(1)</script>';
  assert.doesNotMatch(excalidrawToSvg(doc, { embedFont: false }), /<script>/);
});

test("only http(s)/mailto links survive", async () => {
  const r = await render(
    "@startuml\nclass A [[javascript:alert(1)]]\nclass B [[https://example.com]]\n@enduml",
  );
  const links = r.excalidraw.elements.map((e) => e.link).filter(Boolean);
  assert.deepEqual(links, ["https://example.com"]);
});

test("JSON/YAML keys cannot pollute prototypes", async () => {
  await render(
    '@startjson\n{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"x": 1}}}\n@endjson',
  );
  await render("@startyaml\n__proto__:\n  polluted: 1\n@endyaml");
  preprocessText('!$x = {"__proto__": {"polluted": 1}}\n%set_variable_value("__proto__", 1)');
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
  assert.equal(/** @type {any} */ ({}).x, undefined);
});

test("input size, line and element limits are enforced", async () => {
  await assert.rejects(
    render("A -> B\n".repeat(10), { limits: { maxInputBytes: 20 } }),
    LimitError,
  );
  await assert.rejects(
    render(`@startuml\n${"A -> B\n".repeat(50)}@enduml`, { limits: { maxLines: 10 } }),
    LimitError,
  );
  const classes = Array.from({ length: 30 }, (_, i) => `class C${i}`).join("\n");
  await assert.rejects(
    render(`@startuml\n${classes}\n@enduml`, { limits: { maxNodes: 5 } }),
    LimitError,
  );
  await assert.rejects(
    render("@startuml\nA -> B\n@enduml", { limits: { maxElements: 3 } }),
    LimitError,
  );
});

test("preprocessor output explosion is bounded", () => {
  const bomb = `!$s = "x"\n!$i = 0\n!while $i < 40\n!$s = $s + $s\n!$i = $i + 1\n!endwhile\n$s`;
  assert.throws(() => preprocessText(bomb), LimitError);
});

test("PNG width is clamped", async () => {
  const r = await render("@startuml\nA -> B\n@enduml");
  const svg = await r.toSvg({ embedFont: false });
  const png = svgToPng(svg, { width: 10_000_000 });
  assert.equal(png.readUInt32BE(16), 16_000);
  assert.equal(svgToPng(svg, { width: 1 }).readUInt32BE(16), 16);
});

test("pathological lines parse in linear-ish time", async () => {
  const cases = [
    `@startuml\n${"-".repeat(20_000)}\n@enduml`,
    `@startuml\nA ${"-".repeat(5_000)}> B\n@enduml`,
    `@startuml\nclass ${"<".repeat(10_000)}\n@enduml`,
    `@startebnf\nrule = ${"a ".repeat(5_000)};\n@endebnf`,
    `@startuml\n${'"'.repeat(15_000)}\n@enduml`,
    `@startuml\n${"[".repeat(10_000)}\n@enduml`,
  ];
  for (const src of cases) {
    const start = Date.now();
    await render(src).catch(() => {});
    assert.ok(Date.now() - start < 3000, `took too long for ${src.slice(10, 30)}`);
  }
});

test("!include never touches the file system without a resolver", async () => {
  const r = await render("@startuml\n!include /etc/passwd\nA -> B\n@enduml");
  assert.ok(r.diagnostics.some((d) => /Cannot resolve/.test(d.message)));
  const r2 = await render("@startuml\n!includeurl https://example.com/x.puml\nA -> B\n@enduml");
  assert.ok(r2.diagnostics.some((d) => /not supported/.test(d.message)));
});
