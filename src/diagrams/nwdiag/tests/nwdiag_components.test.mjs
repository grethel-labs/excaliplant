import test from "node:test";
import assert from "node:assert/strict";
import {
  getDiagramModuleKind,
  layoutDiagramWithModule,
  parsePlantUml,
} from "../../../../index.mjs";

test("nwdiag parses networks, addresses and multi-homed nodes", async () => {
  const diagram = parsePlantUml(`@startnwdiag
nwdiag {
  network dmz {
    address = "210.x.x.x/24"
    web01 [address = "210.x.x.1"];
    web02 [address = "210.x.x.2"];
  }
  network internal {
    address = "172.x.x.x/24";
    web01 [address = "172.x.x.1"];
    db01;
  }
  web01 -- db01 : SQL
}
@endnwdiag`);
  assert.equal(getDiagramModuleKind(diagram), "nwdiag");
  assert.ok(diagram.boxById("web01"));
  assert.ok(diagram.boxById("db01"));
  assert.equal(diagram.connections.length, 1);
  await layoutDiagramWithModule(diagram);
  assert.ok(diagram.boxById("web01").width > 0);
});
