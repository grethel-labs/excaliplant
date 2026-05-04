#!/usr/bin/env node
// Bump package.json and package-lock.json from an explicit base version.
// Used by the PR release-version workflow so a main-bound PR chooses exactly
// one release intent: major, minor, or patch.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_TYPES = new Set(["major", "minor", "patch"]);

function usage() {
  console.error(`Usage: node scripts/bump-release-version.mjs --bump <major|minor|patch> [--base-version <x.y.z>]

Environment fallbacks:
  RELEASE_BUMP   major, minor, or patch
  BASE_VERSION   base semver used for the bump`);
}

function parseArgs(argv) {
  const args = { bump: process.env.RELEASE_BUMP, baseVersion: process.env.BASE_VERSION };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bump") {
      args.bump = argv[++i];
    } else if (arg === "--base-version") {
      args.baseVersion = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(version, bump) {
  const parsed = parseVersion(version);
  if (bump === "major") {
    return `${parsed.major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (bump === "patch") {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  throw new Error(`Invalid release bump: ${bump}`);
}

function derivePreviousMinorLine(versionLine) {
  const parsed = parseVersion(versionLine.replace(/\.x$/, ".0"));
  if (parsed.minor > 0) {
    return `${parsed.major}.${parsed.minor - 1}.x`;
  }
  if (parsed.major > 0) {
    return `${parsed.major - 1}.0.x`;
  }
  return "0.0.x";
}

function rewriteSecuritySupportedVersions(content, nextVersion) {
  const next = parseVersion(nextVersion);
  const nextSupported = `${next.major}.${next.minor}.x`;
  const lines = content.split("\n");
  const tableRowRe = /^\|\s*`(\d+\.\d+\.x)`\s*\|\s*:[a-z_]+:\s*\|\s*$/;
  const rowIndexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (tableRowRe.test(lines[i])) {
      rowIndexes.push(i);
    }
  }

  if (rowIndexes.length === 0) {
    return content;
  }

  const oldSupportedMatch = tableRowRe.exec(lines[rowIndexes[0]]);
  const oldDeprecatedMatch = rowIndexes.length > 1 ? tableRowRe.exec(lines[rowIndexes[1]]) : null;
  const oldSupported = oldSupportedMatch?.[1] ?? nextSupported;
  const oldDeprecated = oldDeprecatedMatch?.[1] ?? derivePreviousMinorLine(nextSupported);
  const nextDeprecated = oldSupported !== nextSupported ? oldSupported : oldDeprecated;

  lines[rowIndexes[0]] = `| \`${nextSupported}\` | :white_check_mark: |`;
  if (rowIndexes.length > 1) {
    lines[rowIndexes[1]] = `| \`${nextDeprecated}\` | :x:                |`;
  }
  return lines.join("\n");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!RELEASE_TYPES.has(args.bump)) {
    usage();
    process.exit(2);
  }

  const packagePath = path.join(REPO_ROOT, "package.json");
  const packageJson = await readJson(packagePath);
  const baseVersion = args.baseVersion ?? packageJson.version;
  const nextVersion = bumpVersion(baseVersion, args.bump);

  packageJson.version = nextVersion;
  await writeJson(packagePath, packageJson);

  const lockPath = path.join(REPO_ROOT, "package-lock.json");
  if (existsSync(lockPath)) {
    const lockJson = await readJson(lockPath);
    lockJson.version = nextVersion;
    if (lockJson.packages?.[""]) {
      lockJson.packages[""].version = nextVersion;
    }
    await writeJson(lockPath, lockJson);
  }

  const securityPath = path.join(REPO_ROOT, "SECURITY.md");
  if (existsSync(securityPath)) {
    const securityContent = await readFile(securityPath, "utf8");
    const updatedSecurityContent = rewriteSecuritySupportedVersions(securityContent, nextVersion);
    if (updatedSecurityContent !== securityContent) {
      await writeFile(securityPath, updatedSecurityContent);
    }
  }

  console.log(nextVersion);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
