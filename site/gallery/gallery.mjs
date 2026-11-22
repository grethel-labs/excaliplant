// The gallery view: type tabs, arrows, keyboard, swipe, autoplay, downloads.
// Images are the pre-rendered files under `d/<kind>/<name>.svg`.

import { byId, h } from "../playground/dom.mjs";
import { playHash } from "../router.mjs";

/**
 * Notes use `code` spans in backticks; build them without innerHTML.
 * @param {HTMLElement} el
 * @param {string} text
 */
function setNote(el, text) {
  el.replaceChildren(
    ...text
      .split("`")
      .map((part, i) => (i % 2 ? h("code", {}, [part]) : document.createTextNode(part))),
  );
}

/**
 * @param {import("../playground/examples.mjs").ExampleEntry[]} slides Flat list in display order.
 */
export function initGallery(slides) {
  const tabsEl = byId("gallery-tabs");
  const img = /** @type {HTMLImageElement} */ (byId("g-img"));
  const kinds = [...new Map(slides.map((s) => [s.kind, s.title])).entries()];
  let index = 0;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  let visible = false;

  const tabs = kinds.map(([kind, title]) => {
    const b = h(
      "button",
      { type: "button", role: "tab", "data-kind": kind, "aria-selected": "false" },
      [title],
    );
    b.addEventListener("click", () => show(slides.findIndex((s) => s.kind === kind)));
    tabsEl.append(b);
    return b;
  });

  /**
   * @param {number} i
   * @param {boolean} [updateHash]
   */
  function show(i, updateHash = true) {
    index = (i + slides.length) % slides.length;
    const s = slides[index];
    const base = `d/${s.kind}/${s.name}`;
    byId("g-title").textContent = s.title;
    setNote(byId("g-note"), s.note);
    img.src = `${base}.svg`;
    img.alt = `${s.title} example: ${s.name}`;
    /** @type {HTMLAnchorElement} */ (byId("g-full")).href = `${base}.svg`;
    byId("g-src").textContent = s.source;
    /** @type {HTMLAnchorElement} */ (byId("g-dl-svg")).href = `${base}.svg`;
    /** @type {HTMLAnchorElement} */ (byId("g-dl-ex")).href = `${base}.excalidraw`;
    /** @type {HTMLAnchorElement} */ (byId("g-dl-puml")).href = `${base}.puml`;
    /** @type {HTMLAnchorElement} */ (byId("g-open")).href = playHash(`${s.kind}/${s.name}`);
    const same = slides.filter((x) => x.kind === s.kind);
    byId("g-pos").textContent =
      `${s.name} · ${same.indexOf(s) + 1}/${same.length} of ${s.title} · ${index + 1}/${slides.length}`;
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.kind === s.kind));
    if (visible)
      tabs
        .find((t) => t.dataset.kind === s.kind)
        ?.scrollIntoView({ block: "nearest", inline: "center" });
    if (updateHash) history.replaceState(null, "", `#gallery/${s.kind}/${s.name}`);
  }

  byId("g-prev").addEventListener("click", () => show(index - 1));
  byId("g-next").addEventListener("click", () => show(index + 1));
  byId("g-copy").addEventListener("click", async () => {
    const btn = byId("g-copy");
    try {
      await navigator.clipboard.writeText(slides[index].source);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Copy failed";
    }
    setTimeout(() => (btn.textContent = "Copy source"), 1400);
  });
  byId("g-play").addEventListener("click", () => {
    const btn = byId("g-play");
    if (timer) {
      clearInterval(timer);
      timer = null;
    } else timer = setInterval(() => show(index + 1), 3500);
    btn.setAttribute("aria-pressed", String(!!timer));
    btn.textContent = timer ? "Pause" : "Autoplay";
  });
  document.addEventListener("keydown", (e) => {
    if (!visible || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLElement && t.closest("pre, input, textarea, select, dialog")) return;
    if (e.key === "ArrowRight") show(index + 1);
    else if (e.key === "ArrowLeft") show(index - 1);
  });
  let x0 = /** @type {number | null} */ (null);
  img.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  img.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  return {
    /**
     * @param {{ example?: string, kind?: string }} target `kind/name` or just a kind.
     */
    open({ example, kind }) {
      visible = true;
      const i = example
        ? slides.findIndex((s) => `${s.kind}/${s.name}` === example)
        : kind
          ? slides.findIndex((s) => s.kind === kind)
          : -1;
      show(i < 0 ? index : i, false);
    },
    close() {
      visible = false;
      if (timer) byId("g-play").click();
    },
  };
}
