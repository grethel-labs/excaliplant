// The playground view: editor, options, live rendering, export and sharing.

import { bindHooks } from "../../src/browser/hooks.mjs";
import { byId, h } from "./dom.mjs";
import { createEditor } from "./editor.mjs";
import { createEngineClient } from "./engine.mjs";
import { download, copyText, fileStem, svgToPngBlob } from "./export.mjs";
import { filterExamples, findExample } from "./examples.mjs";
import { readProjectFiles } from "./project-files.mjs";
import {
  KIND_CHOICES,
  MAX_SOURCE_BYTES,
  normalizeOptions,
  parseDefines,
  toRenderOptions,
} from "./options.mjs";
import {
  decodePlainSource,
  decodeState,
  encodeState,
  loadSaved,
  safeStorage,
  save,
} from "./state.mjs";

/** Debounce between the last keystroke and the render request. */
export const RENDER_DEBOUNCE_MS = 150;

const DEFAULT_EXAMPLE = "sequence/lifecycle";
const SVG_NS = "http://www.w3.org/2000/svg";
const HOOK_PART = "g[data-excaliplant-hook][data-excaliplant-element-id]";

/** @param {EventTarget | null} target */
function isPreviewAction(target) {
  return (
    target instanceof Element &&
    target.closest(`#interactive-preview :is(${HOOK_PART}, a[href])`) !== null
  );
}

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
  /** @type {{ svg: string, width: number, height: number, title: string | null, slot?: number } | null} */
  let last = null;
  /** @type {string | null} */
  let blobUrl = null;
  /** @type {{ width: number, height: number } | null} */
  let interactiveSize = null;
  /** @type {(() => void) | null} */
  let clearHooks = null;
  /** @type {"fit" | number} */
  let zoom = "fit";
  /** @type {{ files: { path: string, text: string }[], output: any, index: number, mode: string } | null} */
  let project = null;
  let selection = 0;

  const status = byId("status");
  const panes = byId("panes");
  const canvas = byId("canvas");
  const preview = /** @type {HTMLImageElement} */ (byId("preview"));
  const interactivePreview = byId("interactive-preview");
  const hookPanel = byId("hook-panel");
  const hookEvent = byId("hook-event");
  const placeholder = byId("placeholder");
  const diagnostics = byId("diagnostics");
  const toast = byId("toast");
  const modeSelect = /** @type {HTMLSelectElement} */ (byId("project-output-mode"));

  const editor = createEditor(byId("editor"), {
    label: "PlantUML source",
    onChange(value) {
      clearProject();
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
    if (!project && !immediate && enc.encode(source).length > MAX_SOURCE_BYTES) {
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
    if (!project && !source.trim()) {
      showEmpty();
      return;
    }
    if (busyTimer) clearTimeout(busyTimer);
    busyTimer = setTimeout(() => {
      if (mine === seq) setStatus(last ? "Rendering…" : "Loading engine…", "busy");
    }, 200);
    const mapped = toRenderOptions(options, { pageDark: config.isDark() });
    const res = project
      ? await engine.renderProject(project.files, mapped.render, mapped.svg)
      : await engine.render(source, mapped.render, mapped.svg);
    if (mine !== seq) return; // a newer render was requested: drop this one
    if (busyTimer) clearTimeout(busyTimer);
    if (res.superseded || res.type === "stale") return;
    if (res.retry) return schedule(true);
    if (!res.ok) showError(res);
    else if (project) {
      project.output = { ...res.project, ms: res.ms };
      showProjectOutput();
    } else showResult(res);
  }

  function clearPreview() {
    clearHooks?.();
    clearHooks = null;
    interactiveSize = null;
    interactivePreview.hidden = true;
    interactivePreview.replaceChildren();
    hookPanel.hidden = true;
    hookEvent.replaceChildren();
    preview.hidden = true;
    preview.onload = null;
    preview.removeAttribute("src");
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }

  /**
   * Mount the worker's sanitized, style-free SVG and bind its hook controls.
   * @param {{ svg: string, width: number, height: number }} data
   * @param {string} label
   */
  function showInteractive({ svg: markup, width, height }, label) {
    const xml = new DOMParser().parseFromString(markup, "image/svg+xml");
    const root = xml.documentElement;
    if (
      root?.localName !== "svg" ||
      root.namespaceURI !== SVG_NS ||
      xml.querySelector("parsererror") ||
      !root.querySelector(HOOK_PART)
    )
      return false;

    const svg = /** @type {SVGSVGElement} */ (document.importNode(root, true));
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", label);
    for (const link of svg.querySelectorAll("a[href]")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
    const unbind = bindHooks(svg);
    /** @param {CustomEvent<import("../../src/browser/hooks.mjs").HookEventDetail>} event */
    function showHookEvent({ detail: { type, active, id, classes, sourceElementId } }) {
      const state =
        type === "hover"
          ? active
            ? "Hover enter"
            : "Hover exit"
          : active
            ? "Click on"
            : "Click off";
      const values = [...(id ? [`#${id}`] : []), ...classes.map((name) => `.${name}`)];
      hookEvent.replaceChildren(
        h("span", { class: "hook-state" }, [state]),
        ...values.map((value) => h("code", {}, [value])),
      );
      if (sourceElementId) hookEvent.append(h("span", { title: sourceElementId }, ["From child"]));
    }
    svg.addEventListener("excaliplant:hook", showHookEvent);
    clearHooks = () => {
      svg.removeEventListener("excaliplant:hook", showHookEvent);
      unbind();
    };
    interactiveSize = { width, height };
    interactivePreview.replaceChildren(svg);
    interactivePreview.hidden = false;
    hookEvent.textContent = "Hover over or activate a hooked element.";
    hookPanel.hidden = false;
    return true;
  }

  function showEmpty() {
    if (busyTimer) clearTimeout(busyTimer);
    last = null;
    clearPreview();
    placeholder.textContent = project
      ? "Rendering the selected files…"
      : "Write some PlantUML to see it here.";
    placeholder.className = "placeholder";
    canvas.classList.remove("stale");
    setStatus(project ? "Rendering local files…" : "Nothing to render", project ? "busy" : "");
    showDiagnostics([]);
    editor.setMarks(new Map());
  }

  /** @param {any} res */
  function showResult(res) {
    last = { svg: res.svg, width: res.width, height: res.height, title: res.title, slot: res.slot };
    clearPreview();
    const label = res.title ? `Diagram: ${res.title}` : `${res.kind} diagram`;
    if (!res.interactive || !showInteractive(res.interactive, label)) {
      blobUrl = URL.createObjectURL(new Blob([res.svg], { type: "image/svg+xml" }));
      preview.onload = applyZoom;
      preview.src = blobUrl;
      preview.alt = label;
      preview.hidden = false;
    }
    applyZoom();
    placeholder.className = "placeholder";
    canvas.classList.remove("stale");
    if (!project) updateStructureFields(res);
    const warnings = res.diagnostics.filter((d) => d.severity === "warning").length;
    const errors = res.diagnostics.filter((d) => d.severity === "error").length;
    const counts = [
      errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
      warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    setStatus([`Rendered in ${res.ms} ms`, res.kind, ...counts].join(" · "), errors ? "error" : "");
    /** @type {Map<number, "error" | "warning" | "info">} */
    const marks = new Map();
    if (!project)
      for (const d of res.diagnostics)
        if (d.line && !marks.has(d.line)) marks.set(d.line, d.severity);
    showDiagnostics(res.diagnostics);
    editor.setMarks(marks);
  }

  /** @param {{ error: string, line: number | null, diagnostics?: any[] }} res */
  function showError(res) {
    setStatus(res.line ? `Error in line ${res.line}` : "Error", "error");
    if (last) canvas.classList.add("stale");
    else {
      placeholder.textContent = res.error;
      placeholder.className = "placeholder error";
    }
    const item = { severity: "error", message: res.error, line: res.line };
    const marks = new Map();
    if (res.line && !project) marks.set(res.line, "error");
    showDiagnostics(res.diagnostics?.length ? res.diagnostics : [item]);
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

  function updateProjectControls() {
    const open = project !== null;
    byId("project-bar").hidden = !open;
    byId("field-kind").hidden = open;
    if (open) {
      byId("field-block").hidden = true;
      byId("field-page").hidden = true;
    }
    byId("project-outputs").hidden = true;
    byId("project-carousel").hidden = true;
    /** @type {HTMLButtonElement} */ (byId("btn-share")).disabled = open;
    /** @type {HTMLButtonElement} */ (
      byId("export-menu").querySelector('[data-export="puml"]')
    ).hidden = open;
    byId(open ? "pane-preview" : "pane-editor").append(diagnostics);
  }

  function clearProject() {
    selection++;
    if (!project) return;
    project = null;
    seq++;
    updateProjectControls();
    showEmpty();
  }

  function showProjectOutput() {
    if (!project?.output) return;
    const { entries, combined, problems, ms } = project.output;
    const carousel = project.mode === "carousel" && entries.length > 1;
    project.index = Math.min(project.index, entries.length - 1);
    byId("project-outputs").hidden = !combined;
    byId("project-carousel").hidden = !carousel;
    modeSelect.value = project.mode;
    const item = carousel || !combined ? entries[project.index] : combined;
    if (carousel)
      byId("project-current").textContent =
        `${project.index + 1} / ${entries.length} · ${item.title}`;
    showResult({ ...item, ms, diagnostics: [...problems, ...item.diagnostics] });
  }

  /** @param {FileList} files */
  async function openFiles(files) {
    if (!files.length) return;
    const mine = ++selection;
    setStatus("Reading local files…", "busy");
    try {
      const sources = await readProjectFiles(files);
      if (mine !== selection) return;
      seq++;
      project = { files: sources, output: null, index: 0, mode: "combined" };
      showEmpty();
      updateProjectControls();
      byId("project-file-count").textContent =
        `${sources.length} local PlantUML ${sources.length === 1 ? "file" : "files"}`;
      showPane("preview");
      zoom = "fit";
      schedule(true);
    } catch (error) {
      if (mine === selection) showError({ error: error.message, line: null });
    }
  }

  for (const [button, input] of [
    ["btn-open-files", "project-files-input"],
    ["btn-open-folder", "project-folder-input"],
  ]) {
    const picker = /** @type {HTMLInputElement} */ (byId(input));
    byId(button).addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => {
      if (picker.files) void openFiles(picker.files);
      picker.value = "";
    });
  }
  panes.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  panes.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void openFiles(event.dataTransfer.files);
  });
  byId("btn-close-project").addEventListener("click", () => {
    clearProject();
    showPane("editor");
    schedule(true);
  });
  modeSelect.addEventListener("change", () => {
    if (!project) return;
    project.mode = modeSelect.value;
    showProjectOutput();
  });
  for (const [button, offset] of [
    ["project-prev", -1],
    ["project-next", 1],
  ]) {
    byId(button).addEventListener("click", () => {
      if (!project?.output) return;
      const count = project.output.entries.length;
      project.index = (project.index + count + offset) % count;
      showProjectOutput();
    });
  }

  // ---- zoom and pan ----------------------------------------------------

  function fitScale() {
    const size = interactiveSize ?? last;
    if (!size) return 1;
    const cs = getComputedStyle(canvas);
    const w =
      canvas.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
    const hgt =
      canvas.clientHeight - Number.parseFloat(cs.paddingTop) - Number.parseFloat(cs.paddingBottom);
    return Math.max(0.05, Math.min(1.5, w / size.width, hgt / size.height));
  }
  function currentScale() {
    return zoom === "fit" ? fitScale() : zoom;
  }
  function applyZoom() {
    const size = interactiveSize ?? last;
    if (!size) return;
    const image = interactiveSize ? interactivePreview : preview;
    const s = currentScale();
    image.style.setProperty("width", `${Math.round(size.width * s)}px`);
    image.style.setProperty("height", `${Math.round(size.height * s)}px`);
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
    if (e.pointerType !== "mouse" || e.button !== 0 || isPreviewAction(e.target)) return;
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
  canvas.addEventListener("dblclick", (e) => {
    if (isPreviewAction(e.target)) return;
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
    clearProject();
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
      if (project) return;
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
          last.slot,
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
    if (project) return;
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
    if (route.payload || route.plainSource !== undefined) {
      const state =
        route.plainSource !== undefined
          ? decodePlainSource(route.plainSource)
          : await decodeState(/** @type {string} */ (route.payload));
      history.replaceState(null, "", "#play");
      if (state) {
        clearProject();
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
