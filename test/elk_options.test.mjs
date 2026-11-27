// Guards for the ELK layout options. Quality beats speed: an option may only change if the output stays
// bit-identical on a wide corpus (see "ELK options" in docs/performance.md and scripts/elk-experiments.mjs).
// No option change was adopted, so these tests pin the quality-relevant options and the corpus generator.

import { test } from "node:test";
import assert from "node:assert/strict";
import ELK from "elkjs/lib/elk.bundled.js";
import { render } from "../src/index.mjs";
import { randomSources } from "../scripts/elk-corpus.mjs";

/**
 * Render with the layout cache off and return the graphs handed to ELK.
 * @param {string} src
 * @returns {Promise<any[]>}
 */
async function elkInputs(src) {
  const proto = /** @type {any} */ (ELK).prototype;
  const original = proto.layout;
  /** @type {any[]} */
  const seen = [];
  proto.layout = function (/** @type {any} */ graph, /** @type {any} */ opts) {
    seen.push(JSON.parse(JSON.stringify(graph)));
    return original.call(this, graph, opts);
  };
  try {
    await render(src, { layoutCache: false });
  } finally {
    proto.layout = original;
  }
  return seen;
}

const CLASS_SRC = `@startuml
package core {
  class Base
  class Worker
}
class Client
Base <|-- Worker
Client "1" --> "*" Worker : uses
Client ..> Base
@enduml`;

test("ELK root options keep the quality settings", async () => {
  const [graph] = await elkInputs(CLASS_SRC);
  const o = graph.layoutOptions;
  assert.equal(o["elk.algorithm"], "layered");
  assert.equal(o["elk.hierarchyHandling"], "INCLUDE_CHILDREN");
  assert.equal(o["elk.layered.thoroughness"], "10");
  assert.equal(o["elk.layered.nodePlacement.strategy"], "NETWORK_SIMPLEX");
  assert.equal(o["elk.layered.considerModelOrder.strategy"], "NODES_AND_EDGES");
  assert.equal(o["elk.layered.cycleBreaking.strategy"], "DEPTH_FIRST");
  assert.equal(o["elk.edgeRouting"], "ORTHOGONAL");
});

test("containers repeat the spacing options (they are not inherited)", async () => {
  const [graph] = await elkInputs(CLASS_SRC);
  const container = graph.children.find((/** @type {any} */ c) => c.children?.length);
  assert.ok(container, "package becomes a compound node");
  assert.equal(
    container.layoutOptions["elk.spacing.nodeNode"],
    graph.layoutOptions["elk.spacing.nodeNode"],
  );
});

test("decision diamonds get side-fixed ports", async () => {
  const [graph] = await elkInputs(`@startuml
[*] --> A
state c <<choice>>
A --> c
c --> B : [ok]
c --> A : [retry]
@enduml`);
  const choice = graph.children.find((/** @type {any} */ c) => c.ports?.length);
  assert.ok(choice);
  assert.equal(choice.layoutOptions["elk.portConstraints"], "FIXED_SIDE");
});

test("a failed optional wrap keeps the regular layout", async () => {
  const source = `@startuml
class A
class B
class C
A --> B : first
B --> C : second
@enduml`;
  const normal = await render(source, { layoutCache: false });
  const proto = /** @type {any} */ (ELK).prototype;
  const original = proto.layout;
  let wrapAttempts = 0;
  proto.layout = function (graph, options) {
    if (graph.layoutOptions["elk.layered.wrapping.strategy"]) {
      wrapAttempts++;
      throw new Error("Cannot route the wrapped graph");
    }
    return original.call(this, graph, options);
  };
  try {
    const hinted = await render(source, { aspectRatio: 16 / 9, layoutCache: false });
    assert.equal(wrapAttempts, 1);
    assert.deepEqual(hinted.excalidraw, normal.excalidraw);
  } finally {
    proto.layout = original;
  }
});

test("the experiment corpus is deterministic and renders through ELK", async () => {
  const a = randomSources(8);
  const b = randomSources(8);
  assert.deepEqual(a, b);
  for (const { src } of a) assert.ok((await elkInputs(src)).length >= 1, "runs ELK");
});
