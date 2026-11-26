#!/usr/bin/env node
// Smoke test of the built site (scripts/site.mjs) in a real headless browser.
//
//   node scripts/site-smoke.mjs [siteDir] [--shots <dir>]      (default siteDir: _site)
//
// Why it exists: the playground renders in a Web Worker, and the unit tests run
// the library in Node or in a vm sandbox. Neither starts a real worker, so a bug
// that only happens there (elkjs replacing the worker's message handler when it
// is loaded lazily, v1.4.0) shipped and nobody noticed. This script serves the
// built site the way GitHub Pages does (under /excaliplant/), opens it in
// Chromium and checks what a visitor sees: the playground renders, still renders
// after the layout engine has been loaded, element hooks work, plain-text links
// work, broken links are reported, and the gallery shows its images. Exit code
// 1 on any failure.
//
// Browser: $SITE_SMOKE_BROWSER (path to an executable) → Google Chrome from the
// system → Playwright's own Chromium (`npx playwright-core install chromium`).

import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Where GitHub Pages serves the site. */
export const MOUNT = "/excaliplant/";

const TYPES = /** @type {Record<string, string>} */ ({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".excalidraw": "application/json",
  ".puml": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
});

/**
 * Static file server for the built site, mounted at {@link MOUNT}.
 * Only GET and HEAD, nothing outside `root`.
 * @param {string} root
 * @returns {import("node:http").Server}
 */
export function createStaticServer(root) {
  const base = path.resolve(root);
  return createServer(async (req, res) => {
    const fail = (/** @type {number} */ code) => {
      res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(code));
    };
    try {
      if (req.method !== "GET" && req.method !== "HEAD") return fail(405);
      const url = new URL(req.url ?? "/", "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        res.writeHead(302, { location: MOUNT });
        return res.end();
      }
      if (!pathname.startsWith(MOUNT) || pathname.includes("\0")) return fail(404);
      pathname = pathname.slice(MOUNT.length);
      let file = path.resolve(base, pathname);
      if (file !== base && !file.startsWith(base + path.sep)) return fail(404);
      if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, "index.html");
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      fail(404);
    }
  });
}

/**
 * @param {import("playwright-core").BrowserType} chromium
 * @returns {Promise<import("playwright-core").Browser>}
 */
async function launchBrowser(chromium) {
  /** @type {import("playwright-core").LaunchOptions[]} */
  const attempts = [];
  if (process.env.SITE_SMOKE_BROWSER)
    attempts.push({ executablePath: process.env.SITE_SMOKE_BROWSER });
  attempts.push({ channel: "chrome" }, {});
  /** @type {unknown} */
  let last;
  for (const options of attempts) {
    try {
      return await chromium.launch({ ...options, args: ["--no-sandbox"] });
    } catch (err) {
      last = err;
    }
  }
  throw new Error(
    `No browser could be started (${String(/** @type {Error} */ (last)?.message ?? last).split("\n")[0]}). ` +
      "Install one with `npx playwright-core install chromium` or set SITE_SMOKE_BROWSER.",
  );
}

const STEP_TIMEOUT = 30_000;
const plain = (/** @type {string} */ text) => encodeURIComponent(text);

/**
 * Wait until the status line reports a finished render of this diagram kind.
 * @param {import("playwright-core").Page} page
 * @param {string} kind
 */
async function waitRendered(page, kind) {
  await page.waitForFunction(
    (k) =>
      new RegExp(`Rendered in \\d+ ms · ${k}\\b`).test(
        document.getElementById("status")?.textContent ?? "",
      ),
    kind,
    { timeout: STEP_TIMEOUT },
  );
}

/**
 * The status line is set a moment before the preview image (a blob URL) has been
 * decoded, so wait for the image instead of measuring it right away.
 * @param {import("playwright-core").Page} page
 */
async function previewIsShown(page) {
  await page
    .waitForFunction(
      () => {
        const img = /** @type {HTMLImageElement | null} */ (document.getElementById("preview"));
        return !!img && !img.hidden && img.complete && img.naturalWidth > 0;
      },
      null,
      { timeout: STEP_TIMEOUT },
    )
    .catch(() => {
      throw new Error("the preview image is missing or empty");
    });
}

/**
 * @param {string} dir Built site.
 * @param {{ shots?: string }} [options]
 * @returns {Promise<{ passed: number, failed: { name: string, reason: string }[] }>}
 */
export async function runSmoke(dir, options = {}) {
  const { chromium } = await import("playwright-core");
  const server = createStaticServer(dir);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  const base = `http://127.0.0.1:${port}${MOUNT}index.html`;
  const browser = await launchBrowser(chromium);
  /** @type {{ name: string, reason: string }[]} */
  const failed = [];
  let passed = 0;
  /** @type {string[]} */
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (options.shots) await mkdir(options.shots, { recursive: true });

  /**
   * @param {string} name
   * @param {import("playwright-core").Page} page
   * @param {() => Promise<void>} body
   */
  async function step(name, page, body) {
    try {
      await body();
      passed++;
      console.log(`ok   - ${name}`);
    } catch (err) {
      const reason = String(/** @type {Error} */ (err)?.message ?? err).split("\n")[0];
      failed.push({ name, reason });
      console.log(`FAIL - ${name}: ${reason}`);
      if (options.shots) {
        const file = path.join(options.shots, `${name.replace(/[^a-z0-9]+/gi, "-")}.png`);
        await page.screenshot({ path: file }).catch(() => undefined);
      }
    }
  }

  /** @returns {Promise<import("playwright-core").Page>} */
  async function open(/** @type {string} */ hash) {
    const page = await context.newPage();
    page.on("pageerror", (e) => pageErrors.push(String(e.message ?? e)));
    page.on("console", (m) => {
      if (m.type() === "error") pageErrors.push(m.text());
    });
    await page.goto(`${base}${hash}`, { waitUntil: "load" });
    return page;
  }

  try {
    // One page, one worker, several diagram kinds in a row: the sequence example
    // first (no layout engine), then graph diagrams that load ELK inside the
    // worker, then a sequence diagram again. The last one is the check that
    // failed in v1.4.0: the worker no longer answered after ELK had been loaded.
    const play = await open("#play");
    await step("playground renders its default example", play, async () => {
      await waitRendered(play, "sequence");
      await previewIsShown(play);
    });
    await step("the header switches to the matching brand asset", play, async () => {
      const original = await play.locator("html").getAttribute("data-theme");
      const alternate = original === "dark" ? "light" : "dark";
      for (const mode of [alternate, original]) {
        await play.locator("#theme-toggle").click();
        const logo = play.locator(`.brand .brand-${mode}`);
        await logo.waitFor({ state: "visible" });
        if (!(await logo.evaluate((image) => /** @type {HTMLImageElement} */ (image).naturalWidth)))
          throw new Error(`Header logo for ${mode} did not load`);
      }
    });
    await step(
      "a graph example renders (loads the layout engine in the worker)",
      play,
      async () => {
        await play.evaluate(() => (location.hash = "#play/class/shop-domain"));
        await waitRendered(play, "class");
        await previewIsShown(play);
      },
    );
    await step("a second graph example renders", play, async () => {
      await play.evaluate(() => (location.hash = "#play/state/order-lifecycle"));
      await waitRendered(play, "state");
    });
    await step("the worker still answers after the layout engine was loaded", play, async () => {
      await play.evaluate(() => (location.hash = "#play/sequence/checkout-flow"));
      await waitRendered(play, "sequence");
      await previewIsShown(play);
    });
    await step("the playground runs element hooks in a live preview", play, async () => {
      await play.evaluate(() => (location.hash = "#play/component/interactive-services"));
      await waitRendered(play, "component");
      const host = play.locator("#interactive-preview");
      const svg = host.locator(":scope > svg");
      const image = play.locator("#preview");
      const readout = play.locator("#hook-event");
      await svg.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      await image.waitFor({ state: "hidden", timeout: STEP_TIMEOUT });

      const orders = svg.getByRole("button", { name: "Orders", exact: true });
      const payments = svg.getByRole("button", { name: "Payments", exact: true });
      await orders.waitFor({ state: "visible", timeout: STEP_TIMEOUT });

      /** @param {string} state @param {string[]} tokens */
      async function hookEvent(state, tokens) {
        await readout.getByText(state, { exact: true }).waitFor({ timeout: STEP_TIMEOUT });
        const seen = await readout.locator("code").allTextContents();
        if (seen.join(" ") !== tokens.join(" "))
          throw new Error(`The hook readout showed ${seen.join(" ")} for ${state}`);
      }

      /** @param {string} state @param {string} color */
      async function ordersFill(state, color) {
        await svg
          .locator(
            `[data-excaliplant-hook-id="orders"] [data-excaliplant-variant="${state}"]:not([display]) :is([fill="${color}"], [stroke="${color}"])`,
          )
          .first()
          .waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      }

      await play.locator("#zoom-out").click();
      const width = await host.evaluate((el) => el.getBoundingClientRect().width);
      const box = await orders.boundingBox();
      if (!box) throw new Error("The Orders hook has no hit region");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await play.mouse.move(x, y);
      await hookEvent("Hover enter", ["#orders", ".service", ".navigation"]);
      const hitTitle = await play.evaluate(
        ({ x, y }) => {
          const target = document.elementFromPoint(x, y);
          return target?.closest("g:has(> title)")?.querySelector(":scope > title")?.textContent;
        },
        { x, y },
      );
      if (hitTitle !== "Tracks orders after checkout.")
        throw new Error(`The Orders hit target had the tooltip ${hitTitle}`);
      const storefront = svg.locator("g:not([data-excaliplant-hook]) > title");
      if (!(await storefront.allTextContents()).includes("Customers start checkout here."))
        throw new Error("The Storefront tooltip did not appear in the inline preview");
      await ordersFill("hover", "#ccfbf1");
      await play.mouse.click(x, y);
      await hookEvent("Click on", ["#orders", ".service", ".navigation"]);
      await ordersFill("click", "#99f6e4");
      await play.mouse.dblclick(x, y);
      if ((await host.evaluate((el) => el.getBoundingClientRect().width)) !== width)
        throw new Error("Double-clicking the Orders hook changed the preview zoom");

      await payments.focus();
      await play.keyboard.press("Enter");
      await hookEvent("Button click", [".service"]);
      if ((await payments.getAttribute("aria-pressed")) !== null)
        throw new Error("The Payments button exposes a toggle state");

      await play.locator("#btn-export").click();
      const pendingDownload = play.waitForEvent("download");
      await play.locator('[data-export="svg"]').click();
      const download = await pendingDownload;
      const exported = await readFile(await download.path(), "utf8");
      if (
        !exported.includes("<title>Tracks orders after checkout.</title>") ||
        exported.includes("data-excaliplant-hook")
      )
        throw new Error("The playground SVG export did not contain the static Orders diagram");

      await play.evaluate(() => (location.hash = "#play/sequence/checkout-flow"));
      await waitRendered(play, "sequence");
      await previewIsShown(play);
      await svg.waitFor({ state: "detached", timeout: STEP_TIMEOUT });
      await readout.waitFor({ state: "hidden", timeout: STEP_TIMEOUT });
    });
    await step(
      "local files render together or in the carousel without network requests",
      play,
      async () => {
        const requests = [];
        const collect = (request) => {
          if (request.url().startsWith("http")) requests.push(request.url());
        };
        play.on("request", collect);
        try {
          const local = (name, source) => ({
            name,
            mimeType: "text/plain",
            buffer: Buffer.from(source),
          });
          await play
            .locator("#project-files-input")
            .setInputFiles([
              local(
                "architecture.puml",
                "@startuml\ncomponent App\n!include parts/worker.iuml\n@enduml",
              ),
              local("worker.iuml", "component IncludedWorker"),
              local("login.puml", "@startuml\nClient -> Server : local sign-in\n@enduml"),
            ]);
          await waitRendered(play, "project");
          await previewIsShown(play);
          await play.locator("#btn-export").click();
          const combined = play.waitForEvent("download");
          await play.locator('[data-export="excalidraw"]').click();
          const download = await combined;
          const text = await readFile(await download.path(), "utf8");
          if (!text.includes("IncludedWorker") || !text.includes("local sign-in"))
            throw new Error("The combined download is missing one of the project diagrams");

          await play.locator("#project-output-mode").selectOption("carousel");
          await waitRendered(play, "component");
          await play.locator("#project-next").click();
          await waitRendered(play, "sequence");
          if (!(await play.locator("#project-current").textContent())?.includes("login.puml"))
            throw new Error("The second diagram is missing from the carousel");
          await play.locator("#btn-close-project").click();
          await waitRendered(play, "sequence");
          if (requests.length) throw new Error("Opening local files made a network request");
        } finally {
          play.off("request", collect);
        }
      },
    );
    await play.close();

    const tooltips = await open("#play/component/element-tooltips");
    await step("the Element tooltips example works without hooks", tooltips, async () => {
      const svg = tooltips.locator("#interactive-preview > svg");
      await svg.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      const titles = await svg.locator("g > title").allTextContents();
      if (
        !titles.includes("Receives customer orders.") ||
        !titles.includes("Queues order events for downstream services.")
      )
        throw new Error("The tooltip example did not show both tooltip texts");
      await tooltips.locator("#hook-event").waitFor({ state: "hidden", timeout: STEP_TIMEOUT });
    });
    await tooltips.close();

    const legacyStrokes = Buffer.from(
      JSON.stringify({
        v: 1,
        s: "@startgantt\nProject starts 2026-01-05\n[A] lasts 2 days\n[B] lasts 3 days\n[A] -> [B]\n@endgantt",
        o: { clean: true },
      }),
    ).toString("base64url");
    const strokes = await open(`#p=r${legacyStrokes}`);
    await step(
      "stroke presets and advanced overrides update and persist the preview",
      strokes,
      async () => {
        await waitRendered(strokes, "gantt");
        await previewIsShown(strokes);
        const options = strokes.locator("#btn-options");
        const preset = strokes.getByLabel("Stroke style");
        const advanced = strokes.getByText("Advanced stroke options", { exact: true });
        const shape = strokes.getByLabel("Shape roughness");
        const connector = strokes.getByLabel("Connector roughness");
        await options.click();
        if ((await preset.inputValue()) !== "architect" || (await shape.isVisible()))
          throw new Error(
            "Legacy clean strokes did not open in Architect with advanced options collapsed",
          );

        /** @param {() => Promise<void>} change */
        async function refreshPreview(change) {
          const before = await strokes.locator("#preview").getAttribute("src");
          await change();
          await strokes.waitForFunction(
            (src) => document.getElementById("preview")?.getAttribute("src") !== src,
            before,
            { timeout: STEP_TIMEOUT },
          );
          await previewIsShown(strokes);
        }

        await refreshPreview(async () => {
          await preset.selectOption("cartoonist");
        });
        await advanced.click();
        await refreshPreview(async () => {
          await shape.fill("0.75");
          await connector.fill("0.35");
        });

        await strokes.reload({ waitUntil: "load" });
        await waitRendered(strokes, "gantt");
        await options.click();
        await advanced.click();
        if (
          (await preset.inputValue()) !== "cartoonist" ||
          (await shape.inputValue()) !== "0.75" ||
          (await connector.inputValue()) !== "0.35"
        )
          throw new Error("Stroke options changed after reloading the page");

        await refreshPreview(async () => {
          await preset.selectOption("artist");
        });
        if ((await shape.inputValue()) || (await connector.inputValue()))
          throw new Error("Switching the stroke preset did not clear the overrides");

        await refreshPreview(async () => {
          await strokes.locator("#opt-reset").click();
        });
        if ((await preset.inputValue()) !== "theme")
          throw new Error("Reset options did not restore the theme stroke preset");
      },
    );
    await strokes.close();

    // A fresh worker per link, as when someone opens a shared link.
    const link = await open(
      `#src=${plain("@startuml\nclass A\nclass B\nA --> B : uses\n@enduml")}`,
    );
    await step("a plain-text link to a graph diagram renders", link, async () => {
      await waitRendered(link, "class");
      await previewIsShown(link);
      const text = await link.evaluate(() => document.body.innerText);
      if (!text.includes("class B")) throw new Error("the text of the link is not in the editor");
    });
    await step("a plain-text link after a graph diagram renders", link, async () => {
      await link.evaluate(
        (h) => (location.hash = h),
        `#src=${plain("@startuml\nAlice -> Bob : hi\n@enduml")}`,
      );
      await waitRendered(link, "sequence");
    });
    await link.close();

    const broken = await open("#src=%E0%A4%A");
    await step("a broken link is reported and the page keeps working", broken, async () => {
      await broken.waitForFunction(() => /could not be read/i.test(document.body.innerText), null, {
        timeout: STEP_TIMEOUT,
      });
      await waitRendered(broken, "[a-z]+");
    });
    await broken.close();

    const gallery = await open("#gallery");
    await step("the gallery shows its diagram", gallery, async () => {
      await gallery.waitForFunction(
        () => {
          const img = /** @type {HTMLImageElement | null} */ (document.getElementById("g-img"));
          return !!img && img.complete && img.naturalWidth > 0;
        },
        null,
        { timeout: STEP_TIMEOUT },
      );
    });
    await gallery.close();

    // Errors are only judged at the end: they explain a failure above and catch
    // problems no single step looks at (CSP violations, uncaught exceptions).
    if (pageErrors.length) {
      failed.push({ name: "no page errors", reason: pageErrors[0].slice(0, 200) });
      console.log(`FAIL - no page errors: ${pageErrors[0].slice(0, 200)}`);
    } else {
      passed++;
      console.log("ok   - no page errors");
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
  return { passed, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const shotsAt = args.indexOf("--shots");
  const shots = shotsAt >= 0 ? args.splice(shotsAt, 2)[1] : undefined;
  const project = fileURLToPath(new URL("..", import.meta.url));
  const root = path.resolve(project, args[0] ?? "_site");
  runSmoke(root, { shots })
    .then(({ passed, failed }) => {
      console.log(`\n${passed} passed, ${failed.length} failed`);
      if (failed.length) process.exit(1);
      execFileSync(process.execPath, ["--test", "test/hooks-browser.test.mjs"], {
        cwd: project,
        env: { ...process.env, EXCALIPLANT_HOOKS_BROWSER_TEST: "1" },
        stdio: "inherit",
      });
    })
    .catch((err) => {
      console.error(`site-smoke: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}
