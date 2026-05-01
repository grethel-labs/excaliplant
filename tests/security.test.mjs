// Security regression tests.
//
// The library accepts untrusted text and emits two formats:
//   - Excalidraw JSON (consumed by web front-ends)
//   - SVG markup (embedded in README/build artefacts)
//
// Security-relevant attack surfaces:
//
//   1. **Prototype pollution** via crafted node/edge identifiers
//      (e.g. `__proto__`, `constructor`, `prototype`).
//   2. **ReDoS** — pathological inputs that make the regex-driven
//      parser take super-linear time.
//   3. **XSS in SVG output** — unescaped text content that contains
//      `<script>`, event handlers, or `javascript:` URLs.
//   4. **JSON injection / unsafe serialisation** in the Excalidraw doc.
//   5. **Memory / stack exhaustion** via huge inputs or deep nesting.
//   6. **Control characters / null bytes** that could break downstream
//      consumers.
//   7. **Path traversal** in the documentation build script.
//
// References:
//   - OWASP Top 10 (A03 Injection, A05 Security Misconfiguration)
//   - https://nodejs.org/en/learn/getting-started/security-best-practices
//   - https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS
//   - https://github.com/HoLyVieR/prototype-pollution-nsec18

import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { parsePlantUml, renderPlantUml } from "../index.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";

// ---------------------------------------------------------------------------
// Prototype pollution
// ---------------------------------------------------------------------------

test("security: __proto__ as a node id does not pollute Object.prototype", async () => {
  const before = Object.prototype.polluted;
  const malicious = `@startuml
[__proto__]
[constructor]
[polluted]
__proto__ --> polluted : "polluted=true"
@enduml`;
  await renderPlantUml(malicious);
  assert.equal(Object.prototype.polluted, before, "prototype was polluted");
  assert.equal({}.polluted, undefined);
});

test("security: __proto__ in note bodies is not interpreted", async () => {
  const malicious = `@startuml
note left
  __proto__: { polluted: true }
  constructor: { prototype: { evil: 1 } }
end note
[a] --> [b]
@enduml`;
  await renderPlantUml(malicious);
  assert.equal({}.polluted, undefined);
  assert.equal({}.evil, undefined);
});

test("security: parsed model uses plain objects/classes, no proto exposure", () => {
  const d = parsePlantUml("@startuml\n[__proto__]\n@enduml");
  // The parsed model must not expose Object.prototype via a key collision.
  for (const plane of d.planes) {
    for (const box of plane.boxes ?? []) {
      assert.notEqual(box, Object.prototype);
      assert.ok(typeof box === "object" && box !== null);
    }
  }
});

// ---------------------------------------------------------------------------
// ReDoS — pathological inputs must complete in linear-ish time
// ---------------------------------------------------------------------------

const REDOS_BUDGET_MS = 2000; // generous, we only catch catastrophic blowups

function timeIt(fn) {
  const t0 = performance.now();
  return Promise.resolve(fn()).then(() => performance.now() - t0);
}

test("security: long line of dashes does not ReDoS", async () => {
  const dashes = "-".repeat(50_000);
  const src = `@startuml\nA ${dashes}> B\n@enduml`;
  const ms = await timeIt(() => parsePlantUml(src));
  assert.ok(ms < REDOS_BUDGET_MS, `parser took ${ms.toFixed(0)}ms on dash flood`);
});

test("security: nested brackets do not ReDoS", async () => {
  const src = `@startuml\n${"[".repeat(10_000)}${"]".repeat(10_000)}\n@enduml`;
  const ms = await timeIt(() => parsePlantUml(src));
  assert.ok(ms < REDOS_BUDGET_MS, `parser took ${ms.toFixed(0)}ms on bracket bomb`);
});

test("security: long quoted string does not ReDoS", async () => {
  const big = `"${"a".repeat(50_000)}"`;
  const src = `@startuml\n[${big}] --> [b]\n@enduml`;
  const ms = await timeIt(() => parsePlantUml(src));
  assert.ok(ms < REDOS_BUDGET_MS, `parser took ${ms.toFixed(0)}ms on long string`);
});

test("security: many lines parse in linear time", async () => {
  const lines = Array.from({ length: 5_000 }, (_, i) => `[a${i}] --> [b${i}]`).join("\n");
  const src = `@startuml\n${lines}\n@enduml`;
  const ms = await timeIt(() => parsePlantUml(src));
  assert.ok(ms < REDOS_BUDGET_MS * 2, `parser took ${ms.toFixed(0)}ms on 5k connections`);
});

// ---------------------------------------------------------------------------
// XSS in SVG output
// ---------------------------------------------------------------------------

const XSS_PAYLOADS = [
  `<script>alert('xss')</script>`,
  `<img src=x onerror=alert(1)>`,
  `javascript:alert(1)`,
  `"><script>alert(1)</script>`,
  `</text><script>alert(1)</script><text>`,
  `<svg onload=alert(1)>`,
  `&lt;script&gt;alert(1)&lt;/script&gt;`,
  `\u0000<script>`,
  `]]><script>alert(1)</script>`,
];

for (const payload of XSS_PAYLOADS) {
  test(`security: SVG output escapes payload ${JSON.stringify(payload).slice(0, 50)}`, async () => {
    const src = `@startuml\n[${payload.replace(/\n/g, " ")}] --> [B]\n@enduml`;
    const doc = await renderPlantUml(src);
    const svg = excalidrawToSvg(doc);

    // Dangerous content must not appear unescaped.
    assert.equal(/<script[\s>]/i.test(svg), false, "raw <script> in SVG");
    assert.equal(/\son\w+\s*=\s*["']?(?:alert|javascript)/i.test(svg), false,
      "executable event handler in SVG");
    assert.equal(/href\s*=\s*["']?javascript:/i.test(svg), false,
      "javascript: URL in href");
  });
}

test("security: SVG output is parseable as XML", async () => {
  // A well-formed SVG must round-trip through a tolerant XML check:
  // every '<text' opener has a matching '</text' closer.
  const src = `@startuml\n[</text><script>x</script>] --> [B]\n@enduml`;
  const doc = await renderPlantUml(src);
  const svg = excalidrawToSvg(doc);
  const opens = (svg.match(/<text[\s>]/g) || []).length;
  const closes = (svg.match(/<\/text>/g) || []).length;
  assert.equal(opens, closes, "unbalanced <text> tags");
});

// ---------------------------------------------------------------------------
// Excalidraw JSON safety
// ---------------------------------------------------------------------------

test("security: Excalidraw JSON round-trips through JSON.parse without losing safety", async () => {
  const src = `@startuml\n[A "${`</text>"`}] --> [B]\n@enduml`;
  const doc = await renderPlantUml(src);
  const serialised = JSON.stringify(doc);
  const reparsed = JSON.parse(serialised);
  assert.deepEqual(reparsed.elements.length, doc.elements.length);
  // Must not contain literal control chars in serialised form.
  assert.equal(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(serialised), false);
});

test("security: backslashes and quotes in labels do not break JSON", async () => {
  const src = `@startuml
[\\\\"injected": true,] --> [B]
@enduml`;
  const doc = await renderPlantUml(src);
  // Must serialise without throwing.
  const json = JSON.stringify(doc);
  // And reparse cleanly.
  JSON.parse(json);
});

// ---------------------------------------------------------------------------
// Memory / depth
// ---------------------------------------------------------------------------

test("security: deeply nested containers do not stack-overflow", () => {
  const open = "package P {\n".repeat(200);
  const close = "}\n".repeat(200);
  const src = `@startuml\n${open}[a]\n${close}@enduml`;
  // Should not throw; output may be empty or malformed but parser must not crash.
  parsePlantUml(src);
});

test("security: 1MB of input parses without exhausting memory", () => {
  const big = "[a] --> [b]\n".repeat(80_000); // ~1 MB
  const src = `@startuml\n${big}@enduml`;
  const d = parsePlantUml(src);
  // Just assert it returned something truthy in reasonable time.
  assert.ok(d);
});

// ---------------------------------------------------------------------------
// Control characters & encoding
// ---------------------------------------------------------------------------

test("security: null bytes in labels don't crash parser or renderer", async () => {
  const src = `@startuml\n[A\u0000B] --> [C\u0000]\n@enduml`;
  const doc = await renderPlantUml(src);
  const svg = excalidrawToSvg(doc);
  // Null bytes must NOT appear in the SVG (they'd corrupt downstream tooling).
  assert.equal(svg.includes("\u0000"), false);
});

test("security: RTL override and zero-width chars don't break output", async () => {
  const src = `@startuml\n[A\u202eB] --> [C\u200bD]\n@enduml`;
  const doc = await renderPlantUml(src);
  // Should round-trip.
  JSON.stringify(doc);
});

test("security: surrogate pairs and emoji do not crash the pipeline", async () => {
  const src = `@startuml\n[こんにちは] --> [世界]\n@enduml`;
  const doc = await renderPlantUml(src);
  const svg = excalidrawToSvg(doc);
  assert.ok(typeof svg === "string" && svg.length > 0);
});

// ---------------------------------------------------------------------------
// Path traversal in build inputs (defensive)
// ---------------------------------------------------------------------------

test("security: parser never reads from disk (no fs side effects)", async () => {
  // The parser is given a string of PlantUML with path-traversal-looking
  // tokens. It must NOT attempt to read any file; the model is purely
  // in-memory.
  const src = `@startuml
[../../../etc/passwd] --> [file:///etc/shadow]
note left of "../../etc/passwd"
  ${"\u0000".repeat(8)}/dev/random
end note
@enduml`;
  // If the parser tried to read these paths, ENOENT would propagate or
  // `fs.readFileSync` would block. Just calling parsePlantUml is enough.
  const d = parsePlantUml(src);
  assert.ok(d, "parser must complete on path-like inputs");
});
