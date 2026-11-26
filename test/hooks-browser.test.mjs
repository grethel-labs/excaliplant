import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { render } from "../src/index.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";

const url = "https://example.test/dashboard";
const diagram = `@startuml
@hook #details alias:service .service .navigation
@hook details hover BackgroundColor #ffaaaa
@hook details hover FontColor #001122
@hook details hover LineStyle dashed
@hook details click BackgroundColor transparent
@hook details click FontColor transparent
@hook details click FontSize 36
@hook details click BorderColor #123456
@hook details click BorderThickness 5
@hook details click RoundCorner 10
@hook alias:linked .service .external
@tooltip alias:linked "Opens the linked service"
component Service as service
component Linked as linked [[${url}#linked]]
component Normal as normal [[${url}#normal]]
service --> linked
linked --> normal
@enduml`;

test("interactive SVG validates untrusted hook metadata and bounds its visual states", async () => {
  const result = await render(diagram, { strict: true, theme: "plain" });
  const doc = result.toJSON();
  const [shape] = doc.elements;
  const label = doc.elements.find((el) => el.text === "Service");
  const payload = '"><script>alert(1)</script><g onload="alert(2)';
  shape.id = payload;
  shape.customData.excaliplantHook = {
    name: "details",
    id: payload,
    classes: ["service", "service", payload],
    hover: {
      fill: payload,
      stroke: "url(javascript:alert(1))",
      strokeStyle: payload,
      rounded: "true",
    },
    click: { strokeWidth: 1e50 },
  };
  doc.elements[1].customData.excaliplantHook = { name: payload, id: "details" };
  label.customData.excaliplantHook = {
    name: "details",
    id: "details",
    hover: { text: payload, fontSize: Infinity },
    click: { fontSize: NaN },
  };
  const svg = excalidrawToSvg(doc, { interactive: true, embedFont: false });
  assert.doesNotMatch(svg, /<script|\sonload="|javascript:|Infinity|NaN/);
  assert.match(svg, /data-excaliplant-element-id="&quot;&gt;&lt;script&gt;/);
  assert.match(svg, /data-excaliplant-hook="details" data-excaliplant-hook-classes="service"/);
  assert.equal(svg.match(/data-excaliplant-hook="details"/g).length, 4);
  const count = (pattern) => svg.match(pattern)?.length ?? 0;
  assert.ok(count(/data-excaliplant-variant=/g) <= 3 * count(/data-excaliplant-hook=/g));
  assert.doesNotMatch(await result.toSvg({ embedFont: false }), /data-excaliplant/);
});

const runBrowser =
  process.env.EXCALIPLANT_HOOKS_BROWSER_TEST === "1" || Boolean(process.env.SITE_SMOKE_BROWSER);

async function openHookDiagram(t, source) {
  const { chromium } = await import("playwright-core");
  const args = ["--no-sandbox"];
  const browser = process.env.SITE_SMOKE_BROWSER
    ? await chromium.launch({ executablePath: process.env.SITE_SMOKE_BROWSER, args })
    : await chromium.launch({ channel: "chrome", args }).catch(() => chromium.launch({ args }));
  t.after(() => browser.close());
  const page = await browser.newPage();
  const result = await render(source, { strict: true, theme: "plain" });
  const svg = await result.toSvg({ interactive: true, padding: 0, embedFont: false });
  await page.route(url, (route) =>
    route.fulfill({ contentType: "text/html", body: `<!doctype html><main>${svg}</main>` }),
  );
  await page.goto(url);
  const module = await readFile(new URL("../src/browser/hooks.mjs", import.meta.url), "utf8");
  await page.addScriptTag({
    type: "module",
    content: `${module}\nObject.assign(window, { bindHooks, onHook });`,
  });
  return { page, result };
}

test(
  "inline SVG hooks combine real pointer and keyboard input with normal links",
  { skip: !runBrowser },
  async (t) => {
    const { page, result } = await openHookDiagram(t, diagram);
    const [shape] = result.excalidraw.elements;
    const label = result.excalidraw.elements.find((el) => el.text === "Service");
    const linked = result.excalidraw.elements.find((el) => el.link === `${url}#linked`);
    assert.ok(
      await page.evaluate(() => {
        window.events = [];
        window.idEvents = [];
        window.classEvents = [];
        document
          .querySelector("main")
          .addEventListener("excaliplant:hook", (event) => window.events.push(event.detail));
        const svg = document.querySelector("svg");
        window.cleanup = window.bindHooks(svg);
        window.unsubscribeId = window.onHook(svg, "#details", ({ detail }) =>
          window.idEvents.push(detail),
        );
        window.unsubscribeClass = window.onHook(svg, ".service", ({ detail }) =>
          window.classEvents.push(detail),
        );
        return window.cleanup === window.bindHooks(svg);
      }),
    );

    const part = (id) => page.locator(`[data-excaliplant-element-id="${id}"]`);
    const appearance = (id, tag) =>
      part(id).locator(`[data-excaliplant-variant]:not([display]) ${tag}`);
    const surface = appearance(shape.id, "rect");
    const caption = appearance(label.id, "text");
    const baseFill = await surface.getAttribute("fill");
    const shapeBox = await surface.boundingBox();
    const labelBox = await caption.boundingBox();
    assert.equal(await page.locator('[data-excaliplant-hook="details"][tabindex="0"]').count(), 1);
    assert.equal(
      await page.locator('[data-excaliplant-hook-classes~="external"] a[tabindex="0"]').count(),
      1,
    );

    const keyboardControl = part(shape.id);
    await page.keyboard.press("Tab");
    assert.equal(await keyboardControl.evaluate((el) => el === document.activeElement), true);
    assert.equal(await keyboardControl.getAttribute("role"), "button");
    await page.keyboard.press("Enter");
    assert.equal(await keyboardControl.getAttribute("aria-pressed"), "true");
    assert.equal(await surface.getAttribute("fill"), "none");
    assert.equal(await surface.getAttribute("rx"), "11");
    assert.equal(await surface.getAttribute("stroke"), "#123456");
    assert.equal(await surface.getAttribute("stroke-width"), "5");
    assert.equal(await caption.getAttribute("font-size"), "36");
    const viewport = await page.locator("svg").boundingBox();
    const enlarged = await caption.boundingBox();
    assert.ok(enlarged.x + enlarged.width <= viewport.x + viewport.width);
    await page.keyboard.press("Space");
    assert.equal(await keyboardControl.getAttribute("aria-pressed"), "false");
    assert.equal(await surface.getAttribute("fill"), baseFill);

    await page.mouse.move(shapeBox.x + 5, shapeBox.y + 5);
    assert.equal(await surface.getAttribute("fill"), "#ffaaaa");
    assert.ok(await surface.getAttribute("stroke-dasharray"));
    assert.equal(await caption.getAttribute("fill"), "#001122");
    await page.mouse.click(shapeBox.x + 5, shapeBox.y + 5);
    assert.equal(await caption.getAttribute("fill"), "transparent");
    assert.equal(await surface.getAttribute("fill"), "none");
    await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
    assert.equal(await surface.getAttribute("fill"), "#ffaaaa");
    await page.mouse.move(1, 1);
    assert.equal(await surface.getAttribute("fill"), baseFill);

    const event = (type, active, elementId, linked = false) => ({
      id: linked ? undefined : "details",
      classes: linked ? ["service", "external"] : ["service", "navigation"],
      type,
      active,
      elementId,
    });
    const serviceEvents = [
      event("click", true, shape.id),
      event("click", false, shape.id),
      event("hover", true, shape.id),
      event("click", true, shape.id),
      event("click", false, label.id),
      event("hover", false, label.id),
    ];
    assert.deepEqual(await page.evaluate(() => window.events), serviceEvents);
    assert.deepEqual(await page.evaluate(() => window.idEvents), serviceEvents);
    assert.deepEqual(await page.evaluate(() => window.classEvents), serviceEvents);
    await page.evaluate(() => window.unsubscribeId());

    const anchor = part(linked.id).locator("a");
    await anchor.focus();
    await page.keyboard.press("Enter");
    assert.equal(new URL(page.url()).hash, "#linked");
    assert.deepEqual(
      await page.evaluate(() => window.events.at(-1)),
      event("click", true, linked.id, true),
    );
    await anchor.evaluate((a) =>
      a.setAttribute("href", `${location.origin}${location.pathname}#space`),
    );
    await anchor.focus();
    await page.keyboard.press("Space");
    await page.waitForURL(`${url}#space`);
    assert.deepEqual(
      await page.evaluate(() => window.events.at(-1)),
      event("click", false, linked.id, true),
    );
    assert.deepEqual(await page.evaluate(() => window.classEvents), [
      ...serviceEvents,
      event("click", true, linked.id, true),
      event("click", false, linked.id, true),
    ]);
    await page.evaluate(() => window.unsubscribeClass());

    await page.mouse.move(shapeBox.x + 5, shapeBox.y + 5);
    assert.equal(await surface.getAttribute("fill"), "#ffaaaa");
    assert.equal(await page.evaluate(() => window.idEvents.length), serviceEvents.length);
    assert.equal(await page.evaluate(() => window.classEvents.length), serviceEvents.length + 2);
    const count = await page.evaluate(() => window.events.length);
    await page.evaluate(() => {
      window.cleanup();
      window.cleanup();
    });
    assert.equal(await surface.getAttribute("fill"), baseFill);
    assert.equal(await keyboardControl.getAttribute("tabindex"), null);
    await page.mouse.click(shapeBox.x + 5, shapeBox.y + 5);
    assert.equal(await page.evaluate(() => window.events.length), count);
    assert.equal(await surface.getAttribute("fill"), baseFill);
    const normal = page.locator(`a[href="${url}#normal"]`).first();
    await normal.click({ position: { x: 6, y: 6 } });
    assert.equal(new URL(page.url()).hash, "#normal");
  },
);

test(
  "button hooks respond once per activation and show the click style while held",
  { skip: !runBrowser },
  async (t) => {
    const { page, result } = await openHookDiagram(
      t,
      `@startuml
@hook #outer alias:outer click-mode:button click-from-children
@hook #inner alias:inner click-mode:toggle
@hook #outer click BackgroundColor gold
@tooltip alias:outer "Open the outer group"
package "Outer" as outer {
  component "Inner" as inner
}
@enduml`,
    );
    await page.evaluate(() => {
      window.clicks = [];
      const svg = document.querySelector("svg");
      svg.addEventListener("excaliplant:hook", ({ detail }) => {
        if (detail.type === "click") window.clicks.push(detail);
      });
      window.cleanup = window.bindHooks(svg);
    });
    const outer = page.getByRole("button", { name: "Outer", exact: true });
    const inner = page.getByRole("button", { name: "Inner", exact: true });
    const surface = result.excalidraw.elements.find(
      (element) =>
        element.type === "rectangle" && element.customData?.excaliplantHook?.id === "outer",
    );
    const part = page.locator(`[data-excaliplant-element-id="${surface.id}"]`);
    const visible = part.locator("[data-excaliplant-variant]:not([display])");
    const state = () => visible.getAttribute("data-excaliplant-variant");
    const clicks = () => page.evaluate(() => window.clicks.splice(0));
    const outerId = await outer.getAttribute("data-excaliplant-element-id");
    const innerId = await inner.getAttribute("data-excaliplant-element-id");
    const buttonClick = {
      id: "outer",
      classes: [],
      type: "click",
      clickMode: "button",
      active: true,
      elementId: outerId,
    };
    assert.equal(await outer.getAttribute("aria-pressed"), null);
    assert.equal(await part.locator(":scope > title").textContent(), "Open the outer group");
    const box = await visible.locator("rect").boundingBox();
    const point = [box.x + 7, box.y + box.height / 2];
    await page.mouse.move(...point);
    await page.mouse.down();
    assert.equal(await state(), "click");
    assert.deepEqual(await clicks(), []);
    await page.mouse.up();
    assert.equal(await state(), "hover");
    await page.mouse.click(...point);
    const pointerClick = { ...buttonClick, elementId: surface.id };
    assert.deepEqual(await clicks(), [pointerClick, pointerClick]);

    await page.mouse.down();
    await page.mouse.move(1, 1);
    await page.mouse.up();
    assert.equal(await state(), "base");
    assert.deepEqual(await clicks(), []);

    await outer.focus();
    await page.keyboard.down("Space");
    assert.equal(await state(), "click");
    assert.deepEqual(await clicks(), []);
    await page.keyboard.up("Space");
    assert.equal(await state(), "base");
    await page.keyboard.down("Enter");
    await page.keyboard.down("Enter");
    assert.equal(await state(), "click");
    await page.keyboard.up("Enter");
    assert.equal(await state(), "base");
    assert.deepEqual(await clicks(), [buttonClick, buttonClick]);

    await page.keyboard.down("Space");
    await inner.focus();
    assert.equal(await state(), "base");
    await outer.focus();
    await page.keyboard.up("Space");
    assert.deepEqual(await clicks(), []);

    await inner.focus();
    await page.keyboard.down("Space");
    assert.equal(await state(), "click");
    assert.equal(await inner.getAttribute("aria-pressed"), "false");
    await page.keyboard.up("Space");
    assert.equal(await state(), "base");
    assert.equal(await inner.getAttribute("aria-pressed"), "true");
    assert.deepEqual(await clicks(), [
      { id: "inner", classes: [], type: "click", active: true, elementId: innerId },
      { ...buttonClick, sourceElementId: innerId },
    ]);

    await page.mouse.move(...point);
    await page.mouse.down();
    assert.equal(await state(), "click");
    await page.evaluate(() => window.cleanup());
    await page.mouse.up();
    assert.equal(await state(), "base");
    assert.deepEqual(await clicks(), []);
  },
);

for (const forward of [false, true]) {
  test(
    forward
      ? "nested clicks reach an opted-in ancestor and skip the middle hook"
      : "nested hooks respond independently by default",
    { skip: !runBrowser },
    async (t) => {
      const { page, result } = await openHookDiagram(
        t,
        `@startuml
@hook #parent alias:outer .group${forward ? " click-from-children" : ""}
@hook #middle alias:middle
@hook #child alias:inner .leaf
@hook #parent hover BackgroundColor #fef0ad
@hook #middle hover BackgroundColor #d5f5e3
@hook #child hover BackgroundColor #fac0cb
@hook #parent click BackgroundColor #ffd76a
@hook #child click BackgroundColor #f1869a
package "Outer" as outer {
  package "Middle" as middle {
    component "Inner" as inner
  }
}
@enduml`,
      );
      await page.evaluate(() => {
        window.events = [];
        const svg = document.querySelector("svg");
        document
          .querySelector("main")
          .addEventListener("excaliplant:hook", ({ detail }) => window.events.push(detail));
        window.cleanup = window.bindHooks(svg);
      });

      const hooks = ["parent", "middle", "child"];
      const surfaces = hooks.map((id) =>
        result.excalidraw.elements.find(
          (el) => el.type === "rectangle" && el.customData?.excaliplantHook?.id === id,
        ),
      );
      const label = result.excalidraw.elements.find((el) => el.text === "Inner");
      const part = (id) => page.locator(`[data-excaliplant-element-id="${id}"]`);
      const appearance = (id, tag) =>
        part(id).locator(`[data-excaliplant-variant]:not([display]) ${tag}`);
      const controls = ["Outer", "Middle", "Inner"].map((name) =>
        page.getByRole("button", { name, exact: true }),
      );
      const [outerControlId, , innerControlId] = await Promise.all(
        controls.map((control) => control.getAttribute("data-excaliplant-element-id")),
      );
      const fills = () =>
        Promise.all(surfaces.map(({ id }) => appearance(id, "rect").getAttribute("fill")));
      const selected = () =>
        Promise.all(
          controls.map(async (control) => (await control.getAttribute("aria-pressed")) === "true"),
        );
      const events = () => page.evaluate(() => window.events.splice(0));
      const direct = (id, classes, type, active, elementId) => ({
        id,
        classes,
        type,
        active,
        elementId,
      });
      const outerHover = (active) => direct("parent", ["group"], "hover", active, surfaces[0].id);
      const innerHover = (active) => direct("child", ["leaf"], "hover", active, label.id);
      const innerClick = (active, id = label.id) => direct("child", ["leaf"], "click", active, id);
      const forwarded = (active, sourceElementId = label.id) => ({
        ...direct("parent", ["group"], "click", active, outerControlId),
        sourceElementId,
      });

      const [outerBase, middleBase, innerBase] = await fills();
      const outerBox = await appearance(surfaces[0].id, "rect").boundingBox();
      const labelBox = await appearance(label.id, "text").boundingBox();
      assert.ok(outerBox && labelBox);
      const outerPoint = [outerBox.x + 7, outerBox.y + outerBox.height / 2];
      const innerPoint = [labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2];

      await page.mouse.move(...outerPoint);
      assert.deepEqual(await fills(), ["#fef0ad", middleBase, innerBase]);
      await page.mouse.move(...innerPoint);
      assert.deepEqual(await fills(), [outerBase, middleBase, "#fac0cb"]);
      await page.mouse.move(...outerPoint);
      assert.deepEqual(await fills(), ["#fef0ad", middleBase, innerBase]);
      assert.deepEqual(await events(), [
        outerHover(true),
        outerHover(false),
        innerHover(true),
        innerHover(false),
        outerHover(true),
      ]);

      await page.mouse.click(...outerPoint);
      assert.deepEqual(await selected(), [true, false, false]);
      assert.deepEqual(await events(), [
        direct("parent", ["group"], "click", true, surfaces[0].id),
      ]);
      await page.mouse.click(...innerPoint);
      assert.deepEqual(await selected(), [!forward, false, true]);
      assert.deepEqual(await fills(), [forward ? outerBase : "#ffd76a", middleBase, "#f1869a"]);
      assert.deepEqual(await events(), [
        outerHover(false),
        innerHover(true),
        innerClick(true),
        ...(forward ? [forwarded(false)] : []),
      ]);

      await controls[2].focus();
      await page.keyboard.press("Enter");
      assert.deepEqual(await selected(), [true, false, false]);
      await page.keyboard.press("Space");
      assert.deepEqual(await selected(), [!forward, false, true]);
      assert.deepEqual(await events(), [
        innerClick(false, innerControlId),
        ...(forward ? [forwarded(true, innerControlId)] : []),
        innerClick(true, innerControlId),
        ...(forward ? [forwarded(false, innerControlId)] : []),
      ]);

      await page.evaluate(() => {
        const svg = document.querySelector("svg");
        const stop = window.onHook(svg, "#child", ({ detail }) => {
          if (detail.type !== "click") return;
          stop();
          window.cleanup();
        });
      });
      await page.mouse.click(...innerPoint);
      assert.deepEqual(await events(), [innerClick(false)]);
      assert.deepEqual(await fills(), [outerBase, middleBase, innerBase]);
      assert.equal(await page.locator("svg [aria-pressed]").count(), 0);
      await page.mouse.click(...innerPoint);
      assert.deepEqual(await events(), []);

      if (forward) {
        await page.evaluate(() => {
          const svg = document.querySelector("svg");
          window.bindHooks(svg);
          window.detachedParentEvents = [];
          window.onHook(svg, "#parent", ({ detail }) => window.detachedParentEvents.push(detail));
          window.onHook(svg, "#child", ({ detail }) => {
            if (detail.type === "click") svg.remove();
          });
        });
        await page.mouse.click(...innerPoint);
        assert.equal(await page.locator("svg").count(), 0);
        assert.deepEqual(await page.evaluate(() => window.detachedParentEvents), []);
      }
    },
  );
}
