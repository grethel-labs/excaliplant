import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bin = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "excaliplant.mjs",
);
const run = (/** @type {string[]} */ args, /** @type {string} */ input = "") =>
  spawnSync(process.execPath, [bin, ...args], { input, encoding: "utf8" });

test("renders stdin to Excalidraw JSON on stdout", () => {
  const r = run([], "A -> B : hi");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).type, "excalidraw");
});

test("writes SVG and PNG files by extension", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "excaliplant-"));
  const input = path.join(dir, "d.puml");
  writeFileSync(input, "@startuml\nclass A\n@enduml");
  assert.equal(run([input, "-o", path.join(dir, "d.svg")]).status, 0);
  assert.match(readFileSync(path.join(dir, "d.svg"), "utf8"), /^<svg/);
  assert.equal(
    run([input, "-o", path.join(dir, "d.png"), "--width", "300", "--theme", "dark", "--clean"])
      .status,
    0,
  );
  assert.equal(readFileSync(path.join(dir, "d.png")).readUInt32BE(16), 300);
});

test("--all writes numbered files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "excaliplant-"));
  const input = path.join(dir, "multi.puml");
  writeFileSync(input, "@startuml\nA -> B\n@enduml\n@startuml\nC -> D\n@enduml");
  assert.equal(run([input, "--all", "-o", path.join(dir, "out-{n}.svg")]).status, 0);
  assert.match(readFileSync(path.join(dir, "out-2.svg"), "utf8"), /<svg/);
});

test("--include-dir allows includes only below the directory", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "excaliplant-"));
  mkdirSync(path.join(dir, "lib"));
  writeFileSync(path.join(dir, "lib", "parts.puml"), "class Included");
  writeFileSync(path.join(dir, "secret.puml"), "class Secret");
  const src = "@startuml\n!include parts.puml\n!include ../secret.puml\n@enduml";
  const r = run(["--include-dir", path.join(dir, "lib")], src);
  assert.equal(r.status, 0, r.stderr);
  const texts = JSON.parse(r.stdout)
    .elements.map((/** @type {any} */ e) => e.text)
    .filter(Boolean);
  assert.ok(texts.includes("Included"));
  assert.ok(!texts.includes("Secret"));
  assert.match(r.stderr, /Cannot resolve/);
});

test("a directory discovers complete entries and resolves nested includes relative to each file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "excaliplant-project-"));
  mkdirSync(path.join(root, "parts"));
  writeFileSync(path.join(root, "main.puml"), "@startuml\n!include parts/api.iuml\n@enduml");
  writeFileSync(path.join(root, "parts", "api.iuml"), "class Api\n!include storage.puml");
  writeFileSync(path.join(root, "parts", "storage.puml"), "@startuml\nclass Storage\n@enduml");
  writeFileSync(path.join(root, "storage.puml"), "class WrongStorage");
  const render = run([root]);
  assert.equal(render.status, 0, render.stderr);
  assert.match(render.stdout, /"text": "Api"/);
  assert.match(render.stdout, /"text": "Storage"/);
  assert.doesNotMatch(render.stdout, /WrongStorage/);

  writeFileSync(path.join(root, "another.puml"), "@startuml\nClient -> Server\n@enduml");
  const ambiguous = run(["--project", root]);
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /Several PlantUML entries found: "another\.puml", "main\.puml"/);
  assert.equal(run(["--project", root, "main.puml"]).status, 0);
  const selection = run(["--project", root, "main.puml", "parts/storage.puml"]);
  assert.equal(selection.status, 0, selection.stderr);
  assert.match(selection.stdout, /"text": "Storage"/);
});

test("project errors name the importer and target while other entries still render", () => {
  const root = mkdtempSync(path.join(tmpdir(), "excaliplant-project-"));
  mkdirSync(path.join(root, "parts"));
  writeFileSync(path.join(root, "bad.puml"), "@startuml\n!include parts/api.iuml\n@enduml");
  writeFileSync(path.join(root, "good.puml"), "@startuml\nclass Independent\n@enduml");
  const api = path.join(root, "parts", "api.iuml");
  writeFileSync(api, "!include absent.iuml");
  const missing = run(["--project", root, "--all"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Cannot resolve !include "absent\.iuml" from "parts\/api\.iuml"/);
  assert.match(missing.stdout, /"text": "Independent"/);

  writeFileSync(api, "!include ../bad.puml");
  const cycle = run(["--project", root, "--all"]);
  assert.equal(cycle.status, 1);
  assert.match(cycle.stderr, /Include cycle from "parts\/api\.iuml" targeting "\.\.\/bad\.puml"/);
  assert.match(cycle.stdout, /"text": "Independent"/);
});

test("Markdown embeds relative PlantUML sources and rerenders changed dependencies", () => {
  const root = mkdtempSync(path.join(tmpdir(), "excaliplant-project-"));
  const docs = path.join(root, "docs");
  const parts = path.join(docs, "parts");
  mkdirSync(parts, { recursive: true });
  const file = path.join(docs, "README.md");
  const fragment = path.join(parts, "detail.iuml");
  writeFileSync(
    file,
    '# Flows\n\n~~~plantuml {src="main.puml"}\n~~~\n\n~~~plantuml\n!include parts/detail.iuml\n~~~\n',
  );
  writeFileSync(path.join(docs, "main.puml"), "@startuml\n!include parts/api.iuml\n@enduml");
  writeFileSync(path.join(parts, "api.iuml"), "class Api\n!include detail.iuml");
  writeFileSync(fragment, "class Original");
  const args = ["markdown", file, "--include-dir", root, "--mode", "file"];
  const first = run([...args, "--in-place"]);
  assert.equal(first.status, 0, first.stderr);
  const markdown = readFileSync(file, "utf8");
  assert.match(markdown, /src="main\.puml"/);
  const links = [...markdown.matchAll(/\]\((assets\/[a-f\d]+\.svg)\)/g)].map((match) => match[1]);
  assert.equal(links.length, 2);
  assert.match(readFileSync(path.join(docs, links[0]), "utf8"), /Original/);
  assert.match(readFileSync(path.join(docs, links[1]), "utf8"), /Original/);
  assert.equal(run([...args, "--check"]).status, 0);

  writeFileSync(fragment, "class Changed");
  assert.equal(run([...args, "--check"]).status, 1);
  assert.equal(run([...args, "--in-place"]).status, 0);
  const updated = readFileSync(file, "utf8");
  assert.ok(links.every((link) => !updated.includes(link)));
  assert.equal(run([...args, "--check"]).status, 0);
});

test("Markdown leaves a failed reference intact and renders independent fences", () => {
  const root = mkdtempSync(path.join(tmpdir(), "excaliplant-project-"));
  const file = path.join(root, "README.md");
  const failed = '~~~plantuml {src="missing.puml"}\n~~~';
  writeFileSync(file, `${failed}\n\n~~~plantuml\nAlice -> Bob\n~~~\n`);
  const render = run(["markdown", file, "--include-dir", root, "--in-place"]);
  assert.equal(render.status, 1);
  assert.match(render.stderr, /Cannot resolve PlantUML source "missing\.puml"/);
  const markdown = readFileSync(file, "utf8");
  assert.ok(markdown.startsWith(failed));
  assert.match(markdown, /<svg/);
  assert.match(markdown, /@font-face/);
});

test("reports errors with a non-zero exit code", () => {
  const r = run(["--strict"], "@startuml\nclass A\n???\n@enduml");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unrecognised syntax/);
  assert.equal(run(["--bogus"]).status, 1);
  assert.match(run(["--list-types"]).stdout, /sequence/);
  assert.match(run(["--help"]).stdout, /Usage/);
});
