// @startuml is shared by many diagram types; these snippets pin down the
// detection heuristics for typical (and ambiguous) inputs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { score } from "../src/diagrams/detect.mjs";
import { detectKind } from "../src/index.mjs";

const cases = /** @type {[string, string][]} */ ([
  ["sequence", "Alice -> Bob : hello\nBob --> Alice : hi"],
  ["sequence", "participant A\nA -> A : self"],
  ["sequence", "actor User\nUser -> System : login"],
  ["class", "class Foo\nFoo <|-- Bar"],
  ["class", "interface Shape\nabstract class Base"],
  ["class", "entity User {\n * id\n}\nUser ||--o{ Order"],
  ["object", "object obj\nobj : x = 1"],
  ["usecase", "actor Guest\n(Browse) as B\nGuest --> B"],
  ["component", "[Web] --> [API]"],
  ["deployment", "node Server\ndatabase DB\nServer --> DB"],
  ["state", "[*] --> Idle\nIdle --> Busy : go"],
  ["activity", "start\n:step;\nstop"],
  ["legacy-activity", '(*) --> "First"\n"First" --> (*)'],
  ["timing", "robust A\n@0\nA is on"],
  ["gantt", "[Task] lasts 3 days"],
  ["archimate", "archimate #Business Actor <<business-actor>>"],
  ["salt", "salt\n{\n[OK]\n}"],
  ["nwdiag", "nwdiag {\n network n { a; }\n}"],
  ["ditaa", "ditaa\n+--+\n|  |\n+--+"],
]);

for (const [kind, body] of cases) {
  test(`detects ${kind}: ${body.split("\n")[0]}`, () => {
    assert.equal(detectKind(`@startuml\n${body}\n@enduml`), kind);
  });
}

test("dedicated start keywords pick their module directly", () => {
  assert.equal(detectKind("@startmindmap\n* a\n@endmindmap"), "mindmap");
  assert.equal(detectKind('@startjson\n{"a": 1}\n@endjson'), "json");
  assert.equal(detectKind("@startregex\na+\n@endregex"), "regex");
});

test("bare snippets without @start default to @startuml", () => {
  assert.equal(detectKind("A -> B"), "sequence");
});

test("unknown start keywords raise a clear error", () => {
  assert.throws(() => detectKind("@startfoo\nx\n@endfoo"), /Unsupported diagram type/);
});
test("detection scores only the first 400 lines and 500 characters per trimmed line", () => {
  const detector = [[/x$/, 1]];
  assert.equal(score([{ text: `  ${"a".repeat(499)}x tail`, line: 1 }], detector), 1);
  assert.equal(score([{ text: `${"a".repeat(500)}x`, line: 1 }], detector), 0);
  const lines = Array.from({ length: 401 }, (_, i) => ({ text: "x", line: i + 1 }));
  assert.equal(score(lines, detector), 400);
});
