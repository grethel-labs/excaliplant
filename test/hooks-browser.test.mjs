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

test(
  "inline SVG hooks combine real pointer and keyboard input with normal links",
  { skip: !runBrowser },
  async (t) => {
    const { chromium } = await import("playwright-core");
    const args = ["--no-sandbox"];
    const browser = process.env.SITE_SMOKE_BROWSER
      ? await chromium.launch({ executablePath: process.env.SITE_SMOKE_BROWSER, args })
      : await chromium.launch({ channel: "chrome", args }).catch(() => chromium.launch({ args }));
    t.after(() => browser.close());
    const page = await browser.newPage();
    const result = await render(diagram, { strict: true, theme: "plain" });
    const svg = await result.toSvg({ interactive: true, padding: 0, embedFont: false });
    const [shape] = result.excalidraw.elements;
    const label = result.excalidraw.elements.find((el) => el.text === "Service");
    const linked = result.excalidraw.elements.find((el) => el.link === `${url}#linked`);
    await page.route(url, (route) =>
      route.fulfill({ contentType: "text/html", body: `<!doctype html><main>${svg}</main>` }),
    );
    await page.goto(url);
    const module = await readFile(new URL("../src/browser/hooks.mjs", import.meta.url), "utf8");
    await page.addScriptTag({
      type: "module",
      content: `${module}\nObject.assign(window, { bindHooks, onHook });`,
    });
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
