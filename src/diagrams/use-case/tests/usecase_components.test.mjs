import test from "node:test";
import assert from "node:assert/strict";

import { parsePlantUml, renderPlantUml, SequenceDiagram } from "../../../../index.mjs";

const BASIC_USECASE = `@startuml
left to right direction
actor "Customer" as Customer
usecase "Place Order" as PlaceOrder
Customer --> PlaceOrder : starts
@enduml`;

test("use-case diagrams parse actors, use cases and relationships", () => {
  const diagram = parsePlantUml(BASIC_USECASE, { unknownLines: "strict" });

  assert.ok(!(diagram instanceof SequenceDiagram));
  assert.equal(diagram.layoutDirection, "RIGHT");
  assert.equal(diagram.boxById("Customer")?.shape, "actor");
  assert.equal(diagram.boxById("PlaceOrder")?.shape, "usecase");
  assert.ok(diagram.connections.some((connection) => connection.label === "starts"));
});

test("use-case diagrams render through the module-aware pipeline", async () => {
  const doc = await renderPlantUml(BASIC_USECASE, { sourceLabel: "use-case/basic" });

  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
});
