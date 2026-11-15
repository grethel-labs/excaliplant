import { test } from "node:test";
import assert from "node:assert/strict";
import { preprocessText } from "../src/index.mjs";
import { LimitError, ParseError } from "../src/core/errors.mjs";

const pp = (/** @type {string} */ s, /** @type {any} */ o) =>
  preprocessText(s, o)
    .split("\n")
    .filter((l) => l.trim())
    .join("\n");

test("variables, expressions and string concatenation", () => {
  assert.equal(pp(`!$a = 2\n!$b = $a * 3 + 1\n!$s = "x" + $b\nvalue $b $s`), "value 7 x7");
});

test("conditionals with elseif/else and ifdef", () => {
  const src = `!$n = 5
!if $n > 10
big
!elseif $n > 3
medium
!else
small
!endif
!ifdef $n
defined
!endif
!ifndef $missing
missing
!endif`;
  assert.equal(pp(src), "medium\ndefined\nmissing");
});

test("while and foreach loops", () => {
  assert.equal(
    pp(`!$i = 0\n!while $i < 3\nrow $i\n!$i = $i + 1\n!endwhile`),
    "row 0\nrow 1\nrow 2",
  );
  assert.equal(pp(`!foreach $x in ["a", "b"]\nitem $x\n!endfor`), "item a\nitem b");
});

test("procedures with default and keyword arguments", () => {
  const src = `!procedure $box($name, $color="red")
rectangle $name #$color
!endprocedure
$box("A")
$box("B", $color="blue")`;
  assert.equal(pp(src), "rectangle A #red\nrectangle B #blue");
});

test("functions, one-line functions and builtins", () => {
  const src = `!function $twice($x)
!return $x * 2
!endfunction
!function $inc($x) !return $x + 1
v $twice($inc(2)) %upper("ab") %strlen("abcd") %substr("hello", 1, 3)`;
  assert.equal(pp(src), "v 6 AB 4 ell");
});

test("legacy !define macros with arguments", () => {
  assert.equal(pp(`!define GREET(name) Hello name!\nGREET(World)`), "Hello World!");
});

test("JSON variables and member access", () => {
  assert.equal(
    pp(`!$cfg = { "name": "api", "ports": [80, 443] }\nservice $cfg.name on $cfg.ports[1]`),
    "service api on 443",
  );
});

test("!include uses the resolver and supports !includesub", () => {
  const files = { "lib.puml": "@startuml\n!startsub A\nfrom A\n!endsub\nnot shared\n@enduml" };
  const include = (/** @type {string} */ name) =>
    files[/** @type {keyof typeof files} */ (name)] ?? null;
  assert.equal(pp(`!includesub lib.puml!A`, { include }), "from A");
  assert.equal(pp(`!include lib.puml`, { include }), "from A\nnot shared");
});

test("bundled C4 stdlib expands to component syntax", () => {
  const out = pp(
    `!include <C4/C4_Container>\nContainer(api, "API", "Go", "desc")\nRel(api, db, "reads")`,
  );
  assert.match(out, /rectangle ".*API.*" <<c4>> as api/);
  assert.match(out, /api --> db : "reads"/);
});

test("!assert fails with a ParseError", () => {
  assert.throws(() => pp(`!assert 1 == 2 : nope`), ParseError);
});

test("infinite loops are stopped by limits", () => {
  assert.throws(() => pp(`!$i = 0\n!while 1\n!$i = $i + 1\n!endwhile`), LimitError);
  assert.throws(() => pp(`!procedure $r()\n$r()\n!endprocedure\n$r()`), LimitError);
});

test("%date is deterministic unless a date is provided", () => {
  assert.equal(pp(`d=%date("yyyy")`), "d=");
  assert.equal(
    pp(`d=%date("yyyy-MM-dd")`, { date: new Date(Date.UTC(2026, 0, 2)) }),
    "d=2026-01-02",
  );
});
