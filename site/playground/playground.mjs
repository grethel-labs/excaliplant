// The playground view: editor, options, live rendering, export and sharing.

import { byId, h } from "./dom.mjs";
import { createEditor } from "./editor.mjs";
import { createEngineClient } from "./engine.mjs";
import { download, copyText, fileStem, svgToPngBlob } from "./export.mjs";
import { filterExamples, findExample } from "./examples.mjs";
import {
  KIND_CHOICES,
  MAX_SOURCE_BYTES,
  normalizeOptions,
  parseDefines,
  toRenderOptions,
} from "./options.mjs";
import { decodeState, encodeState, loadSaved, safeStorage, save } from "./state.mjs";

/** Debounce between the last keystroke and the render request. */
export const RENDER_DEBOUNCE_MS = 150;

const DEFAULT_EXAMPLE = "sequence/lifecycle";

/**
 * @param {{
 *   index: import("./examples.mjs").ExampleGroup[],
 *   workerUrl: string,
 *   isDark: () => boolean,
 *   onVersion?: (version: string) => void,
 * }} config
 */
export function initPlayground(config) {
  const storage = safeStorage();
  const { index } = config;
  const enc = new TextEncoder();

  /** @type {string} */
  let source = "";
  let options = normalizeOptions({});
  /** @type {string | null} */
  let exampleId = null;
  let seq = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let renderTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let busyTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let saveTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let toastTimer = null;
  /** @type {{ svg: string, width: number, height: number, title: string | null } | null} */
  let last = null;
  /** @type {string | null} */
  let blobUrl = null;
  /** @type {"fit" | number} */
  let zoom = "fit";

  const status = byId("status");
  const panes = byId("panes");
  const canvas = byId("canvas");
  const preview = /** @type {HTMLImageElement} */ (byId("preview"));
  const placeholder = byId("placeholder");
  const diagnostics = byId("diagnostics");
  const toast = byId("toast");

  const editor = createEditor(byId("editor"), {
    label: "PlantUML source",
    onChange(value) {
      source = value;
      exampleId = null;
      byId("example-label").textContent = "";
      persistSoon();
      schedule(false);
    },
    onRun: () => schedule(true),
  });

  const engine = createEngineClient({
    workerUrl: config.workerUrl,
    onReady: (v) => config.onVersion?.(v),
    // "page" means the browser refused to start a worker and rendering runs in the page.
    onMode: (mode) => document.documentElement.setAttribute("data-engine", mode),
  });

  // ---- small helpers ---------------------------------------------------

  /** @param {string} text */
  function say(text) {
    toast.textContent = text;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  /**
   * @param {string} text
   * @param {"" | "busy" | "error"} [kind]
   */
  function setStatus(text, kind = "") {
    status.textContent = text;
    status.className = `status ${kind}`.trim();
  }

  function persistSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 400);
  }
  function persistNow() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    save(storage, { source, options });
  }
  addEventListener("pagehide", persistNow);

  // ---- rendering -------------------------------------------------------

  /** @param {boolean} immediate */
  function schedule(immediate) {
    if (renderTimer) clearTimeout(renderTimer);
    if (!immediate && enc.encode(source).length > MAX_SOURCE_BYTES) {
      seq++;
      showError({
        error: `Input exceeds ${MAX_SOURCE_BYTES / 1024} KB. Shorten the text.`,
        line: null,
      });
      return;
    }
    renderTimer = setTimeout(run, immediate ? 0 : RENDER_DEBOUNCE_MS);
  }

  async function run() {
    renderTimer = null;
    const mine = ++seq;
    if (!source.trim()) {
      showEmpty();
      return;
    }
    if (busyTimer) clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      if (mine === seq) setStatus(last ? "Rendering…" : "Loading engine…", "busy");
    }, 200);
    const mapped = toRenderOptions(options, { pageDark: config.isDark() });
    const res = await engine.render(source, mapped.render, mapped.svg);
    if (mine !== seq) return; // a newer render was requested: drop this one
    if (busyTimer) clearTimeout(busyTimer);
    if (res.superseded || res.type === "stale") return;
    if (res.retry) return schedule(true);
    if (res.ok) showResult(res);
    else showError(res);
  }

  function showEmpty() {
    if (busyTimer) clearTimeout(busyTimer);
    last = null;
    preview.hidden = true;
    placeholder.textContent = "Write some PlantUML to see it here.";
    placeholder.className = "placeholder";
    canvas.classList.remove("stale");
    setStatus("Nothing to render");
    showDiagnostics([]);
    editor.setMarks(new Map());
  }

  /** @param {any} res */
  function showResult(res) {
    last = { svg: res.svg, width: res.width, height: res.height, title: res.title };
    const url = URL.createObjectURL(new Blob([res.svg], { type: "image/svg+xml" }));
    const old = blobUrl;
    blobUrl = url;
    preview.onload = () => {
      if (old) URL.revokeObjectURL(old);
      applyZoom();
    };
    preview.src = url;
    preview.alt = res.title ? `Diagram: ${res.title}` : `${res.kind} diagram`;
    preview.hidden = false;
    placeholder.className = "placeholder";
    canvas.classList.remove("stale");
    updateStructureFields(res);
    const warnings = res.diagnostics.length;
    setStatus(
      `Rendered in ${res.ms} ms · ${res.kind}${warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}`,
    );
    /** @type {Map<number, "error" | "warning" | "info">} */
    const marks = new Map();
    for (const d of res.diagnostics)
      if (d.line && !marks.has(d.line)) marks.set(d.line, d.severity);
    showDiagnostics(res.diagnostics);
    editor.setMarks(marks);
  }

  /** @param {{ error: string, line: number | null }} res */
  function showError(res) {
    setStatus(res.line ? `Error in line ${res.line}` : "Error", "error");
    if (last) canvas.classList.add("stale");
    else {
      placeholder.textContent = res.error;
      placeholder.className = "placeholder error";
    }
    const item = { severity: "error", message: res.error, line: res.line };
    const marks = new Map();
    if (res.line) marks.set(res.line, "error");
    showDiagnostics([item]);
    editor.setMarks(marks);
  }

  /**
   * @param {{ severity: string, message: string, line: number | null }[]} items
   */
  function showDiagnostics(items) {
    const list = byId("diagnostics-list");
    list.replaceChildren();
    diagnostics.hidden = items.length === 0;
    byId("diagnostics-count").textContent = items.length ? `(${items.length})` : "";
    diagnostics.setAttribute(
      "role",
      items.some((i) => i.severity === "error") ? "alert" : "region",
    );
    diagnostics.setAttribute("aria-label", "Problems");
    for (const d of items) {
      const where = h("span", { class: "where" }, [d.line ? `L${d.line}` : "—"]);
      const what = h("span", { class: "what" }, [d.message]);
      const b = h("button", { type: "button", title: d.line ? `Go to line ${d.line}` : "" }, [
        where,
        what,
      ]);
      if (d.line) {
        b.addEventListener("click", () => {
          showPane("editor");
          editor.goToLine(/** @type {number} */ (d.line));
        });
      } else b.disabled = true;
      list.append(h("li", { class: `sev-${d.severity}` }, [b]));
    }
  }

  /**
   * Show the page and block selectors only when the document has them.
   * @param {{ pages: number, blocks: { name: string | null, line: number }[] }} res */
  function updateStructureFields(res) {
    byId("field-page").hidden = !(res.pages > 1 || options.page > 0);
    const blockField = byId("field-block");
    blockField.hidden = !(res.blocks.length > 1 || options.block > 0);
    const select = /** @type {HTMLSelectElement} */ (byId("opt-block"));
    const count = Math.max(res.blocks.length, options.block + 1);
    if (
      select.options.length !== count ||
      blockField.dataset.sig !== res.blocks.map((b) => b.name).join("|")
    ) {
      select.replaceChildren();
      for (let i = 0; i < count; i++) {
        const b = res.blocks[i];
        select.append(
          new Option(`${i + 1}${b?.name ? `: ${b.name}` : ""} (line ${b?.line ?? "?"})`, String(i)),
        );
      }
      blockField.dataset.sig = res.blocks.map((b) => b.name).join("|");
    }
    select.value = String(options.block);
  }

  // ---- zoom and pan ----------------------------------------------------

  function fitScale() {
    if (!last) return 1;
    const cs = getComputedStyle(canvas);
    const w =
      canvas.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
    const hgt =
      canvas.clientHeight - Number.parseFloat(cs.paddingTop) - Number.parseFloat(cs.paddingBottom);
    return Math.max(0.05, Math.min(1.5, w / last.width, hgt / last.height));
  }
  function currentScale() {
    return zoom === "fit" ? fitScale() : zoom;
  }
  function applyZoom() {
    if (!last) return;
    const s = currentScale();
    preview.style.setProperty("width", `${Math.round(last.width * s)}px`);
    preview.style.setProperty("height", `${Math.round(last.height * s)}px`);
  }
  /** @param {number} factor */
  function zoomBy(factor) {
    zoom = Math.min(8, Math.max(0.1, currentScale() * factor));
    applyZoom();
  }
  byId("zoom-in").addEventListener("click", () => zoomBy(1.25));
  byId("zoom-out").addEventListener("click", () => zoomBy(0.8));
  byId("zoom-fit").addEventListener("click", () => {
    zoom = "fit";
    applyZoom();
    canvas.scrollTo(0, 0);
  });
  new ResizeObserver(() => zoom === "fit" && applyZoom()).observe(canvas);
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "0") {
      zoom = "fit";
      applyZoom();
    } else return;
    e.preventDefault();
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    },
    { passive: false },
  );
  /** @type {{ x: number, y: number, left: number, top: number } | null} */
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    canvas.scrollLeft = drag.left - (e.clientX - drag.x);
    canvas.scrollTop = drag.top - (e.clientY - drag.y);
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", () => {
    zoom = zoom === "fit" ? 1 : "fit";
    applyZoom();
  });

  // ---- panes (narrow screens) -------------------------------------------

  /** @param {"editor" | "preview"} which */
  function showPane(which) {
    panes.dataset.active = which;
    for (const name of ["editor", "preview"]) {
      byId(`tab-${name}`).setAttribute("aria-selected", String(name === which));
    }
    if (which === "preview") requestAnimationFrame(applyZoom);
  }
  byId("tab-editor").addEventListener("click", () => showPane("editor"));
  byId("tab-preview").addEventListener("click", () => showPane("preview"));

  // ---- popovers ----------------------------------------------------------

  /** @type {{ pop: HTMLElement, btn: HTMLElement } | null} */
  let openPop = null;
  /**
   * @param {HTMLElement} pop
   * @param {HTMLElement} btn
   */
  function togglePopover(pop, btn) {
    const wasOpen = openPop?.pop === pop;
    closePopover(false);
    if (wasOpen) return;
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    openPop = { pop, btn };
    const first = pop.querySelector("button, select, input");
    /** @type {HTMLElement | null} */ (first)?.focus();
  }
  /** @param {boolean} restoreFocus */
  function closePopover(restoreFocus) {
    if (!openPop) return;
    openPop.pop.hidden = true;
    openPop.btn.setAttribute("aria-expanded", "false");
    if (restoreFocus) openPop.btn.focus();
    openPop = null;
  }
  byId("btn-options").addEventListener("click", () =>
    togglePopover(byId("options"), byId("btn-options")),
  );
  byId("btn-export").addEventListener("click", () =>
    togglePopover(byId("export-menu"), byId("btn-export")),
  );
  document.addEventListener("pointerdown", (e) => {
    if (!openPop) return;
    const t = /** @type {Node} */ (e.target);
    if (!openPop.pop.contains(t) && !openPop.btn.contains(t)) closePopover(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openPop) {
      e.stopPropagation();
      closePopover(true);
    }
  });
  byId("export-menu").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...byId("export-menu").querySelectorAll("button")];
    const at = items.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
    e.preventDefault();
  });

  // ---- options -----------------------------------------------------------

  const $ = (/** @type {string} */ id) => /** @type {any} */ (byId(id));

  const kindSelect = $("opt-kind");
  kindSelect.append(new Option("Auto-detect", ""));
  const titles = new Map(index.map((g) => [g.kind, g.title]));
  for (const k of KIND_CHOICES) kindSelect.append(new Option(titles.get(k) ?? k, k));

  /** @param {import("./options.mjs").PlaygroundOptions} o */
  function optionsToUi(o) {
    $("opt-theme").value = o.theme;
    $("opt-clean").checked = o.clean;
    $("opt-seed").value = o.seed;
    $("opt-background").value = o.background;
    $("opt-background-color").value = o.backgroundColor;
    $("opt-background-color").hidden = o.background !== "custom";
    $("opt-page").value = String(o.page);
    $("opt-block").value = String(o.block);
    $("opt-kind").value = o.kind;
    $("opt-strict").checked = o.strict;
    $("opt-defines").value = o.defines;
    $("opt-filename").value = o.filename;
    $("opt-date").value = o.date;
    $("opt-png-width").value = o.pngWidth === null ? "" : String(o.pngWidth);
    $("opt-png-scale").value = String(o.pngScale);
    showDefineErrors();
  }
  function uiToOptions() {
    return normalizeOptions({
      theme: $("opt-theme").value,
      clean: $("opt-clean").checked,
      seed: $("opt-seed").value,
      background: $("opt-background").value,
      backgroundColor: $("opt-background-color").value,
      page: $("opt-page").value === "" ? 0 : $("opt-page").value,
      block: $("opt-block").value === "" ? 0 : $("opt-block").value,
      kind: $("opt-kind").value,
      strict: $("opt-strict").checked,
      defines: $("opt-defines").value,
      filename: $("opt-filename").value,
      date: $("opt-date").value,
      pngWidth: $("opt-png-width").value === "" ? null : $("opt-png-width").value,
      pngScale: $("opt-png-scale").value === "" ? 2 : $("opt-png-scale").value,
    });
  }
  function showDefineErrors() {
    const { errors } = parseDefines($("opt-defines").value);
    const el = byId("defines-error");
    el.hidden = errors.length === 0;
    el.textContent = errors.length
      ? `Ignored line ${errors[0].line}: names look like NAME or NAME=value${errors.length > 1 ? ` (+${errors.length - 1} more)` : ""}.`
      : "";
  }
  byId("options").addEventListener("input", () => {
    const next = uiToOptions();
    $("opt-background-color").hidden = next.background !== "custom";
    showDefineErrors();
    const renderChanged =
      JSON.stringify({ ...next, pngWidth: 0, pngScale: 0 }) !==
      JSON.stringify({ ...options, pngWidth: 0, pngScale: 0 });
    options = next;
    persistSoon();
    if (renderChanged) schedule(false);
  });
  byId("opt-reset").addEventListener("click", () => {
    options = normalizeOptions({});
    optionsToUi(options);
    persistSoon();
    schedule(true);
  });
  optionsToUi(options);

  // ---- examples ----------------------------------------------------------

  /** @param {string} id */
  function loadExample(id) {
    const hit = findExample(index, id);
    if (!hit) return false;
    source = hit.item.source;
    exampleId = id;
    editor.setValue(source);
    options = normalizeOptions({ ...options, page: 0, block: 0, kind: "" });
    optionsToUi(options);
    byId("example-label").textContent = hit.item.name;
    persistSoon();
    zoom = "fit";
    schedule(true);
    return true;
  }

  const dialog = /** @type {HTMLDialogElement} */ (byId("examples-dialog"));
  const search = /** @type {HTMLInputElement} */ (byId("examples-search"));
  const list = byId("examples-list");
  /** @type {HTMLElement[]} */
  let optionEls = [];
  let active = 0;

  function renderExampleList() {
    const groups = filterExamples(index, search.value);
    list.replaceChildren();
    optionEls = [];
    if (groups.length === 0) list.append(h("p", { class: "empty" }, ["No example matches."]));
    for (const g of groups) {
      list.append(h("h3", { role: "presentation" }, [g.title]));
      for (const item of g.items) {
        const el = h(
          "div",
          {
            role: "option",
            id: `ex-${item.id.replace(/[^a-z0-9]+/gi, "-")}`,
            "data-id": item.id,
            "aria-selected": "false",
          },
          [item.name],
        );
        el.addEventListener("click", () => choose(item.id));
        list.append(el);
        optionEls.push(el);
      }
    }
    active = Math.max(
      0,
      optionEls.findIndex((el) => el.dataset.id === exampleId),
    );
    markActive();
  }
  function markActive() {
    optionEls.forEach((el, i) => el.setAttribute("aria-selected", String(i === active)));
    const el = optionEls[active];
    if (el) {
      search.setAttribute("aria-activedescendant", el.id);
      el.scrollIntoView({ block: "nearest" });
    } else search.removeAttribute("aria-activedescendant");
  }
  /** @param {string} id */
  function choose(id) {
    dialog.close();
    loadExample(id);
    showPane("editor");
    editor.focus();
  }
  function openExamples() {
    closePopover(false);
    search.value = "";
    renderExampleList();
    dialog.showModal();
    search.focus();
  }
  search.addEventListener("input", () => {
    renderExampleList();
    active = 0;
    markActive();
  });
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (optionEls.length)
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + optionEls.length) % optionEls.length;
      markActive();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const id = optionEls[active]?.dataset.id;
      if (id) choose(id);
    }
  });
  byId("btn-examples").addEventListener("click", openExamples);
  for (const id of ["btn-help", "btn-help-foot"]) {
    byId(id).addEventListener("click", () =>
      /** @type {HTMLDialogElement} */ (byId("help-dialog")).showModal(),
    );
  }
  for (const d of [dialog, /** @type {HTMLDialogElement} */ (byId("help-dialog"))]) {
    // Click on the backdrop closes the dialog.
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
    });
  }

  // ---- export and share ---------------------------------------------------

  function stem() {
    return fileStem(last?.title ?? (exampleId ? exampleId.split("/")[1] : null), "diagram");
  }

  /** @param {string} what */
  async function doExport(what) {
    closePopover(true);
    if (what === "puml") {
      download(new Blob([source], { type: "text/plain;charset=utf-8" }), `${stem()}.puml`);
      return;
    }
    if (!last) return say("Nothing rendered yet.");
    try {
      if (what === "svg")
        download(new Blob([last.svg], { type: "image/svg+xml" }), `${stem()}.svg`);
      else if (what === "copy-svg")
        say((await copyText(last.svg)) ? "SVG copied." : "Copy failed.");
      else if (what === "png") {
        const png = await svgToPngBlob(last.svg, last, options);
        download(png.blob, `${stem()}.png`);
        say(
          png.reduced
            ? `PNG scaled down to ${png.width} × ${png.height} px (browser limit).`
            : `PNG ${png.width} × ${png.height} px.`,
        );
      } else {
        const res = await engine.exportJson(
          what === "copy-excalidraw" ? "clipboard" : "excalidraw",
        );
        if (!res.ok) return say("Render the diagram first.");
        if (what === "excalidraw") {
          download(new Blob([res.text], { type: "application/json" }), `${stem()}.excalidraw`);
        } else
          say(
            (await copyText(res.text))
              ? "Copied. Paste into excalidraw.com with Ctrl/Cmd+V."
              : "Copy failed.",
          );
      }
    } catch (err) {
      say(err instanceof Error ? err.message : "Export failed.");
    }
  }
  for (const b of byId("export-menu").querySelectorAll("button")) {
    b.addEventListener("click", () =>
      doExport(/** @type {HTMLElement} */ (b).dataset.export ?? ""),
    );
  }

  byId("btn-share").addEventListener("click", async () => {
    const res = await encodeState({ source, options });
    if (!res.ok) {
      say(
        res.reason === "too-long"
          ? "Too large for a link. Download the .puml instead."
          : res.reason === "too-large"
            ? `Input exceeds ${MAX_SOURCE_BYTES / 1024} KB.`
            : "Could not create a link.",
      );
      return;
    }
    const url = `${location.href.split("#")[0]}#p=${res.payload}`;
    if (await copyText(url)) say("Link copied.");
    else {
      history.replaceState(null, "", `#p=${res.payload}`);
      say("Copy failed. The link is in the address bar.");
    }
  });

  // ---- keyboard ------------------------------------------------------------

  document.addEventListener("keydown", (e) => {
    if (byId("view-play").hidden) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openExamples();
    } else if (mod && e.key === "Enter") {
      e.preventDefault();
      schedule(true);
    }
  });

  // ---- start-up ----------------------------------------------------------------

  /**
   * Apply what the address asks for. Returns whether it changed the document.
   * @param {import("../router.mjs").Route} route
   */
  async function applyRoute(route) {
    if (route.view !== "play") return false;
    if (route.payload) {
      const state = await decodeState(route.payload);
      history.replaceState(null, "", "#play");
      if (state) {
        source = state.source;
        options = state.options;
        exampleId = null;
        editor.setValue(source);
        optionsToUi(options);
        byId("example-label").textContent = "";
        schedule(true);
        return true;
      }
      say("That link could not be read. Showing your last document.");
      return false;
    }
    if (route.example) {
      const ok = loadExample(route.example);
      history.replaceState(null, "", "#play");
      if (!ok) say("Unknown example.");
      return ok;
    }
    return false;
  }

  /** @param {import("../router.mjs").Route} route */
  async function start(route) {
    setStatus("Loading engine…", "busy");
    const saved = loadSaved(storage);
    if (saved) {
      source = saved.source;
      options = saved.options;
      editor.setValue(source);
      optionsToUi(options);
      schedule(true);
    } else loadExample(DEFAULT_EXAMPLE);
    await applyRoute(route);
  }

  return {
    start,
    applyRoute,
    /** Re-render when the page theme changes and the theme is automatic. */
    pageThemeChanged() {
      if (options.theme === "auto") schedule(true);
    },
    onShow() {
      requestAnimationFrame(applyZoom);
    },
  };
}
