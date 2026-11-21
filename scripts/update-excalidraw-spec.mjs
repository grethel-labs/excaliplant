#!/usr/bin/env node
// Refresh the committed snapshot of Excalidraw's element typings.
//
//   node scripts/update-excalidraw-spec.mjs           fetch the latest @excalidraw/element typings
//   node scripts/update-excalidraw-spec.mjs --check   exit 1 when npm has a newer version than the snapshot
//
// The snapshot (skills-src/excalidraw-spec/element-types.d.ts.txt + meta.json) is
// the only place the skill's Excalidraw reference gets its facts from, so
// `node scripts/skills.mjs` stays offline and deterministic. Run this script
// manually or from a scheduled workflow, then run `node scripts/skills.mjs`
// and commit the result. Needs network access; nothing else in the repository does.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SPEC_DIR, parseSpec } from "./excalidraw-spec.mjs";

const PACKAGE = "@excalidraw/element";
const TYPES_PATH = "dist/types/element/src/types.d.ts";
const SNAPSHOT = path.join(SPEC_DIR, "element-types.d.ts.txt");
const META = path.join(SPEC_DIR, "meta.json");

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": "excaliplant-spec-update" } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.text();
}

const check = process.argv.includes("--check");
const latest = JSON.parse(
  await get(`https://registry.npmjs.org/${PACKAGE.replace("/", "%2f")}/latest`),
);
const version = String(latest.version);
if (!/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error(`Unexpected version ${version}`);
const current = existsSync(META) ? JSON.parse(readFileSync(META, "utf8")) : null;

if (check) {
  if (current?.version === version) {
    console.log(`Excalidraw spec snapshot is current (${PACKAGE}@${version}).`);
  } else {
    console.error(
      `Excalidraw spec snapshot is ${current?.version ?? "missing"}, npm latest is ${version}. Run: node scripts/update-excalidraw-spec.mjs && node scripts/skills.mjs`,
    );
    process.exit(1);
  }
} else {
  const sourceUrl = `https://cdn.jsdelivr.net/npm/${PACKAGE}@${version}/${TYPES_PATH}`;
  const dts = await get(sourceUrl);
  // Refuse a snapshot the generator and the conformance test cannot read.
  const spec = parseSpec(dts);
  for (const type of ["rectangle", "ellipse", "diamond", "text", "line", "arrow"]) {
    if (!spec.elements.some((e) => e.type === type))
      throw new Error(
        `Fetched typings define no "${type}" element; refusing to overwrite the snapshot`,
      );
  }
  const sha256 = createHash("sha256").update(dts).digest("hex");
  if (current?.sha256 === sha256 && current?.version === version) {
    console.log(`Snapshot already matches ${PACKAGE}@${version}; nothing to do.`);
  } else {
    writeFileSync(SNAPSHOT, dts);
    const meta = {
      package: PACKAGE,
      version,
      sourceUrl,
      docsUrl: "https://docs.excalidraw.com/docs/codebase/json-schema",
      sha256,
      // The only wall-clock value in the pipeline; it is written by this
      // manual script, never by the deterministic generator.
      fetchedAt: new Date().toISOString().slice(0, 10),
    };
    writeFileSync(META, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(
      `Updated snapshot to ${PACKAGE}@${version} (${spec.elements.length} element types). Now run: node scripts/skills.mjs`,
    );
  }
}
