// Entry point of the page: header, colour theme, routing between the
// playground and the gallery.

import examples from "virtual:examples";
import { initGallery } from "./gallery/gallery.mjs";
import { byId } from "./playground/dom.mjs";
import { buildExampleIndex } from "./playground/examples.mjs";
import { initPlayground } from "./playground/playground.mjs";
import { parseRoute } from "./router.mjs";

const root = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");

// Set by boot.js when the visitor picked a theme; otherwise follow the system.
let explicit = Boolean(root.dataset.theme);
if (!explicit) root.dataset.theme = media.matches ? "dark" : "light";
const isDark = () => root.dataset.theme === "dark";

/** @returns {Storage | null} */
function storage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function syncThemeButton() {
  byId("theme-toggle").setAttribute(
    "aria-label",
    isDark() ? "Switch to light theme" : "Switch to dark theme",
  );
}

const playground = initPlayground({
  index: buildExampleIndex(examples),
  workerUrl: "worker.js",
  isDark,
  onVersion: () => {},
});
const gallery = initGallery(examples);

byId("theme-toggle").addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  explicit = true;
  root.dataset.theme = next;
  try {
    storage()?.setItem("excaliplant.theme", next);
  } catch {
    // not persisted: still applies for this visit
  }
  syncThemeButton();
  playground.pageThemeChanged();
});
media.addEventListener("change", () => {
  if (explicit) return;
  root.dataset.theme = media.matches ? "dark" : "light";
  syncThemeButton();
  playground.pageThemeChanged();
});

let started = false;
async function route() {
  const r = parseRoute(location.hash);
  const play = r.view === "play";
  byId("view-play").hidden = !play;
  byId("view-gallery").hidden = play;
  byId("btn-help-foot").hidden = !play;
  for (const [id, on] of [
    ["nav-play", play],
    ["nav-gallery", !play],
  ]) {
    const a = byId(/** @type {string} */ (id));
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  document.title = play
    ? "excaliplant playground — PlantUML as hand-drawn diagrams"
    : "excaliplant gallery — every diagram type";
  if (play) {
    gallery.close();
    if (!started) {
      started = true;
      await playground.start(r);
    } else await playground.applyRoute(r);
    playground.onShow();
  } else {
    gallery.open(r);
  }
}
addEventListener("hashchange", route);
syncThemeButton();
route();
