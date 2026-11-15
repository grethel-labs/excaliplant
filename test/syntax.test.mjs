import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, parseColorSpec } from "../src/syntax/color.mjs";
import { parseCreole, plainText } from "../src/syntax/creole.mjs";
import { parseLink, headsOf } from "../src/syntax/arrows.mjs";
import { unescapeLabel, takeStereotypes } from "../src/syntax/text.mjs";
import { extractBlocks, stripComments, splitPages } from "../src/core/source.mjs";
import { textWidth, layoutText } from "../src/layout/measure.mjs";

test("colours: names, hex forms, gradients, transparent", () => {
  assert.equal(parseColor("Red"), "#ff0000");
  assert.equal(parseColor("#abc"), "#aabbcc");
  assert.equal(parseColor("#11223344"), "#11223344");
  assert.equal(parseColor("#red/blue"), "#ff0000");
  assert.equal(parseColor("transparent"), "transparent");
  assert.equal(parseColor("javascript:alert(1)"), null);
});

test("colour specifications", () => {
  assert.deepEqual(parseColorSpec("#pink;line:red;line.dashed;text:blue"), {
    fill: "#ffc0cb",
    stroke: "#ff0000",
    strokeStyle: "dashed",
    text: "#0000ff",
  });
  assert.deepEqual(parseColorSpec("##[dotted]green"), { strokeStyle: "dotted", stroke: "#008000" });
});

test("creole inline styles, lists, tables and links", () => {
  const rich = parseCreole(
    '**bold** //it// ""mono"" --strike--\n* item\n# one\n|= A |= B |\n| 1 | 2 |\n[[https://x.y Label]]',
  );
  const [first, bullet, numbered, table, link] = rich.blocks;
  assert.deepEqual(
    first.runs
      .filter((r) => r.text.trim())
      .map((r) => [r.text, !!r.bold, !!r.italic, !!r.mono, !!r.strike]),
    [
      ["bold", true, false, false, false],
      ["it", false, true, false, false],
      ["mono", false, false, true, false],
      ["strike", false, false, false, true],
    ],
  );
  assert.equal(bullet.kind, "bullet");
  assert.equal(numbered.kind, "numbered");
  assert.equal(table.kind, "table");
  assert.equal(table.rows?.length, 2);
  assert.equal(link.runs[0].link, "https://x.y");
  assert.equal(parseCreole("[[javascript:alert(1) x]]").blocks[0].runs[0].link, "");
  assert.equal(plainText(parseCreole("<b>a</b> <color:red>b</color>")), "a b");
});

test("creole does not mistake URLs or arrows for markup", () => {
  assert.equal(
    plainText(parseCreole("see http://example.com/a//b")),
    "see http://example.com/a//b",
  );
  assert.equal(plainText(parseCreole("a --> b")), "a --> b");
});

test("link grammar: heads, styles, directions, multiplicities", () => {
  const l = /** @type {NonNullable<ReturnType<typeof parseLink>>} */ (
    parseLink('A "1" *-[#red,dashed]up- "many" B : has >')
  );
  assert.equal(l.from, "A");
  assert.equal(l.to, "B");
  assert.equal(l.fromLabel, "1");
  assert.equal(l.toLabel, "many");
  assert.equal(l.arrow.direction, "up");
  assert.equal(l.arrow.lineStyle, "dashed");
  assert.equal(l.arrow.color, "#ff0000");
  assert.deepEqual(headsOf(l.arrow), { start: "diamond", end: null });
  assert.deepEqual(headsOf(/** @type {any} */ (parseLink("A }|..o{ B")).arrow), {
    start: "crowfoot_one_or_many",
    end: "zero_many",
  });
  assert.equal(parseLink("my-service --> db")?.from, "my-service");
  assert.equal(parseLink("just text"), null);
});

test("label escapes and stereotypes", () => {
  assert.equal(unescapeLabel("a\\nb%n()c<br>d"), "a\nb\nc\nd");
  assert.deepEqual(takeStereotypes("Foo <<entity>> <<(S,#red) Single>>"), {
    rest: "Foo",
    stereotypes: ["entity", "(S,#red) Single"],
  });
});

test("source blocks, comments and pages", () => {
  const blocks = extractBlocks("junk\n@startuml first\nA -> B\n@enduml\n@startjson\n{}\n@endjson");
  assert.deepEqual(
    blocks.map((b) => [b.type, b.name]),
    [
      ["uml", "first"],
      ["json", null],
    ],
  );
  const lines = stripComments(
    [" ' comment", "keep /' inline '/ this", "/' multi", "line '/ after"].map((t, i) => ({
      text: t,
      line: i + 1,
    })),
  );
  assert.deepEqual(
    lines.map((l) => l.text),
    ["keep  this", " after"],
  );
  assert.equal(splitPages(["a", "newpage", "b"].map((t, i) => ({ text: t, line: i }))).length, 2);
});

test("text measurement uses font metrics", () => {
  assert.ok(textWidth("WWW", 16) > textWidth("iii", 16));
  assert.equal(textWidth("", 16), 0);
  const laid = layoutText("one\ntwo", { fontSize: 16 });
  assert.equal(laid.height, 2 * 16 * 1.25);
});
