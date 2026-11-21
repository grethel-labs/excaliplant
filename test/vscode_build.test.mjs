// Build tests for the VS Code extension: the bundle runs without node_modules
// and the .vsix is clean. They need esbuild and @vscode/vsce from
// integrations/vscode (`npm ci` there); without them the tests are skipped.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";
import excaliplantPlugin from "../src/markdown/markdown_it.mjs";
import {
  EXT_DIR,
  bundle,
  esbuildAvailable,
  packageVsix,
  vsceAvailable,
} from "../scripts/build-vscode.mjs";
import { createMiniMarkdownIt, createMockVscode, waitFor } from "./vscode_shim.mjs";

const hasEsbuild = esbuildAvailable();
const hasVsce = hasEsbuild && vsceAvailable();
const skipBundle = hasEsbuild
  ? false
  : "esbuild is not installed (run `npm ci` in integrations/vscode to enable the VS Code build tests)";
const skipVsix = hasVsce
  ? false
  : "esbuild/@vscode/vsce are not installed (run `npm ci` in integrations/vscode)";

const work = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), "excaliplant-vscode-test-"));
after(() => rmSync(work, { recursive: true, force: true }));

/** Entries of a zip file, decompressed (central directory reader, no dependencies). */
function readZip(file) {
  const buf = readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, "not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  /** @type {Map<string, Buffer>} */
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    entries.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("vscode bundle", { skip: skipBundle }, () => {
  let outfile;
  before(async () => {
    outfile = path.join(work, "bundle", "extension.js");
    await bundle({ outfile });
  });

  it("is one self-contained file: only vscode and Node built-ins are required", () => {
    const code = readFileSync(outfile, "utf8");
    const required = new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]));
    for (const id of required) {
      assert.ok(id === "vscode" || id.startsWith("node:"), `unexpected require("${id}")`);
    }
    assert.ok(required.has("vscode"));
    assert.doesNotMatch(code, /sourceMappingURL/);
    assert.equal(existsSync(`${outfile}.map`), false);
    assert.doesNotMatch(code, /resvg-js/, "no native module in the bundle");
  });

  it("renders like the library from a directory without node_modules", async () => {
    // Load the bundle from a place where no node_modules can be found.
    const isolated = path.join(work, "isolated");
    mkdirSync(isolated);
    copyFileSync(outfile, path.join(isolated, "extension.js"));
    const mock = createMockVscode();
    const Module = createRequire(import.meta.url)("node:module");
    const load = Module._load;
    Module._load = function (request, ...rest) {
      return request === "vscode" ? mock.vscode : load.call(this, request, ...rest);
    };
    let ext;
    try {
      ext = createRequire(path.join(isolated, "x.js"))("./extension.js");
    } finally {
      Module._load = load;
    }
    assert.equal(typeof ext.activate, "function");
    const api = ext.activate({ subscriptions: [] });
    const text =
      "```plantuml\n@startuml\nAlice -> Bob : bundled\nBob --> Alice : ok\n@enduml\n```\n";
    const md = api.extendMarkdownIt(createMiniMarkdownIt());
    assert.match(md.render(text, {}), /pending/);
    await waitFor(() => !/pending/.test(md.render(text, {})));
    const fromBundle = md.render(text, {});

    // The same render through the sources, with the settings the extension applies.
    const sourceMd = createMiniMarkdownIt().use(excaliplantPlugin, {
      theme: "sketch",
      clean: false,
    });
    await excaliplantPlugin.prerender(sourceMd, text);
    const fromSource = sourceMd.render(text, {});
    assert.equal(fromBundle, fromSource, "bundle output equals library output (font included)");
    assert.match(fromBundle, /font\/woff2;base64,/);
    ext.deactivate();
  });
});

describe("vscode vsix", { skip: skipVsix }, () => {
  /** @type {Awaited<ReturnType<typeof packageVsix>>} */
  let built;
  /** @type {Map<string, Buffer>} */
  let entries;
  const outDir = path.join(work, "vsix");
  const manifestBefore = readFileSync(path.join(EXT_DIR, "package.json"), "utf8");

  before(async () => {
    built = await packageVsix({ version: "1.2.3", outDir });
    entries = readZip(built.vsix);
  });

  it("is named after the version and stays small", () => {
    assert.equal(path.basename(built.vsix), "excaliplant-1.2.3.vsix");
    assert.deepEqual(readdirSync(outDir), ["excaliplant-1.2.3.vsix"]);
    assert.ok(built.bytes < 5 * 1024 * 1024, `vsix is ${built.bytes} bytes`);
  });

  it("sets the version in the package only, not in the working tree", () => {
    const packaged = JSON.parse(entries.get("extension/package.json").toString("utf8"));
    assert.equal(packaged.version, "1.2.3");
    assert.equal(packaged.devDependencies, undefined);
    assert.equal(packaged.scripts, undefined);
    assert.equal(readFileSync(path.join(EXT_DIR, "package.json"), "utf8"), manifestBefore);
  });

  it("contains the bundle, licences and assets, and nothing else", () => {
    const names = [...entries.keys()].filter((n) => !n.endsWith("/"));
    for (const need of [
      "extension/dist/extension.js",
      "extension/package.json",
      "extension/readme.md",
      "extension/changelog.md",
      "extension/LICENSE.txt",
      "extension/LICENSE-Excalifont.txt",
      "extension/THIRD_PARTY_NOTICES.md",
      "extension/icon.png",
      "extension/language-configuration.json",
      "extension/syntaxes/plantuml.tmLanguage.json",
      "extension/media/preview.css",
    ]) {
      assert.ok(names.includes(need), `missing ${need}`);
    }
    for (const name of names) {
      assert.doesNotMatch(
        name,
        /node_modules|\.map$|\.env|\.vscodeignore|\.vsix$|(^|\/)(src|test|scripts)\//,
        name,
      );
    }
  });

  it("carries no secrets", () => {
    for (const [name, data] of entries) {
      if (name.endsWith(".png")) continue;
      const text = data.toString("utf8");
      assert.doesNotMatch(
        text,
        /VSCE_PAT|OVSX_PAT|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,}/,
        name,
      );
    }
  });
});

describe("vscode build script", () => {
  it("rejects invalid versions before building", async () => {
    await assert.rejects(() => packageVsix({ version: "1.2" }), /Invalid version/);
  });
});
