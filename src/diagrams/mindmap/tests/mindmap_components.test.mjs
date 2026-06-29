import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("mindmap diagrams parse orgmode and markdown hierarchy", () => {
  const diagram = parsePlantUml(`@startmindmap
* Debian
** Ubuntu
*** Linux Mint
# Markdown root
## Markdown child
@endmindmap`);
  assert.equal(getDiagramModuleKind(diagram), "mindmap");
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "Debian"));
  assert.ok(diagram.planes[0].allBoxes.some((box) => box.title === "Markdown child"));
  assert.ok(diagram.connections.length >= 2);
});
