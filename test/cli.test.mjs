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

test("reports errors with a non-zero exit code", () => {
  const r = run(["--strict"], "@startuml\nclass A\n???\n@enduml");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unrecognised syntax/);
  assert.equal(run(["--bogus"]).status, 1);
  assert.match(run(["--list-types"]).stdout, /sequence/);
  assert.match(run(["--help"]).stdout, /Usage/);
});
