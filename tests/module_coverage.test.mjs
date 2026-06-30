import test from "node:test";
import assert from "node:assert/strict";

import { renderPlantUml } from "../index.mjs";
import { getModuleCoverageSuites } from "../docs/scripts/module-coverage-sources.mjs";

test("module coverage: every suite has several examples", async () => {
  const suites = await getModuleCoverageSuites();
  assert.ok(suites.length >= 20, "expected coverage suites for the built-in diagram modules");

  for (const suite of suites) {
    assert.ok(
      suite.examples.length >= 3,
      `${suite.kind} should have multiple small examples plus at least one complex combination example`,
    );
    const ids = new Set();
    for (const example of suite.examples) {
      assert.ok(example.id, `${suite.kind} example is missing an id`);
      assert.ok(!ids.has(example.id), `${suite.kind} has duplicate example id ${example.id}`);
      ids.add(example.id);
      assert.ok(example.title, `${suite.kind}/${example.id} is missing a title`);
      assert.ok(example.description, `${suite.kind}/${example.id} is missing a description`);
      assert.ok(
        example.source.includes("@start"),
        `${suite.kind}/${example.id} has no start marker`,
      );
    }
  }
});

test("module coverage: every example renders to SVG", async () => {
  const suites = await getModuleCoverageSuites();

  for (const suite of suites) {
    for (const example of suite.examples) {
      const result = renderPlantUml(example.source, {
        sourceLabel: `test.module-coverage.${suite.kind}.${example.id}`,
      });
      const doc = await result;
      assert.ok(
        doc.elements.length > 0,
        `${suite.kind}/${example.id} produced no Excalidraw elements`,
      );

      const svg = await result.toSvg({ canvas: false });
      assert.match(svg, /<svg\b/, `${suite.kind}/${example.id} did not produce an SVG root`);
      assert.match(svg, /<\/svg>/, `${suite.kind}/${example.id} did not close the SVG root`);
      assert.doesNotMatch(
        svg,
        /NaN|undefined/,
        `${suite.kind}/${example.id} leaked invalid SVG values`,
      );
    }
  }
});
