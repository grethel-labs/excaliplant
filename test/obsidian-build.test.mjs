// Build tests for the Obsidian plugin. The release script itself is checked
// without esbuild; everything that needs a bundle skips cleanly when
// integrations/obsidian has no node_modules (the root `npm test` never
// installs esbuild).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as obsidianMock from "./obsidian_mock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(root, "integrations", "obsidian");
const script = path.join(root, "scripts", "build-obsidian.mjs");
const { parseArgs, buildVersions } = await import(pathToFileURL(script).href);
const { bundle, loadEsbuild } = await import(pathToFileURL(path.join(pluginDir, "build.mjs")).href);
const haveEsbuild = (await loadEsbuild()) !== null;
const skip = haveEsbuild ? false : "esbuild is not installed in integrations/obsidian (npm ci)";

const tmp = mkdtempSync(path.join(os.tmpdir(), "excaliplant-obsidian-"));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

function treeDigest() {
  const h = createHash("sha256");
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (e.name === "node_modules" || e.name === "main.js") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(p).update(readFileSync(p));
    }
  };
  walk(pluginDir);
  return h.digest("hex");
}

const run = (...args) =>
  spawnSync(process.execPath, [script, ...args], { encoding: "utf8", cwd: tmp });

// --- no esbuild needed ---

test("parseArgs accepts x.y.z only", () => {
  const ok = parseArgs(["--version", "1.2.3", "--out", "dist"]);
  assert.equal(ok.version, "1.2.3");
  assert.equal(ok.repoFiles, false);
  assert.ok(path.isAbsolute(ok.out));
  for (const bad of ["v1.2.3", "1.2", "1.2.3-rc.1", "01.2.3", ""]) {
    assert.throws(() => parseArgs(["--version", bad, "--out", "x"]), /--version must be/, bad);
  }
  assert.throws(() => parseArgs(["--version", "1.0.0"]), /--out is required/);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
  assert.throws(() => parseArgs(["--out"]), /needs a value/);
});

test("buildVersions adds the release, sorts and drops the placeholder", () => {
  assert.deepEqual(buildVersions({}, "1.0.0", "1.5.7"), { "1.0.0": "1.5.7" });
  assert.deepEqual(
    buildVersions({ "0.0.0": "1.0.0", "1.10.0": "1.6.0", "1.2.0": "1.5.7" }, "1.9.0", "1.6.0"),
    {
      "1.2.0": "1.5.7",
      "1.9.0": "1.6.0",
      "1.10.0": "1.6.0",
    },
  );
  assert.deepEqual(buildVersions({ "1.0.0": "1.0.0" }, "1.0.0", "1.5.7"), { "1.0.0": "1.5.7" });
  assert.throws(() => buildVersions([], "1.0.0", "1.5.7"), /JSON object/);
});

test("the script rejects bad arguments with exit code 2", () => {
  const r = run("--version", "v1.2.3", "--out", path.join(tmp, "nope"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--version must be/);
});

// --- needs esbuild ---

test("release files are built, versioned and reproducible", { skip }, () => {
  const before = treeDigest();
  const a = path.join(tmp, "a");
  const b = path.join(tmp, "b");
  const r = run("--version", "1.2.3", "--out", a, "--repo-files");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(run("--version", "1.2.3", "--out", b).status, 0);
  assert.equal(treeDigest(), before, "the source tree is not modified");

  assert.deepEqual(readdirSync(b).sort(), [
    "main.js",
    "manifest.json",
    "styles.css",
    "versions.json",
  ]);
  assert.deepEqual(readdirSync(a).sort(), [
    "Excalifont-OFL.txt",
    "LICENSE",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "main.js",
    "manifest.json",
    "styles.css",
    "versions.json",
  ]);
  for (const f of readdirSync(b)) {
    assert.deepEqual(
      readFileSync(path.join(a, f)),
      readFileSync(path.join(b, f)),
      `${f} is reproducible`,
    );
  }
  const manifest = JSON.parse(readFileSync(path.join(a, "manifest.json"), "utf8"));
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.id, "excaliplant");
  assert.deepEqual(JSON.parse(readFileSync(path.join(a, "versions.json"), "utf8")), {
    "1.2.3": manifest.minAppVersion,
  });
  assert.match(r.stdout, /main\.js\s+\d+ bytes/);
});

test("--base-versions extends the history of an existing release", { skip }, () => {
  const base = path.join(tmp, "base.json");
  writeFileSync(base, JSON.stringify({ "1.0.0": "1.4.0" }));
  const out = path.join(tmp, "c");
  assert.equal(run("--version", "1.1.0", "--out", out, "--base-versions", base).status, 0);
  const v = JSON.parse(readFileSync(path.join(out, "versions.json"), "utf8"));
  assert.deepEqual(Object.keys(v), ["1.0.0", "1.1.0"]);
  assert.equal(v["1.0.0"], "1.4.0");
});

test("a missing --base-versions file starts an empty history", { skip }, () => {
  const out = path.join(tmp, "d");
  assert.equal(
    run("--version", "2.0.0", "--out", out, "--base-versions", path.join(tmp, "absent.json"))
      .status,
    0,
  );
  assert.deepEqual(JSON.parse(readFileSync(path.join(out, "versions.json"), "utf8")), {
    "2.0.0": JSON.parse(readFileSync(path.join(pluginDir, "manifest.json"), "utf8")).minAppVersion,
  });
});

let built;
async function bundleText() {
  built ??= (await bundle({ version: "9.9.9" })).text;
  return built;
}

test("the bundle needs no Node built-in and no forbidden API", { skip }, async () => {
  const code = await bundleText();
  const requires = [...code.matchAll(/\brequire\(\s*"([^"]*)"\s*\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(requires)], ["obsidian"], "only Obsidian is required");
  assert.ok(!/\brequire\(\s*[^")\s]/.test(code), "no dynamic require");
  assert.ok(!/\bimport\(/.test(code), "no dynamic import");
  // Method definitions such as `eval(a,d){` (the PlantUML expression evaluator) are fine.
  const noMethods = code.replace(/[;{},]eval\((\w+,?)*\)\{/g, "");
  const forbidden = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /(^|[^.\w$])eval\s*\(/,
    /\bnew Function\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bsendBeacon\b/,
    /\bprocess\.(env|versions|platform|cwd|nextTick)\b/,
    /\bBuffer\./,
    /resvg/i,
  ];
  for (const re of forbidden) assert.ok(!re.test(noMethods), `bundle matches ${re}`);
  assert.ok(code.startsWith("/*\nExcaliplant for Obsidian"));
  assert.ok(code.length < 4_000_000, `bundle size ${code.length}`);
});

test("the bundle renders diagrams in a browser-like sandbox without Node", { skip }, async () => {
  const code = await bundleText();
  const { doc } = obsidianMock.installDom();
  const sandbox = {
    module: { exports: {} },
    require: (id) => {
      if (id !== "obsidian") throw new Error(`unexpected require("${id}")`);
      return obsidianMock;
    },
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    URL,
    document: doc,
    DOMParser: obsidianMock.FakeDOMParser,
    navigator: globalThis.navigator,
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  // Browsers expose the global object as `window` and `self`.
  const global = vm.runInContext("globalThis", sandbox);
  sandbox.window = global;
  sandbox.self = global;
  assert.equal(vm.runInContext("typeof process + typeof Buffer", sandbox), "undefinedundefined");
  new vm.Script(code, { filename: "main.js" }).runInContext(sandbox);
  const Plugin = sandbox.module.exports.default;
  const plugin = new Plugin(obsidianMock.createApp(), { id: "excaliplant" });
  await plugin.onload();

  const el = new obsidianMock.FakeElement("div", doc);
  await plugin.processors.get("plantuml")(
    "@startuml\nclass A\nclass B\nA --> B\n@enduml",
    el,
    obsidianMock.createContext(),
  );
  const svg = el.find("excaliplant").children[0].svgText;
  assert.match(svg, /^<svg /);
  assert.match(svg, /@font-face\{font-family:"Excalifont";src:url\(data:font\/woff2;base64,/);
  assert.ok(svg.length > 10_000);

  const seq = new obsidianMock.FakeElement("div", doc);
  await plugin.processors.get("puml")("Alice -> Bob : hi", seq, obsidianMock.createContext());
  assert.ok(seq.find("excaliplant"));

  const bad = new obsidianMock.FakeElement("div", doc);
  await plugin.processors.get("uml")(
    "@startuml\n!if (\n@enduml",
    bad,
    obsidianMock.createContext(),
  );
  assert.ok(bad.find("excaliplant-error"));

  // Same output as the Node renderer: the bundle's hash and layout paths agree.
  const { renderBlock } = await import("../src/markdown/render.mjs");
  const want = await renderBlock("Alice -> Bob : hi", { theme: "sketch", scope: ".excaliplant" });
  assert.equal(seq.find("excaliplant").children[0].svgText, want.svg);
});

test("the bundle exposes Excalifont only as data URL", { skip }, async () => {
  const code = await bundleText();
  assert.ok(!/Excalifont-Regular\.(woff2|ttf)/.test(code), "no path to the font file");
});
