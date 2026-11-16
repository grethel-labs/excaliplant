// Visual-quality contracts for the LaTeX / AsciiMath formula modules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/index.mjs";

/** @param {string} body @param {string} [kind] */
async function texts(body, kind = "latex") {
  const r = await render(`@start${kind}\n${body}\n@end${kind}`);
  return r.excalidraw.elements.filter((e) => e.type === "text");
}

/** @param {string} body */
async function elements(body) {
  const r = await render(`@startlatex\n${body}\n@endlatex`);
  return r.excalidraw.elements;
}

test("\\binom, \\dbinom, \\tbinom and {n \\choose k} stack n over k inside brackets without a rule", async () => {
  for (const src of ["\\binom{n}{k}", "\\dbinom{n}{k}", "\\tbinom{n}{k}", "{n \\choose k}"]) {
    const els = await elements(src);
    const t = els.filter((e) => e.type === "text");
    assert.deepEqual(
      t.map((e) => e.text),
      ["n", "k"],
      src,
    );
    assert.ok(!t.some((e) => /binom|choose/.test(e.text)), src);
    const [n, k] = t;
    assert.ok(k.y > n.y + n.height * 0.5, `${src}: k must sit below n`);
    // no fraction rule: only the two curved brackets are drawn
    const lines = els.filter((e) => e.type === "line" || e.type === "arrow");
    assert.equal(lines.length, 2, `${src}: expected two bracket strokes`);
    const [l, r] = lines.sort((a, b) => a.x - b.x);
    assert.ok(l.x + l.width <= n.x + 1 && r.x >= n.x + n.width - 1, `${src}: brackets enclose`);
  }
});

test("\\binom with a missing argument does not swallow \\right", async () => {
  const t = await texts("\\left( \\binom k \\right)");
  assert.ok(!t.some((e) => /binom|right/.test(e.text)));
});

test("integral limits hang at the integral sign, not centred under a wide limit", async () => {
  const t = await texts("\\int_{-\\infty}^{\\infty} f");
  const [int, upper, minus, lower] = t;
  assert.equal(int.text, "∫");
  assert.equal(upper.text, "∞");
  assert.equal(lower.text, "∞");
  // the lower limit may start at most a hair left of the sign's right edge ...
  assert.ok(minus.x >= int.x + int.width * 0.3, `lower limit starts left of the sign (${minus.x})`);
  // ... and ends no further right than the upper limit does, so they line up.
  assert.ok(lower.x + lower.width <= upper.x + upper.width + int.width * 0.7);
  assert.ok(upper.y < int.y + int.height / 2 && minus.y > int.y + int.height / 2);
  // no gap between the unary minus and the infinity sign
  assert.ok(lower.x - (minus.x + minus.width) < 4, "gap between minus and infinity");
});

test("big operators other than integrals keep centred limits", async () => {
  const t = await texts("\\sum_{k=0}^{n} k");
  const sum = t.find((e) => e.text === "∑");
  const n = t.find((e) => e.text === "n");
  assert.ok(Math.abs(n.x + n.width / 2 - (sum.x + sum.width / 2)) < 4);
});

test("a subscript hangs directly at its base", async () => {
  const t = await texts("a_n");
  const [a, n] = t;
  const gapX = n.x - (a.x + a.width);
  assert.ok(gapX < 3, `subscript is ${gapX}px right of the base`);
  const baseBottom = a.y + a.height;
  assert.ok(n.y + n.height - baseBottom < a.height * 0.35, "subscript drops too far");
  assert.ok(n.y > a.y, "subscript is below the top of the base");
});

test("limit subscripts and plain symbols are not padded like operators", async () => {
  const t = await texts("\\lim_{n \\to \\infty} a_n");
  const [a, n] = t.slice(-2);
  assert.equal(a.text, "a");
  assert.ok(n.x - (a.x + a.width) < 3);
  const alpha = await texts("\\alpha\\beta");
  const gap = alpha[1].x - (alpha[0].x + alpha[0].width);
  assert.ok(gap < 2, `greek letters are ${gap}px apart`);
});
