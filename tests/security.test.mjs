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
import { excalidrawToSvg } from "../src/general/render/svg.mjs";

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
    assert.equal(
      /\son\w+\s*=\s*["']?(?:alert|javascript)/i.test(svg),
      false,
      "executable event handler in SVG",
    );
    assert.equal(/href\s*=\s*["']?javascript:/i.test(svg), false, "javascript: URL in href");
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

test("security: SVG output escapes presentation metadata", async () => {
  const payload = `</text><script>alert(1)</script><text>`;
  const doc = await renderPlantUml(`@startuml
title ${payload}
caption ${payload}
legend
  ${payload}
end legend
[A] as a
@enduml`);
  const svg = excalidrawToSvg(doc);

  assert.equal(/<script[\s>]/i.test(svg), false, "raw <script> in presentation SVG");
  assert.equal(/&lt;\/?text/i.test(svg), false, "escaped text tag from presentation payload");
  assert.match(svg, /alert\(1\)/, "presentation text content was lost");
});

test("security: unsafe PlantUML link protocols are not emitted as Excalidraw links", async () => {
  const doc = await renderPlantUml(`@startuml
component "[[javascript:alert(1){bad} Unsafe]]" as unsafe
[A] as a
unsafe --> a : [[javascript:alert(2) Bad edge]]
url of a is [[javascript:alert(3){bad}]]
@enduml`);

  const linked = doc.elements.filter((element) => element.link);
  assert.equal(linked.length, 0);
  assert.ok(doc.elements.some((element) => element.type === "text" && element.text === "Unsafe"));
  assert.ok(
    doc.elements.some(
      (element) => element.type === "text" && element.text.replace(/\s+/g, " ") === "Bad edge",
    ),
  );
});

test("security: unsafe PlantUML sequence style values are ignored", async () => {
  const src = `@startuml
skinparam sequence ArrowColor javascript:alert(1)
skinparam sequence MessageFontColor url(javascript:alert(2))
<style>
sequenceDiagram {
  participant {
    BackgroundColor: url(javascript:alert(3));
    FontColor: #ff0000;
  }
  arrow {
    LineColor: expression(alert(4));
  }
}
</style>
participant Alice
participant Bob
Alice -> Bob : hello
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.equal(diagram.style.arrowColor, "");
  assert.equal(diagram.style.messageFontColor, "");
  assert.equal(diagram.style.participantBackgroundColor, "");
  assert.equal(diagram.style.participantFontColor, "#ff0000");

  const doc = await renderPlantUml(src, { sourceLabel: "unsafe-sequence-style" });
  const json = JSON.stringify(doc);
  assert.equal(/javascript:|expression\(/i.test(json), false);
});

test("security: unsafe PlantUML graph style values are ignored", async () => {
  const src = `@startuml
skinparam componentBackgroundColor url(javascript:alert(1))
skinparam arrowColor expression(alert(2))
<style>
component {
  FontColor: javascript:alert(3);
  LineColor: #ff0000;
}
note {
  BackgroundColor: url(https://example.invalid/x);
}
arrow {
  FontColor: expression(alert(4));
}
</style>
[A] as a
[B] as b
a --> b : go
note right of a : hi
@enduml`;
  const diagram = parsePlantUml(src, { unknownLines: "strict" });
  assert.equal(diagram.style.boxBackgroundColor, "");
  assert.equal(diagram.style.arrowColor, "");
  assert.equal(diagram.style.boxFontColor, "");
  assert.equal(diagram.style.boxBorderColor, "#ff0000");
  assert.equal(diagram.style.noteBackgroundColor, "");
  assert.equal(diagram.style.edgeFontColor, "");

  const doc = await renderPlantUml(src, { sourceLabel: "unsafe-graph-style" });
  const json = JSON.stringify(doc);
  assert.equal(/javascript:|expression\(|url\(/i.test(json), false);
});

test("security: unsafe PlantUML note links are not emitted as Excalidraw links", async () => {
  const doc = await renderPlantUml(`@startuml
[A] as a
note right of a : [[javascript:alert(1){bad} Unsafe note]]
participant Alice
note right of Alice : [[javascript:alert(2){bad} Unsafe sequence note]]
@enduml`);

  assert.equal(doc.elements.filter((element) => element.link).length, 0);
  assert.ok(
    doc.elements.some(
      (element) => element.type === "text" && /Unsafe/.test(element.text.replace(/\s+/g, " ")),
    ),
  );
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

test("security: legacy HTML-like PlantUML text markup degrades without raw tags", async () => {
  const doc = await renderPlantUml(`@startuml
title <script>alert(1)</script><img:https://example.invalid/a.png>
[<b>Safe</b> <script>alert(2)</script>] as a
note right of a : <code>x()</code> <img:file:///etc/passwd>
@enduml`);

  const visibleText = doc.elements
    .filter((element) => element.type === "text")
    .map((element) => element.text)
    .join("\n");

  assert.equal(/<\/?(?:script|img|code|b)\b/i.test(visibleText), false);
  assert.match(visibleText, /Safe/);
  assert.match(visibleText, /alert\(1\)/);
  assert.match(visibleText, /x\(\)/);
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

// ---------------------------------------------------------------------------
// Renderer hardening: render-width bounds
// ---------------------------------------------------------------------------

test("security: svgToPng rejects non-integer / non-positive widths", async () => {
  const { svgToPng } = await import("../src/general/render/png.mjs");
  const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`;
  for (const bad of [0, -1, 1.5, NaN, Infinity, "1000"]) {
    assert.throws(
      () => svgToPng(tinySvg, { width: bad }),
      /width must be a positive integer/,
      `expected throw for width=${bad}`,
    );
  }
});

test("security: svgToPng clamps absurd widths to MAX_PNG_WIDTH", async () => {
  // We don't actually rasterise here (would be slow); we just confirm
  // the bounds-check path doesn't throw for huge values that are still
  // integer-positive — they get clamped instead of blowing up resvg.
  const { svgToPng } = await import("../src/general/render/png.mjs");
  const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>`;
  // 100_000 is far above the 16_000 ceiling — must still succeed.
  const buf = svgToPng(tinySvg, { width: 100_000 });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0);
});

test("security: canvas SVG rejects non-integer widths", async () => {
  const { excalidrawJsonToCanvasSvg } = await import("../src/general/render/canvas_svg.mjs");
  const doc = await renderPlantUml(`@startuml
[a] --> [b]
@enduml`);
  for (const bad of [0, -1, 1.5, NaN]) {
    assert.throws(
      () => excalidrawJsonToCanvasSvg(doc, { width: bad }),
      /width must be a positive integer/,
    );
  }
});

// ---------------------------------------------------------------------------
// CLI hardening: stdin size cap
// ---------------------------------------------------------------------------

test("security: CLI rejects oversized stdin (--max-input-bytes)", async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const cliPath = fileURLToPath(new URL("../bin/excaliplant.mjs", import.meta.url));
  const child = spawn(process.execPath, [cliPath, "--max-input-bytes", "64"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += c;
  });
  // Send more than 64 bytes.
  child.stdin.write("x".repeat(2048));
  child.stdin.end();
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 1, "CLI should exit 1 on oversized input");
  assert.match(stderr, /exceeded 64 bytes/);
});

test("security: CLI rejects out-of-range --width", async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const cliPath = fileURLToPath(new URL("../bin/excaliplant.mjs", import.meta.url));
  const child = spawn(process.execPath, [cliPath, "--width", "1000000"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => {
    stderr += c;
  });
  child.stdin.end();
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 2, "CLI should exit 2 on bad CLI args");
  assert.match(stderr, /--width out of range/);
});

// ---------------------------------------------------------------------------
// canvas_svg background attribute injection
// ---------------------------------------------------------------------------

test("security: canvas SVG escapes attacker-controlled background", async () => {
  const { excalidrawJsonToCanvasSvg } = await import("../src/general/render/canvas_svg.mjs");
  const doc = await renderPlantUml(`@startuml
[a] --> [b]
@enduml`);
  const payload = '" onload="alert(1)';
  const svg = excalidrawJsonToCanvasSvg(doc, { background: payload });
  // The literal payload must NOT appear in the output — escapeAttr must
  // have collapsed the closing quote so the attacker cannot break out
  // of the fill="..." attribute.
  assert.ok(
    !svg.includes('onload="alert(1)'),
    "background injection broke out of the fill attribute",
  );
  assert.ok(svg.includes("&quot;"), "background was not HTML-escaped");
});

test("security: canvas SVG escapes background even on empty diagrams", async () => {
  const { excalidrawJsonToCanvasSvg } = await import("../src/general/render/canvas_svg.mjs");
  const payload = '"><script>alert(1)</script>';
  const svg = excalidrawJsonToCanvasSvg(
    { type: "excalidraw", version: 2, source: "", elements: [], appState: {}, files: {} },
    { background: payload },
  );
  assert.ok(!svg.includes("<script>alert(1)"), "blankCanvas leaked attacker markup");
  // Payload should appear in HTML-escaped form on the rect fill.
  assert.ok(svg.includes("&quot;&gt;&lt;"));
});

// ---------------------------------------------------------------------------
// Parser limits
// ---------------------------------------------------------------------------

test("security: parsePlantUml enforces maxInputBytes", () => {
  const big = "[a] --> [b]\n".repeat(2000);
  assert.throws(() => parsePlantUml(big, { limits: { maxInputBytes: 64 } }), /maxInputBytes/);
});

test("security: parsePlantUml enforces maxLines", () => {
  const lines = Array.from({ length: 500 }, (_, i) => `[a${i}]`).join("\n");
  assert.throws(
    () => parsePlantUml(`@startuml\n${lines}\n@enduml`, { limits: { maxLines: 100 } }),
    /maxLines/,
  );
});

test("security: parsePlantUml enforces maxNodes", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `[a${i}]`).join("\n");
  assert.throws(
    () => parsePlantUml(`@startuml\n${lines}\n@enduml`, { limits: { maxNodes: 10 } }),
    /maxNodes/,
  );
});

test("security: parsePlantUml enforces maxNodes for sequence activations", () => {
  const lines = Array.from({ length: 20 }, () => "activate A").join("\n");
  assert.throws(
    () => parsePlantUml(`@startuml\n${lines}\n@enduml`, { limits: { maxNodes: 10 } }),
    /maxNodes/,
  );
});

test("security: parsePlantUml strict mode reports unknown lines", () => {
  const src = `@startuml\n[a] --> [b]\n¯\\_(ツ)_/¯ banana\n@enduml`;
  assert.throws(() => parsePlantUml(src, { unknownLines: "strict" }), /unknown line/);
});

test("security: unterminated PlantUML block comments do not activate commented text", () => {
  const src = `@startuml
[a]
/' everything below is a comment
¯\\_(ツ)_/¯ banana
[evil] --> [a]
@enduml`;
  const d = parsePlantUml(src, { unknownLines: "strict" });

  assert.ok(d.boxById("a"));
  assert.equal(d.boxById("evil"), null);
  assert.equal(d.connections.length, 0);
});

test("security: data and math diagrams escape attacker-controlled text in SVG", async () => {
  const jsonDoc = await renderPlantUml(`@startjson
{
  "<script>alert(1)</script>": "<img src=x onerror=alert(1)>"
}
@endjson`);
  const yamlDoc = await renderPlantUml(`@startyaml
<script>alert(1)</script>: <img src=x onerror=alert(1)>
@endyaml`);
  const mathDoc = await renderPlantUml(`@startmath
<script>alert(1)</script>
@endmath`);

  for (const doc of [jsonDoc, yamlDoc, mathDoc]) {
    const svg = excalidrawToSvg(doc);
    assert.ok(!svg.includes("<script>alert(1)</script>"));
    assert.ok(!svg.includes("<img src=x onerror=alert(1)>"));
  }
});

test("security: network, salt and archimate diagrams escape attacker-controlled text in SVG", async () => {
  const nwdiagDoc = await renderPlantUml(`@startnwdiag
nwdiag {
  network dmz {
    evil [address = "<script>alert(1)</script>"];
  }
}
@endnwdiag`);
  const saltDoc = await renderPlantUml(`@startsalt
{
  <script>alert(1)</script>
  [<img src=x onerror=alert(1)>]
}
@endsalt`);
  const archimateDoc = await renderPlantUml(`@startuml
archimate #Technology "<script>alert(1)</script>" as evil <<technology-device>>
@enduml`);

  for (const doc of [nwdiagDoc, saltDoc, archimateDoc]) {
    const svg = excalidrawToSvg(doc);
    assert.ok(!svg.includes("<script>alert(1)</script>"));
    assert.ok(!svg.includes("<img src=x onerror=alert(1)>"));
  }
});

test("security: planning, hierarchy and files diagrams escape attacker-controlled text in SVG", async () => {
  const ganttDoc = await renderPlantUml(`@startgantt
[<script>alert(1)</script>] requires 1 day
@endgantt`);
  const mindmapDoc = await renderPlantUml(`@startmindmap
* <script>alert(1)</script>
** <img src=x onerror=alert(1)>
@endmindmap`);
  const wbsDoc = await renderPlantUml(`@startwbs
* <script>alert(1)</script>
** <img src=x onerror=alert(1)>
@endwbs`);
  const chronologyDoc = await renderPlantUml(`@startchronology
[<script>alert(1)</script>] happens on 2024-01-01
@endchronology`);
  const filesDoc = await renderPlantUml(`@startfiles
/src/<script>alert(1)</script>.mjs
/src/<img src=x onerror=alert(1)>.mjs
@endfiles`);

  for (const doc of [ganttDoc, mindmapDoc, wbsDoc, chronologyDoc, filesDoc]) {
    const svg = excalidrawToSvg(doc);
    assert.ok(!svg.includes("<script>alert(1)</script>"));
    assert.ok(!svg.includes("<img src=x onerror=alert(1)>"));
  }
});

// ---------------------------------------------------------------------------
// Parser correctness: Unicode + quoted comments
// ---------------------------------------------------------------------------

test("functional: Unicode identifiers keep their connection edge", async () => {
  const doc = await renderPlantUml(
    `@startuml\n[\u00dcber]\n[\u00d6mega]\n[\u00dcber] --> [\u00d6mega]\n@enduml`,
  );
  const arrows = doc.elements.filter((e) => e.type === "arrow");
  assert.ok(arrows.length >= 1, "Unicode endpoints lost their connection");
});

test("functional: stripComment respects apostrophes inside string literals", () => {
  const src = `@startuml\ncomponent "Bob 's service" as bob\n[client]\nclient --> bob\n@enduml`;
  const d = parsePlantUml(src);
  const planes = d.planes ?? [];
  const titles = planes.flatMap((p) => p.allBoxes.map((b) => b.title));
  assert.ok(
    titles.some((t) => t.includes("Bob 's service")),
    `expected quoted title to survive, got ${JSON.stringify(titles)}`,
  );
});
