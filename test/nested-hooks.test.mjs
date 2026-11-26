import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../src/index.mjs";

const wrap = (source) => `@startuml\n${source}\n@enduml`;
const nested = `package Outer as outer {
  package Middle as middle {
    package Gap as gap {
      component Child as child
    }
  }
}
component Nearby as nearby`;
const metadata = (element) => element.customData?.excaliplantHook;
const byLabel = (result, label) => result.excalidraw.elements.find((el) => el.text === label);

test("graph hooks resolve the closest bound ancestor through unhooked graph nodes", async () => {
  const base = await render(wrap(nested), { strict: true });
  const childId = byLabel(base, "Child").id;
  const result = await render(
    wrap(`@hook #outer alias:outer click-from-children
@hook alias:middle .container
@hook #inside element:${childId}
@hook #nearby alias:nearby
${nested}`),
    { strict: true },
  );
  const outer = metadata(byLabel(result, "Outer"));
  const middle = metadata(byLabel(result, "Middle"));
  const child = metadata(byLabel(result, "Child"));
  assert.equal(outer.clickFromChildren, true);
  assert.equal(outer.parent, undefined);
  assert.deepEqual(middle.classes, ["container"]);
  assert.equal(middle.parent, outer.name);
  assert.equal(middle.clickFromChildren, undefined);
  assert.equal(child.parent, middle.name);
  assert.equal(metadata(byLabel(result, "Nearby")).parent, undefined);
  assert.equal(metadata(byLabel(result, "Gap")), undefined);
  assert.deepEqual(
    result.excalidraw.elements.map((el) => el.id),
    base.excalidraw.elements.map((el) => el.id),
  );
  assert.equal(await result.toSvg(), await base.toSvg());
});

test("graph hooks can use a container title as the parent primitive", async () => {
  const base = await render(wrap(nested), { strict: true });
  const parentId = byLabel(base, "Middle").id;
  const result = await render(
    wrap(`@hook #parent element:${parentId} click-from-children
@hook #inside alias:child
${nested}`),
    { strict: true },
  );
  const parent = metadata(byLabel(result, "Middle"));
  assert.equal(parent.clickFromChildren, true);
  assert.equal(metadata(byLabel(result, "Child")).parent, parent.name);
});

test("explicit parents override graph ownership and can be forward references", async () => {
  const result = await render(
    wrap(`@hook #inside alias:child .nested CLICK-FROM-CHILDREN PARENT:#Away
@hook #outer alias:outer click-from-children
@hook #Away alias:nearby parent:#outer click-from-children
${nested}`),
    { strict: true },
  );
  const child = metadata(byLabel(result, "Child"));
  const other = metadata(byLabel(result, "Nearby"));
  assert.deepEqual(child.classes, ["nested"]);
  assert.equal(child.clickFromChildren, true);
  assert.equal(child.parent, other.name);
  assert.equal(other.clickFromChildren, true);
  assert.equal(other.parent, "outer");
});

test("explicit parents work for diagrams without graph ownership", async () => {
  const json = (preamble = "") => `@startjson\n${preamble}{"first":"one","second":"two"}\n@endjson`;
  const base = await render(json(), { strict: true });
  const first = byLabel(base, "one");
  const second = byLabel(base, "two");
  const result = await render(
    json(`@hook #first element:${first.id} parent:#second
@hook #second element:${second.id} click-from-children
`),
    { strict: true },
  );
  assert.equal(metadata(byLabel(result, "one")).parent, "second");
  assert.equal(metadata(byLabel(result, "two")).clickFromChildren, true);
});

test("multiple bound primitives on one graph ancestor require an explicit parent", async () => {
  const base = await render(wrap(`@hook #target alias:middle\n${nested}`), { strict: true });
  const titleId = byLabel(base, "Middle").id;
  const bodyId = base.excalidraw.elements.find(
    (el) => metadata(el)?.id === "target" && el.type === "rectangle",
  ).id;
  for (const parent of ["", " parent:#title"]) {
    const result = await render(
      wrap(`@hook #outer alias:outer click-from-children
@hook #title element:${titleId} click-from-children
@hook #body element:${bodyId} click-from-children
@hook #inside alias:child${parent}
${nested}`),
      { strict: true },
    );
    assert.equal(metadata(byLabel(result, "Child")).parent, parent ? "title" : undefined);
  }
});

test("missing and self-referential parents preserve the direct hooks in warning mode", async () => {
  for (const [parent, expected] of [
    ["unused", /Unknown bound parent hook "#unused"/],
    ["inside", /is its own parent/],
  ]) {
    const source = wrap(`@hook #outer alias:outer click-from-children
@hook #inside alias:child parent:#${parent}
${nested}`);
    await assert.rejects(render(source, { strict: true }), {
      code: "INVALID_HOOK",
      line: 3,
      message: expected,
    });
    const result = await render(source);
    assert.deepEqual(
      result.diagnostics.map(({ line }) => line),
      [3],
    );
    const child = metadata(byLabel(result, "Child"));
    assert.equal(child.id, "inside");
    assert.equal(child.parent, undefined);
  }
});

test("cycles in explicit parents are diagnosed and removed from the scene", async () => {
  const source = wrap(`@hook #outer alias:outer parent:#inside click-from-children
@hook #inside alias:child parent:#outer
@hook #nearby alias:nearby parent:#inside
${nested}`);
  await assert.rejects(render(source, { strict: true }), {
    code: "INVALID_HOOK",
    line: 2,
    message: /cyclic parent reference/,
  });
  const result = await render(source);
  assert.deepEqual(
    result.diagnostics.map(({ line }) => line),
    [2, 3],
  );
  assert.equal(metadata(byLabel(result, "Outer")).parent, undefined);
  assert.equal(metadata(byLabel(result, "Child")).parent, undefined);
  assert.equal(metadata(byLabel(result, "Nearby")).parent, "inside");
});

test("cycles between explicit and structural parents drop the explicit parent", async () => {
  const result = await render(
    wrap(`@hook #inside alias:child
@hook #outer alias:outer parent:#inside click-from-children
${nested}`),
  );
  assert.deepEqual(
    result.diagnostics.map(({ line }) => line),
    [3],
  );
  assert.equal(metadata(byLabel(result, "Outer")).parent, undefined);
  assert.equal(metadata(byLabel(result, "Child")).parent, "outer");
});
