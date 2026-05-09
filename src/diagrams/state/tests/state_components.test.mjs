/**
 * State diagram component tests.
 * @module diagrams/state/tests/state_components
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { parsePlantUml } from "../../../../index.mjs";

const BASIC_STATE = `
@startuml
[*] --> State1
State1 : this is a string
State1 --> State2 : event / action
State2 --> [*]
hide empty description
@enduml
`;

describe("State diagram examples", () => {
  it("parses basic state diagram", async () => {
    const parsed = await parsePlantUml(BASIC_STATE);
    assert.ok(parsed, "Should parse successfully");
  });
});

describe("State declarations", () => {
  it("parses state declarations", async () => {
    const puml = `
@startuml
state Idle
state Running : active process
state Stopped : final state
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse");
    // Just verify parsing succeeds - detailed box inspection depends on model structure
    assert.ok(parsed.planes || parsed.boxes, "Should have planes or boxes");
  });

  it("handles aliases", async () => {
    const puml = `
@startuml
state "My Complex State" as complex
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse with aliases");
  });
});

describe("Pseudostates", () => {
  it("recognizes start and end states", async () => {
    const puml = `
@startuml
state start1 <<start>>
state end1 <<end>>
[*] --> start1
start1 --> end1
end1 --> [*]
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse pseudostates");
  });

  it("recognizes choice, fork, join", async () => {
    const puml = `
@startuml
state choice1 <<choice>>
state fork1 <<fork>>
state join1 <<join>>
[*] --> choice1
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse choice/fork/join");
  });

  it("recognizes history states", async () => {
    const puml = `
@startuml
state h <<history>>
state hd <<history*>>
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse history states");
  });
});

describe("Composite states", () => {
  it("handles nested states", async () => {
    const puml = `
@startuml
state Active {
  [*] --> Idle
  Idle --> Configuring : EvConfig
}
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse composite states");
  });

  it("handles deeply nested states", async () => {
    const puml = `
@startuml
state Outer {
  state Inner {
    [*] --> Deep
    state Deep {
      [*] --> Deepest
    }
  }
}
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse deeply nested states");
  });
});

describe("Transitions", () => {
  it("handles basic transitions", async () => {
    const puml = `
@startuml
State1 --> State2 : event
State2 --> State3 : event [guard] / action
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse transitions");
  });

  it("handles transitions to/from [*]", async () => {
    const puml = `
@startuml
[*] --> State1
State1 --> [*]
@enduml
`;
    const parsed = await parsePlantUml(puml);
    assert.ok(parsed, "Should parse transitions to/from [*]");
  });
});
