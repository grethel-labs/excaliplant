// Tests for the `plugin-release` branch: the generated file set
// (scripts/plugin-ref.mjs) and the publishing script
// (scripts/publish-plugin-branch.sh) against a local bare repository.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree, refEntries } from "../scripts/skills.mjs";
import { writePluginRef } from "../scripts/plugin-ref.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "publish-plugin-branch.sh");
const tree = await buildTree();
const entries = refEntries(tree, "1.2.3");
const byPath = new Map(entries.map((e) => [e.path, e.data]));

/** @param {string | Buffer} data @returns {string} */
const text = (data) => data.toString("utf8");

test("the plugin-release branch holds exactly the files the directories need", () => {
  const paths = entries.map((e) => e.path);
  assert.deepEqual(paths, [...paths].sort(), "sorted by path");
  const fixed = paths.filter((p) => !p.includes("/skills/"));
  assert.deepEqual(fixed, [
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    "README.md",
    "integrations/claude-plugin/.claude-plugin/icon.png",
    "integrations/claude-plugin/.claude-plugin/plugin.json",
    "integrations/claude-plugin/LICENSE",
    "integrations/claude-plugin/README.md",
    "integrations/codex-plugin/LICENSE",
    "integrations/codex-plugin/README.md",
    "integrations/codex-plugin/assets/icon.png",
    "integrations/codex-plugin/plugin.json",
  ]);
  for (const plugin of ["claude-plugin", "codex-plugin"]) {
    const skills = paths.filter((p) => p.startsWith(`integrations/${plugin}/skills/excaliplant/`));
    assert.ok(skills.includes(`integrations/${plugin}/skills/excaliplant/SKILL.md`));
    const generated = [...tree.keys()].filter((p) =>
      p.startsWith(`integrations/${plugin}/skills/`),
    );
    assert.deepEqual(skills, generated.sort());
  }
  assert.ok(!paths.some((p) => p.startsWith(".github/") || p.startsWith("skills/")));
  assert.ok(!paths.some((p) => p.includes("node_modules")));
});

test("the release version is substituted everywhere and no placeholder is left", () => {
  for (const { path: p, data } of entries) {
    assert.ok(!Buffer.from(data).includes("{{version}}"), `${p} still has {{version}}`);
  }
  for (const p of [
    "integrations/claude-plugin/.claude-plugin/plugin.json",
    "integrations/codex-plugin/plugin.json",
  ]) {
    const manifest = JSON.parse(text(byPath.get(p) ?? ""));
    assert.equal(manifest.version, "1.2.3", p);
    assert.equal(manifest.name, "excaliplant");
  }
  for (const plugin of ["claude-plugin", "codex-plugin"]) {
    const skill = text(byPath.get(`integrations/${plugin}/skills/excaliplant/SKILL.md`) ?? "");
    assert.match(skill, /^ {2}version: "1\.2\.3"$/m);
  }
  assert.match(text(byPath.get("README.md") ?? ""), /do not edit/);
  // The committed sources keep their placeholders and carry no version.
  assert.match(
    tree.get("integrations/claude-plugin/skills/excaliplant/SKILL.md") ?? "",
    /\{\{version\}\}/,
  );
  assert.throws(() => refEntries(tree, "latest"), /Invalid version/);
  assert.ok(refEntries(tree, "2.0.0-rc.1").length);
});

test("icons and the other binary files are copied byte for byte", () => {
  for (const rel of [
    "integrations/claude-plugin/.claude-plugin/icon.png",
    "integrations/codex-plugin/assets/icon.png",
  ]) {
    const data = byPath.get(rel);
    assert.ok(Buffer.isBuffer(data), rel);
    assert.ok(readFileSync(path.join(ROOT, rel)).equals(/** @type {Buffer} */ (data)), rel);
  }
});

test("the result is deterministic, in memory and on disk", async () => {
  const again = refEntries(await buildTree(), "1.2.3");
  assert.deepEqual(again, entries);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "plugin-ref-"));
  try {
    const written = await writePluginRef("1.2.3", path.join(tmp, "a"));
    assert.deepEqual(
      written,
      entries.map((e) => e.path),
    );
    for (const { path: p, data } of entries) {
      assert.ok(
        Buffer.from(data).equals(readFileSync(path.join(tmp, "a", ...p.split("/")))),
        `${p} differs on disk`,
      );
    }
    await assert.rejects(writePluginRef("1.2.3", path.join(tmp, "a")), /not empty/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("the Claude plugin part of the branch meets the directory's file rules", () => {
  const prefix = "integrations/claude-plugin/";
  const files = entries.filter((e) => e.path.startsWith(prefix));
  assert.ok(files.length > 0 && files.length <= 512);
  for (const { path: p, data } of files) {
    const buf = Buffer.from(data);
    assert.ok(buf.length < 256 * 1024, `${p} is larger than 256 KiB`);
    if (/\.png$/.test(p)) {
      assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", p);
    } else {
      assert.match(p, /\.(md|json|puml)$|\/LICENSE$/, `${p} has an unexpected type`);
      assert.ok(!buf.includes(0), `${p} is not text`);
      assert.ok(!buf.toString("utf8").startsWith("#!"), `${p} has a shebang`);
      if (p.endsWith(".json")) JSON.parse(buf.toString("utf8"));
    }
  }
});

// ── publish-plugin-branch.sh ──────────────────────────────────────────

/**
 * @param {string[]} args
 * @param {string} cwd
 * @param {Record<string, string>} [env]
 */
function git(args, cwd, env = {}) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", ...env },
  });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

test(
  "publish-plugin-branch.sh adds one fast-forward commit per release",
  { skip: process.platform === "win32" },
  () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "plugin-branch-"));
    try {
      const remote = path.join(tmp, "remote.git");
      const repo = path.join(tmp, "caller repo");
      git(["init", "--bare", "--initial-branch=main", remote], tmp);
      mkdirSync(repo);
      git(["init", "--initial-branch=main"], repo);
      git(["remote", "add", "origin", remote], repo);
      writeFileSync(path.join(repo, "tracked.txt"), "main content\n");
      git(["add", "."], repo);
      git(["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-m", "init"], repo);
      writeFileSync(path.join(repo, "untracked file.txt"), "scratch\n");
      const before = {
        status: git(["status", "--porcelain=v1"], repo),
        index: git(["ls-files", "-s"], repo),
        head: git(["rev-parse", "HEAD"], repo),
      };

      /** @param {string} dir @param {Record<string, string | null>} files */
      const stage = (dir, files) => {
        rmSync(dir, { recursive: true, force: true });
        for (const [rel, content] of Object.entries(files)) {
          if (content === null) continue;
          mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
          writeFileSync(path.join(dir, rel), content);
        }
      };
      const files = path.join(tmp, "files dir");
      const sha = "0123456789abcdef0123456789abcdef01234567";
      /** @param {string} version */
      const publish = (version) =>
        spawnSync("bash", [SCRIPT], {
          cwd: repo,
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_CONFIG_GLOBAL: os.devNull,
            GIT_CONFIG_NOSYSTEM: "1",
            VERSION: version,
            SOURCE_SHA: sha,
            FILES_DIR: files,
          },
        });
      const tipOf = () => git(["rev-parse", "refs/heads/plugin-release"], remote);
      const tags = () => git(["tag", "--list"], remote).split("\n").filter(Boolean);

      // First release: orphan commit, branch and tag.
      stage(files, { "a.txt": "one\n", "dir with space/b.txt": "two\n", "gone.txt": "bye\n" });
      let r = publish("1.2.3");
      assert.equal(r.status, 0, r.stderr);
      const first = tipOf();
      assert.equal(git(["rev-parse", "refs/tags/plugin-release-v1.2.3^{commit}"], remote), first);
      assert.equal(git(["rev-list", "--count", first], remote), "1");
      assert.equal(git(["ls-tree", "-r", "--name-only", first], remote).split("\n").length, 3);
      assert.match(
        git(["log", "-1", "--format=%an <%ae>|%cn <%ce>|%B", first], remote),
        /^github-actions\[bot\] <41898282\+github-actions\[bot\]@users\.noreply\.github\.com>\|github-actions\[bot\] <41898282\+github-actions\[bot\]@users\.noreply\.github\.com>\|Plugin release 1\.2\.3[\s\S]*0123456789abcdef0123456789abcdef01234567/,
      );

      // Second release: fast-forward, a removed file disappears.
      stage(files, { "a.txt": "one v2\n", "dir with space/b.txt": "two\n" });
      r = publish("1.2.4");
      assert.equal(r.status, 0, r.stderr);
      const second = tipOf();
      assert.notEqual(second, first);
      assert.equal(git(["rev-parse", `${second}^`], remote), first, "parent is the previous tip");
      assert.equal(git(["merge-base", "--is-ancestor", first, second], remote), "");
      assert.equal(
        git(["ls-tree", "-r", "--name-only", second], remote),
        "a.txt\ndir with space/b.txt",
      );
      assert.deepEqual(tags(), ["plugin-release-v1.2.3", "plugin-release-v1.2.4"]);

      // Same release again: no new commit, still exit 0.
      r = publish("1.2.4");
      assert.equal(r.status, 0, r.stderr);
      assert.equal(tipOf(), second);
      assert.equal(git(["rev-list", "--count", second], remote), "2");

      // A lost tag is set on the tip when the content is unchanged.
      git(["tag", "-d", "plugin-release-v1.2.4"], remote);
      r = publish("1.2.4");
      assert.equal(r.status, 0, r.stderr);
      assert.equal(tipOf(), second);
      assert.equal(git(["rev-parse", "refs/tags/plugin-release-v1.2.4^{commit}"], remote), second);

      // Bad input is refused and nothing is pushed.
      r = publish("not-a-version");
      assert.notEqual(r.status, 0);
      assert.equal(tipOf(), second);
      assert.deepEqual(
        git(["for-each-ref", "--format=%(refname)", "refs/heads"], remote).split("\n"),
        ["refs/heads/plugin-release"],
      );

      // The caller's checkout is untouched.
      assert.deepEqual(
        {
          status: git(["status", "--porcelain=v1"], repo),
          index: git(["ls-files", "-s"], repo),
          head: git(["rev-parse", "HEAD"], repo),
        },
        before,
      );
      assert.equal(readdirSync(repo).sort().join("|"), ".git|tracked.txt|untracked file.txt");
      assert.ok(!lstatSync(path.join(repo, "tracked.txt")).isSymbolicLink());
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
);
