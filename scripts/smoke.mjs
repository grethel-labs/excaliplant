#!/usr/bin/env node
// Smoke test for a packed tarball installed into a clean project.
// Run from the project that installed the package.

import { render, renderPlantUml } from "@grethel-labs/excaliplant";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const result = await render("@startuml\nAlice -> Bob : hello\n@enduml");
if (result.kind !== "sequence") throw new Error(`unexpected kind ${result.kind}`);
const svg = await result.toSvg();
if (!svg.startsWith("<svg")) throw new Error("SVG output missing");
const png = await result.toPng({ width: 200 });
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG output missing");
const doc = await renderPlantUml("@startmindmap\n* root\n** child\n@endmindmap");
if (doc.type !== "excalidraw") throw new Error("renderPlantUml compatibility API broken");

const require = createRequire(import.meta.url);
const bin = require
  .resolve("@grethel-labs/excaliplant/package.json")
  .replace(/package\.json$/, "bin/excaliplant.mjs");
const out = execFileSync(process.execPath, [bin, "-f", "svg"], { input: "A -> B" }).toString();
if (!out.startsWith("<svg")) throw new Error("CLI output missing");
console.log("smoke OK");
