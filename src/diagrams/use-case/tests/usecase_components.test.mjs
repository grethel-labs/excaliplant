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

test("use-case official declarations parse aliases, multiline labels and stereotypes", () => {
  const diagram = parsePlantUml(
    `@startuml
(First usecase)
(Another usecase) as (UC2)
usecase UC3
usecase (Last\\nusecase) as UC4
usecase alias2 as "description2"
(Use the application) as (Use) << Main >>
:Another\\nactor:/ as Man2
actor/ :Last actor: as Person1
"Main Admin" as Admin
"Checkout flow" as (Checkout)
@enduml`,
    { unknownLines: "strict" },
  );

  assert.equal(diagram.boxById("first_usecase")?.shape, "usecase");
  assert.equal(diagram.boxById("UC2")?.title, "Another usecase");
  assert.equal(diagram.boxById("UC4")?.title, "Last\nusecase");
  assert.equal(diagram.boxById("alias2")?.title, "description2");
  assert.equal(diagram.boxById("Use")?.stereotype, "Main");
  assert.equal(diagram.boxById("Man2")?.shape, "actor");
  assert.equal(diagram.boxById("Person1")?.title, "Last actor");
  assert.equal(diagram.boxById("Admin")?.title, "Main Admin");
  assert.equal(diagram.boxById("Checkout")?.shape, "usecase");
});

test("use-case official relationships auto-create shorthand endpoints", () => {
  const diagram = parsePlantUml(
    `@startuml
:User: --> (Use)
"Use the application" as (Use)
Admin --> (Admin the application)
User <|-- Admin
(Use) .> (Login) : include
(Help) .> (Use) : extends
:user: -down-> (dummyDown)
:user: --> (bar1) #line:red;line.bold;text:red : red bold
:user: --> (bar2) #green;line.dashed;text:green : green dashed
@enduml`,
    { unknownLines: "strict" },
  );

  assert.equal(diagram.boxById("user")?.shape, "actor");
  assert.equal(diagram.boxById("Use")?.title, "Use the application");
  assert.equal(diagram.boxById("Admin")?.shape, "actor");
  assert.equal(diagram.boxById("admin_the_application")?.shape, "usecase");
  assert.ok(diagram.connections.some((connection) => connection.label === "include"));
  assert.ok(diagram.connections.some((connection) => connection.directionHint === "down"));
  assert.ok(
    diagram.connections.some(
      (connection) => connection.label === "green dashed" && connection.dashed,
    ),
  );
});

test("use-case containers and notes keep nested elements parseable", () => {
  const diagram = parsePlantUml(
    `@startuml
left to right direction
actor "Food Critic" as fc
rectangle Restaurant {
  usecase "Eat Food" as UC1
  usecase "Pay for Food" as UC2
}
fc --> UC1
note right of UC1
  reviewed safely
end note
@enduml`,
    { unknownLines: "strict" },
  );

  const restaurant = diagram.planes.find((plane) => plane.id === "restaurant");
  assert.ok(restaurant);
  assert.equal(restaurant.allBoxes.filter((box) => box.shape === "usecase").length, 2);
  assert.equal(diagram.boxById("UC1")?.shape, "usecase");
  assert.equal(diagram.boxById("note_0")?.description, "reviewed safely");
  assert.ok(diagram.connections.some((connection) => connection.kind === "note"));
});

test("use-case diagrams render through the module-aware pipeline", async () => {
  const doc = await renderPlantUml(BASIC_USECASE, { sourceLabel: "use-case/basic" });

  assert.equal(doc.type, "excalidraw");
  assert.ok(doc.elements.length > 0);
});
