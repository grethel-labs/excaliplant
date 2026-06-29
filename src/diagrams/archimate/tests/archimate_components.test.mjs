import test from "node:test";
import assert from "node:assert/strict";
import { getDiagramModuleKind, parsePlantUml } from "../../../../index.mjs";

test("archimate diagrams parse elements, aliases, junctions and relationships", () => {
  const diagram = parsePlantUml(`@startuml
Junction_And JunctionAnd
Junction_Or JunctionOr
archimate #Technology "VPN Server" as vpnServerA <<technology-device>>
rectangle GO #lightgreen
rectangle STOP #red
GO -up-> JunctionOr
STOP -down-> JunctionAnd
@enduml`);
  assert.equal(getDiagramModuleKind(diagram), "archimate");
  assert.ok(diagram.boxById("vpnServerA"));
  assert.ok(diagram.boxById("JunctionAnd"));
  assert.equal(diagram.connections.length, 2);
});
