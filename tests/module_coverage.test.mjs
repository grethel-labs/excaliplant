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
      assertDiamondTextFits(doc, `${suite.kind}/${example.id}`);
      assertEndpointLabelsFitAndUseLineColor(doc, `${suite.kind}/${example.id}`);

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

/**
 * @param {{elements:Array<Record<string, any>>}} doc
 * @param {string} label
 */
function assertDiamondTextFits(doc, label) {
  const diamonds = doc.elements.filter((element) => element.customData?.role === "diamondShape");
  for (const diamond of diamonds) {
    const boxId = diamond.customData?.boxId;
    const bounds = diamondBounds(diamond);
    const texts = doc.elements.filter(
      (element) =>
        (element.customData?.role === "diamondTitleText" ||
          element.customData?.role === "diamondStereotypeText") &&
        element.customData?.boxId === boxId,
    );
    for (const text of texts) {
      for (const [x, y] of elementCorners(text)) {
        const normalized =
          Math.abs(x - bounds.cx) / Math.max(1, bounds.rx) +
          Math.abs(y - bounds.cy) / Math.max(1, bounds.ry);
        assert.ok(
          normalized <= 1.04,
          `${label}: diamond text for ${boxId} escapes visible diamond bounds`,
        );
      }
    }
  }
}

/**
 * @param {{elements:Array<Record<string, any>>}} doc
 * @param {string} label
 */
function assertEndpointLabelsFitAndUseLineColor(doc, label) {
  const labels = doc.elements.filter(
    (element) => element.customData?.role === "arrowEndpointLabel",
  );
  const chips = doc.elements.filter(
    (element) => element.customData?.role === "arrowEndpointLabelChip",
  );
  for (const text of labels) {
    const chip = chips.find(
      (candidate) =>
        candidate.customData?.connectionId === text.customData?.connectionId &&
        candidate.customData?.endpoint === text.customData?.endpoint,
    );
    assert.ok(chip, `${label}: missing endpoint chip for ${text.customData?.connectionId}`);
    assert.equal(text.strokeColor, text.customData?.lineColor, `${label}: label colour mismatch`);
    assert.equal(chip.strokeColor, text.customData?.lineColor, `${label}: chip colour mismatch`);
    assert.ok(text.fontSize >= 12, `${label}: endpoint label font is too small`);
    assert.ok(text.x >= chip.x, `${label}: endpoint text starts before chip`);
    assert.ok(text.y >= chip.y, `${label}: endpoint text starts above chip`);
    assert.ok(text.x + text.width <= chip.x + chip.width + 0.5, `${label}: endpoint text overflow`);
    assert.ok(
      text.y + text.height <= chip.y + chip.height + 0.5,
      `${label}: endpoint text height overflow`,
    );
  }
}

/**
 * @param {Record<string, any>} diamond
 * @returns {{cx:number,cy:number,rx:number,ry:number}}
 */
function diamondBounds(diamond) {
  const points = diamond.points.map(([dx, dy]) => [diamond.x + dx, diamond.y + dy]);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
  };
}

/**
 * @param {Record<string, any>} element
 * @returns {Array<[number, number]>}
 */
function elementCorners(element) {
  return [
    [element.x, element.y],
    [element.x + element.width, element.y],
    [element.x + element.width, element.y + element.height],
    [element.x, element.y + element.height],
  ];
}
