import assert from "node:assert/strict";
import test from "node:test";
import { render } from "../src/index.mjs";

/**
 * @param {import("../src/api.mjs").RenderResult} result
 * @param {string} text
 * @param {number} size
 * @param {string} color
 * @param {number} [count]
 */
function assertText(result, text, size, color, count = 1) {
  const matches = result.excalidraw.elements.filter((e) => e.type === "text" && e.text === text);
  assert.equal(matches.length, count, text);
  for (const match of matches) {
    assert.equal(match.fontSize, size, `${text} font size`);
    assert.equal(match.strokeColor, color, `${text} color`);
  }
  return matches[0];
}

test("graph containers inherit only explicit text properties and prefer local values", async () => {
  const result = await render(
    `@startuml
skinparam defaultFontColor #123456
skinparam packageFontSize 32
<style>
node {
  FontSize 26
}
interface {
  FontSize 23
  FontColor purple
}
</style>
package Outer #back:white;text:red {
  class Inherited
  rectangle Bridge {
    class ThroughBridge
  }
  node Inner #white;text:green {
    class Nested {
      member
      <size:12><color:blue>Rich</color></size>
    }
    class Inline #white;text:orange
    interface RoleOverride
  }
}
class Outside
@enduml`,
    { strict: true },
  );
  assert.equal(result.kind, "class");
  assertText(result, "Outer", 32, "#ff0000");
  assertText(result, "Inherited", 32, "#ff0000");
  assertText(result, "Bridge", 32, "#ff0000");
  assertText(result, "ThroughBridge", 32, "#ff0000");
  assertText(result, "Inner", 26, "#008000");
  assertText(result, "Nested", 26, "#008000");
  assertText(result, "member", 22.1, "#008000");
  assertText(result, "Rich", 12, "#0000ff");
  assertText(result, "Inline", 26, "#ffa500");
  assertText(result, "RoleOverride", 23, "#800080");
  assertText(result, "Outside", 16, "#123456");
});

test("composite state typography sizes the custom leaf state geometry", async () => {
  const result = await render(
    `@startuml
<style>
compositeState {
  FontSize 28
  FontColor red
}
</style>
state Composite {
  state Nested : Description
}
state Outside
@enduml`,
    { strict: true },
  );
  assert.equal(result.kind, "state");
  assertText(result, "Composite", 28, "#ff0000");
  assertText(result, "Nested", 28, "#ff0000");
  assertText(result, "Description", 23.8, "#ff0000");
  const outside = result.excalidraw.elements.find((e) => e.type === "text" && e.text === "Outside");
  assert.equal(outside?.fontSize, 16);
});

test("sequence participants inherit box text styles and both labels use the measured size", async () => {
  const result = await render(
    `@startuml
skinparam sequenceBoxFontSize 30
skinparam sequenceBoxFontColor green
box "Participants in the primary system" #white;text:red
  participant A
  participant "B <size:12><color:blue>Rich</color></size>" as B #white;text:orange
end box
box "Fallback" #white
  participant C
end box
participant Outside
A -> B
@enduml`,
    { strict: true },
  );
  assert.equal(result.kind, "sequence");
  const title = assertText(result, "Participants in the primary system", 30, "#ff0000");
  const a = assertText(result, "A", 30, "#ff0000", 2);
  assertText(result, "B ", 30, "#ffa500", 2);
  assertText(result, "Rich", 12, "#0000ff", 2);
  assertText(result, "Fallback", 30, "#008000");
  assertText(result, "C", 30, "#008000", 2);
  assert.ok(a.y >= title.y + title.height, "the title fits above the participant head");
  const frame = result.excalidraw.elements.find(
    (e) => e.type === "rectangle" && e.width >= title.width && e.y < title.y,
  );
  assert.ok(frame && frame.x < title.x && frame.x + frame.width > title.x + title.width);
  const outside = result.excalidraw.elements.find((e) => e.type === "text" && e.text === "Outside");
  assert.equal(outside?.fontSize, 16);
});

test("sequence participant role styling takes precedence over the box font", async () => {
  const result = await render(
    `@startuml
<style>
box {
  FontSize 30
  FontColor red
}
participant {
  FontSize 21
  FontColor purple
}
</style>
box "System" #white
  participant Styled
  participant Inline #white;text:orange
end box
Styled -> Inline
@enduml`,
    { strict: true },
  );
  assertText(result, "System", 30, "#ff0000");
  assertText(result, "Styled", 21, "#800080", 2);
  assertText(result, "Inline", 21, "#ffa500", 2);
});
