import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { render, renderAll, THEMES } from "../src/index.mjs";

const graph = `component "Web" as web
component "Orders" as orders
web --> orders`;
const wrap = (source) => `@startuml\n${source}\n@enduml`;
const metadata = (element) => element.customData?.excaliplantHook;

test("the public hook specification example produces the documented bindings", async () => {
  const spec = await readFile(new URL("../docs/hooks.md", import.meta.url), "utf8");
  const diagram = spec.match(/^```plantuml\n([\s\S]+?)^```$/m)?.[1];
  assert.ok(diagram, "the specification must contain a runnable PlantUML example");
  const result = await render(diagram, { strict: true });
  const labels = result.excalidraw.elements.filter((el) => el.type === "text");
  const orders = metadata(labels.find((el) => el.text === "Orders"));
  const payments = metadata(labels.find((el) => el.text === "Payments"));
  assert.equal(orders.id, "orders");
  assert.equal(orders.clickMode, "button");
  assert.deepEqual(orders.classes, ["service", "navigation"]);
  assert.equal(orders.click.fill, "#ffd700");
  assert.equal(orders.hover.text, "#000080");
  assert.equal(payments.id, undefined);
  assert.equal(payments.clickMode, undefined);
  assert.deepEqual(payments.classes, ["service"]);
  assert.equal(payments.hover.text, "#000080");
});

test("hook click modes are case-insensitive and reject invalid or repeated modes", async () => {
  const declaration = "@hook #openOrders alias:orders";
  const result = await render(wrap(`${declaration} CLICK-MODE:TOGGLE\n${graph}`), {
    strict: true,
  });
  const parts = result.excalidraw.elements.filter(metadata);
  assert.ok(parts.length > 0);
  assert.ok(parts.every((part) => metadata(part).clickMode === "toggle"));
  for (const mode of ["click-mode:unknown", "click-mode:toggle CLICK-MODE:BUTTON"]) {
    await assert.rejects(render(wrap(`${declaration} ${mode}\n${graph}`), { strict: true }), {
      code: "INVALID_HOOK",
      line: 2,
    });
  }
});

test("hook aliases bind the whole component and reuse PlantUML styles and theme defaults", async () => {
  const text = "@hook openOrders alias:orders\n";
  const options = { strict: true, theme: "dark" };
  const [base, hooked] = await Promise.all([
    render(wrap(graph), options),
    render(
      wrap(
        text +
          "@hook openOrders hover FontColor navy\n" +
          "@hook openOrders hover LineStyle dotted\n" +
          "@hook openOrders click BackgroundColor: gold\n" +
          "@hook openOrders click FontSize 120\n" +
          "@hook openOrders click RoundCorner 10\n" +
          graph,
      ),
      { ...options, themeColors: { "roles.hook-hover.stroke": "#006688" } },
    ),
  ]);
  assert.equal(hooked.kind, "component");
  assert.deepEqual(hooked.diagnostics, []);
  assert.deepEqual(
    hooked.excalidraw.elements.map((el) => el.id),
    base.excalidraw.elements.map((el) => el.id),
  );
  const bound = hooked.excalidraw.elements.filter(metadata);
  assert.ok(bound.some((el) => el.text === "Orders"));
  assert.ok(bound.some((el) => el.type === "rectangle"));
  assert.ok(!bound.some((el) => el.text === "Web" || el.type === "arrow"));
  for (const el of bound) {
    const { name, hover, click } = metadata(el);
    assert.equal(name, "openOrders");
    assert.equal(hover.stroke, "#006688");
    assert.equal(hover.text, "#000080");
    assert.equal(hover.strokeStyle, "dotted");
    assert.equal(click.fill, "#ffd700");
    assert.equal(click.fontSize, 72);
    assert.equal(click.rounded, true);
  }
  assert.equal(await hooked.toSvg(), await base.toSvg());
});

test("an element-id hook reaches any primitive in a raw diagram", async () => {
  const payload = `{"label":"@hook literal alias:unchanged","value":10}`;
  const base = await render(`@startjson\n${payload}\n@endjson`, { strict: true });
  const target = base.excalidraw.elements.find((el) => el.type === "text");
  const result = await render(
    `@startjson\n@hook target element:${target.id}\n${payload}\n@endjson`,
    {
      strict: true,
    },
  );
  assert.equal(result.model.data.label, "@hook literal alias:unchanged");
  assert.deepEqual(
    result.excalidraw.elements.filter(metadata).map((el) => el.id),
    [target.id],
  );
});

test("a connector and its caption can have separate hooks with one class", async () => {
  const source = `component Sender as sender
component Receiver as receiver
sender --> receiver : dispatches`;
  const { excalidraw } = await render(wrap(source), { strict: true });
  const connector = excalidraw.elements.find((el) => el.type === "arrow");
  const caption = excalidraw.elements.find((el) => el.text === "dispatches");
  const result = await render(
    wrap(`@hook #dispatchLine element:${connector.id} .connection
@hook #dispatchLabel element:${caption.id} .connection
${source}`),
    { strict: true },
  );
  const targets = result.excalidraw.elements.filter(metadata);
  assert.deepEqual(
    targets.map((el) => [el.id, metadata(el).id, metadata(el).classes]),
    [
      [connector.id, "dispatchLine", ["connection"]],
      [caption.id, "dispatchLabel", ["connection"]],
    ],
  );
});

test("hooks can share several classes and an explicit ID wins over class styles", async () => {
  const result = await render(
    wrap(`@hook .service hover FontColor red
@hook .navigation hover FontColor blue
@hook #openOrders alias:orders .service .navigation
@hook alias:web .service .navigation .service
@hook #openOrders hover FontColor navy
${graph}`),
    { strict: true },
  );
  const labels = result.excalidraw.elements.filter((el) => el.type === "text");
  const orders = metadata(labels.find((el) => el.text === "Orders"));
  const web = metadata(labels.find((el) => el.text === "Web"));
  assert.equal(orders.id, "openOrders");
  assert.equal(web.id, undefined);
  assert.deepEqual(orders.classes, ["service", "navigation"]);
  assert.deepEqual(web.classes, ["service", "navigation"]);
  assert.equal(orders.hover.text, "#000080");
  assert.equal(web.hover.text, "#0000ff");
});

test("a raw diagram can begin with a literal @hook row", async () => {
  const result = await render("@startditaa\n@hook is a literal label\n@endditaa", { strict: true });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.excalidraw.elements.some((el) => el.text === "@hook is a literal label"));
});

test("custom theme roles can supply the same hook styles as the source", async () => {
  const theme = {
    ...THEMES.plain,
    roles: { ...THEMES.plain.roles, hookHover: { fontSize: 32, rounded: true } },
  };
  const result = await render(wrap(`@hook #openOrders alias:orders\n${graph}`), {
    strict: true,
    theme,
  });
  const { hover } = metadata(result.excalidraw.elements.find((el) => el.text === "Orders"));
  assert.equal(hover.fontSize, 32);
  assert.equal(hover.rounded, true);
  assert.equal(hover.text, THEMES.plain.roles.hookHover.text);
});

test("sequence participant hooks include the opening and closing captions", async () => {
  const result = await render(
    wrap(
      '@hook profile alias:api\nactor User as user\nparticipant "API" as api\nuser -> api : request',
    ),
    { strict: true },
  );
  const bound = result.excalidraw.elements.filter(metadata);
  assert.deepEqual(
    bound.filter((el) => el.type === "text").map((el) => el.text),
    ["API", "API"],
  );
  assert.ok(bound.some((el) => el.type === "rectangle"));
});

test("hooks are scoped to the selected page and preserve directive-like label content", async () => {
  const source = wrap(`@hook first alias:item
component Item as item
note right of item
  @hook example alias:literal
end note
newpage
@hook second alias:next
component Next as next`);
  const [first] = await renderAll(source, { strict: true });
  assert.ok(first.excalidraw.elements.some((el) => el.text === "@hook example alias:literal"));
  assert.deepEqual(
    new Set(first.excalidraw.elements.filter(metadata).map((el) => metadata(el).name)),
    new Set(["first"]),
  );
  const second = await render(source, { page: 1, strict: true });
  assert.deepEqual(
    new Set(second.excalidraw.elements.filter(metadata).map((el) => metadata(el).name)),
    new Set(["second"]),
  );
});

test("invalid and overlapping hooks report source lines and leave valid styling intact", async () => {
  const source = wrap(`@hook first alias:orders
@hook first hover FontColor url(javascript:alert(1))
@hook other alias:orders
@hook missing alias:__proto__
${graph}`);
  await assert.rejects(render(source, { strict: true }), { code: "INVALID_HOOK", line: 3 });
  const result = await render(source);
  assert.deepEqual(
    result.diagnostics.map((item) => item.line),
    [3, 4, 5],
  );
  assert.ok(
    result.excalidraw.elements.filter(metadata).every((el) => metadata(el).name === "first"),
  );
  assert.doesNotMatch(JSON.stringify(result.excalidraw), /javascript/);
});
