#!/usr/bin/env node
//
// Git merge driver that resolves conflicts on version-bearing files
// (`package.json`, `package-lock.json`) by keeping the *higher* semver
// whenever the only disagreement on a hunk is a `"version": "x.y.z"`
// line. Non-version conflicts are left untouched so a human can still
// review them.
//
// Why: when two PRs both run the release-version bump workflow, each
// rebases onto a `main` whose `package.json` already carries a newer
// version. The textual conflict is always identical in shape ("x.y.z"
// vs. "x.y.w") and is always resolvable mechanically by picking the
// higher of the two — there is no information loss because the next
// release bump will override it anyway.
//
// Git invokes a merge driver with the placeholders configured in
// `.gitattributes` / `git config merge.<name>.driver`:
//
//   %O  ancestor blob (base)
//   %A  ours / current branch
//   %B  theirs / other branch
//   %L  conflict marker length
//   %P  original path of the file being merged
//
// Exit code 0 means "merge succeeded — `%A` holds the resolved content".
// Any non-zero exit code means "left as a conflict" (git will surface
// the standard `<<<<<<< / ======= / >>>>>>>` markers).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Compare two semver-ish strings (`x.y.z`, optional `v` prefix and
 * optional pre-release / build suffix). Returns `1` when `a > b`,
 * `-1` when `a < b`, and `0` when equal. Unparseable inputs are
 * treated as the *lowest* possible version so a malformed side never
 * wins over a valid one.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersions(a, b) {
  const parse = (/** @type {string} */ s) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(s).trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

/**
 * Match a single JSON `"version": "x.y.z",?` line. Anchored to the
 * beginning so we do not accidentally rewrite arbitrary version-like
 * strings inside descriptions or URLs.
 */
const VERSION_LINE = /^(\s*"version"\s*:\s*")([^"]+)("\s*,?\s*)$/;

/**
 * Walk a buffer of conflict markers and resolve hunks where the only
 * difference is a `"version": "x.y.z"` line. Hunks that do not match
 * are passed through untouched, so a human still sees real conflicts.
 *
 * @param {string} merged Buffer produced by `git merge-file`, may
 *   contain `<<<<<<<` / `=======` / `>>>>>>>` markers.
 * @returns {{text: string, resolved: number, remaining: number}}
 */
export function resolveVersionConflicts(merged) {
  const lines = merged.split("\n");
  /** @type {string[]} */
  const out = [];
  let resolved = 0;
  let remaining = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith("<<<<<<<")) {
      out.push(line);
      i++;
      continue;
    }
    // Locate the matching ======= and >>>>>>> markers. Bail out
    // gracefully if the conflict block is malformed.
    let sep = -1;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (sep === -1 && lines[j].startsWith("=======")) sep = j;
      else if (sep !== -1 && lines[j].startsWith(">>>>>>>")) {
        end = j;
        break;
      }
    }
    if (sep === -1 || end === -1) {
      out.push(line);
      i++;
      continue;
    }
    const ours = lines.slice(i + 1, sep);
    const theirs = lines.slice(sep + 1, end);
    const versionResolution = tryResolveVersionHunk(ours, theirs);
    if (versionResolution) {
      out.push(...versionResolution);
      resolved++;
    } else {
      // Leave the conflict block intact for human resolution.
      out.push(...lines.slice(i, end + 1));
      remaining++;
    }
    i = end + 1;
  }
  return { text: out.join("\n"), resolved, remaining };
}

/**
 * Attempt to resolve a single conflict hunk made of two side-by-side
 * line buffers. Succeeds only when both sides have the same number of
 * lines and the only differing line is a `"version": "..."` JSON line;
 * the higher semver wins.
 *
 * @param {string[]} ours
 * @param {string[]} theirs
 * @returns {string[] | null}
 */
function tryResolveVersionHunk(ours, theirs) {
  if (ours.length !== theirs.length) return null;
  /** @type {{idx:number, our:string, their:string} | null} */
  let diff = null;
  for (let k = 0; k < ours.length; k++) {
    if (ours[k] === theirs[k]) continue;
    if (diff) return null; // more than one differing line — not a pure version conflict
    diff = { idx: k, our: ours[k], their: theirs[k] };
  }
  if (!diff) {
    // Identical sides — pick either.
    return ours;
  }
  const ourMatch = VERSION_LINE.exec(diff.our);
  const theirMatch = VERSION_LINE.exec(diff.their);
  if (!ourMatch || !theirMatch) return null;
  // Indentation / surrounding punctuation must agree so we don't
  // accidentally collapse a structurally different file.
  if (ourMatch[1] !== theirMatch[1] || ourMatch[3] !== theirMatch[3]) return null;
  const cmp = compareVersions(ourMatch[2], theirMatch[2]);
  // Strict greater wins; on equality (same semver, possibly different
  // whitespace inside the version string) prefer `ours` so the result
  // is deterministic.
  const winner = cmp >= 0 ? diff.our : diff.their;
  const resolved = ours.slice();
  resolved[diff.idx] = winner;
  return resolved;
}

/**
 * Run `git merge-file` to perform the standard three-way merge, then
 * post-process any leftover conflicts via {@link resolveVersionConflicts}.
 * Writes the result back to `oursPath` and returns a non-zero exit
 * code if any conflicts could not be auto-resolved.
 *
 * @param {{ours: string, base: string, theirs: string, markerSize?: string, label?: string}} args
 * @returns {number} Process exit code (0 = clean merge, 1 = unresolved conflicts remain).
 */
export function runDriver({ ours, base, theirs, markerSize = "7", label = "" }) {
  // Use git merge-file's -p mode so we capture the merged output (with
  // conflict markers if any) on stdout and never overwrite %A unless
  // we explicitly choose to.
  const args = [
    "merge-file",
    "-p",
    `--marker-size=${markerSize}`,
    "-L",
    label || "ours",
    "-L",
    "base",
    "-L",
    "theirs",
    ours,
    base,
    theirs,
  ];
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.error) throw r.error;
  const merged = r.stdout ?? "";
  // git merge-file exit codes:
  //   0  : clean merge
  //   >0 : number of conflicts (or fatal on -1)
  if ((r.status ?? 0) === 0) {
    writeFileSync(ours, merged);
    return 0;
  }
  const { text, remaining } = resolveVersionConflicts(merged);
  writeFileSync(ours, text);
  return remaining === 0 ? 0 : 1;
}

// CLI entrypoint.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , oursPath, basePath, theirsPath, markerSize, label] = process.argv;
  if (!oursPath || !basePath || !theirsPath) {
    console.error(
      "Usage: merge-driver-prefer-higher-version.mjs <ours> <base> <theirs> [markerSize] [label]",
    );
    process.exit(2);
  }
  // Ensure the input files exist before invoking git merge-file —
  // that gives a clearer error than the cryptic git output.
  for (const p of [oursPath, basePath, theirsPath]) {
    try {
      readFileSync(p);
    } catch (e) {
      console.error(`merge driver: cannot read ${p}: ${e instanceof Error ? e.message : e}`);
      process.exit(2);
    }
  }
  process.exit(
    runDriver({
      ours: oursPath,
      base: basePath,
      theirs: theirsPath,
      markerSize,
      label,
    }),
  );
}
