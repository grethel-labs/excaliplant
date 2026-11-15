#!/usr/bin/env node
// Build the interactive GitHub Pages gallery into _site/:
//
//   _site/index.html                  carousel with type tabs, arrows, keyboard, swipe, autoplay
//   _site/d/<kind>/<name>.svg         rendered diagram (Excalifont embedded)
//   _site/d/<kind>/<name>.excalidraw  editable scene
//   _site/d/<kind>/<name>.puml        source
//
// Usage: node scripts/site.mjs [outDir]

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { render } from "../src/index.mjs";
import { ROOT, SITE_URL, loadExamples } from "./showcase.mjs";

const out = path.resolve(ROOT, process.argv[2] ?? "_site");
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "d"), { recursive: true });

const pkg = JSON.parse(
  (await import("node:fs")).readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
const version = await publishedVersion(pkg.name);

/**
 * The version shown on the page. package.json stays `0.0.0-development`
 * (tags are the source of truth), so ask npm first, then fall back to the
 * latest `v*` tag. `SITE_VERSION` overrides both.
 * @param {string} name
 * @returns {Promise<string | null>}
 */
async function publishedVersion(name) {
  if (process.env.SITE_VERSION) return process.env.SITE_VERSION.replace(/^v/, "");
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}/latest`, {
      signal: AbortSignal.timeout(10_000),
      headers: { "cache-control": "no-cache" },
    });
    if (res.ok) {
      const v = (await res.json()).version;
      if (typeof v === "string" && /^\d+\.\d+\.\d+/.test(v)) return v;
    }
  } catch {
    // offline: fall through to git tags
  }
  try {
    const { execFileSync } = await import("node:child_process");
    const tags = execFileSync("git", ["tag", "--list", "v[0-9]*", "--sort=-v:refname"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const latest = tags.split("\n")[0]?.trim();
    if (latest) return latest.replace(/^v/, "");
  } catch {
    // not a git checkout
  }
  return null;
}
const examples = loadExamples();
/** @type {{ kind: string, title: string, note: string, name: string, source: string }[]} */
const slides = [];
for (const ex of examples) {
  const result = await render(ex.source);
  const dir = path.join(out, "d", ex.kind);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${ex.name}.svg`), await result.toSvg());
  writeFileSync(path.join(dir, `${ex.name}.excalidraw`), JSON.stringify(result.excalidraw));
  writeFileSync(path.join(dir, `${ex.name}.puml`), ex.source);
  slides.push({
    kind: ex.kind,
    title: ex.title,
    note: ex.note.replace(/`([^`]+)`/g, "<code>$1</code>"),
    name: ex.name,
    source: ex.source,
  });
}

/** @param {string} s */
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
// JSON inside <script> must not be able to close the tag.
const data = JSON.stringify(slides).replace(/</g, "\\u003c");
const kinds = [...new Map(slides.map((s) => [s.kind, s.title])).entries()];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>excaliplant — PlantUML as hand-drawn diagrams</title>
<meta name="description" content="Render PlantUML as editable Excalidraw scenes, SVG and PNG. ${kinds.length} diagram types, ${slides.length} live examples." />
<link rel="canonical" href="${SITE_URL}" />
<style>
  @font-face { font-family: Excalifont; src: url("excalifont.woff2") format("woff2"); }
  :root {
    --bg: #f8f9fa; --card: #ffffff; --ink: #1e1e1e; --muted: #868e96; --line: #dee2e6;
    --accent: #1971c2; --accent-soft: #d0ebff; --code: #f1f3f5;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #121212; --card: #1c1c1c; --ink: #e9ecef; --muted: #adb5bd; --line: #343a40;
      --accent: #74c0fc; --accent-soft: #1c3d5a; --code: #232323; }
    .stage img { background: #fff; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { max-width: 1200px; margin: 0 auto; padding: 28px 20px 8px; display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: baseline; }
  h1 { font: 40px Excalifont, system-ui, sans-serif; margin: 0; }
  header p { margin: 0; color: var(--muted); flex: 1 1 320px; }
  header p a { color: var(--accent); }
  header nav a { color: var(--accent); text-decoration: none; margin-left: 16px; }
  .install { font: 13px ui-monospace, monospace; background: var(--code); padding: 6px 10px; border-radius: 6px; }
  .tabs { max-width: 1200px; margin: 16px auto 0; padding: 0 20px; display: flex; gap: 8px; overflow-x: auto; scrollbar-width: thin; }
  .tabs button { flex: 0 0 auto; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 14px; font: 15px Excalifont, system-ui, sans-serif; cursor: pointer; }
  .tabs button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  main { max-width: 1200px; margin: 16px auto 40px; padding: 0 20px; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px; }
  @media (max-width: 960px) { main { grid-template-columns: 1fr; } }
  .stage { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px 64px; min-height: 520px; display: flex; flex-direction: column; }
  .stage h2 { font: 28px Excalifont, system-ui, sans-serif; margin: 0; color: var(--accent); }
  .stage .note { color: var(--muted); margin: 4px 0 12px; }
  .frame { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 380px; }
  .frame img { max-width: 100%; max-height: 64vh; border-radius: 8px; transition: opacity .25s; }
  .arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--card); color: var(--ink); font-size: 22px; cursor: pointer; }
  .arrow:hover { background: var(--accent-soft); }
  .prev { left: 10px; } .next { right: 10px; }
  .dots { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 12px; }
  .dots button { width: 10px; height: 10px; padding: 0; border-radius: 50%; border: 0; background: var(--line); cursor: pointer; }
  .dots button[aria-current="true"] { background: var(--accent); }
  .meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; color: var(--muted); font-size: 13px; }
  .play { border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  aside { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; min-height: 0; }
  aside h3 { margin: 0 0 8px; font-size: 14px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  pre { flex: 1; margin: 0; background: var(--code); border-radius: 8px; padding: 12px; overflow: auto; max-height: 60vh; font: 12.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .actions a, .actions button { border: 1px solid var(--line); background: var(--card); color: var(--accent); border-radius: 6px; padding: 6px 10px; text-decoration: none; font-size: 13px; cursor: pointer; }
  footer { text-align: center; color: var(--muted); font-size: 13px; padding-bottom: 32px; }
  footer a { color: var(--accent); }
  kbd { font: 12px ui-monospace, monospace; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; }
</style>
</head>
<body>
<header>
  <h1>excaliplant</h1>
  <p>PlantUML in, hand-drawn diagrams out — ${kinds.length} diagram types rendered as editable Excalidraw scenes, SVG and PNG. ${version ? `Version <a href="https://www.npmjs.com/package/${pkg.name}/v/${esc(version)}">${esc(version)}</a>.` : ""}</p>
  <span class="install">npm i @grethel-labs/excaliplant</span>
  <nav><a href="https://github.com/grethel-labs/excaliplant">GitHub</a><a href="https://www.npmjs.com/package/@grethel-labs/excaliplant">npm</a></nav>
</header>
<div class="tabs" role="tablist" aria-label="Diagram types">
${kinds.map(([k, t]) => `  <button role="tab" data-kind="${k}" aria-selected="false">${esc(t)}</button>`).join("\n")}
</div>
<main>
  <section class="stage" aria-roledescription="carousel" aria-label="Diagram examples">
    <h2 id="title"></h2>
    <div class="note" id="note"></div>
    <div class="frame"><a id="full" target="_blank" rel="noopener" title="Open full size"><img id="img" alt="" /></a></div>
    <button class="arrow prev" id="prev" aria-label="Previous example">‹</button>
    <button class="arrow next" id="next" aria-label="Next example">›</button>
    <div class="dots" id="dots"></div>
    <div class="meta"><span id="pos"></span><span><kbd>←</kbd> <kbd>→</kbd> to browse</span><button class="play" id="play" aria-pressed="false">▶ Autoplay</button></div>
  </section>
  <aside>
    <h3>PlantUML source</h3>
    <pre id="src"></pre>
    <div class="actions">
      <button id="copy">Copy source</button>
      <a id="dl-svg" download>SVG</a>
      <a id="dl-ex" download>.excalidraw</a>
      <a id="dl-puml" download>.puml</a>
    </div>
  </aside>
</main>
<footer>Every diagram on this page was rendered by excaliplant from <a href="https://github.com/grethel-labs/excaliplant/tree/main/examples">examples/</a>. MIT licensed.</footer>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const slides = JSON.parse(document.getElementById("data").textContent);
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll(".tabs button")];
  let index = 0;
  let timer = null;
  const fromHash = () => {
    const [kind, name] = decodeURIComponent(location.hash.slice(1)).split("/");
    const i = slides.findIndex((s) => s.kind === kind && (!name || s.name === name));
    return i < 0 ? 0 : i;
  };
  const show = (i, push) => {
    index = (i + slides.length) % slides.length;
    const s = slides[index];
    const base = "d/" + s.kind + "/" + s.name;
    $("title").textContent = s.title;
    $("note").innerHTML = s.note;
    $("img").src = base + ".svg";
    $("full").href = base + ".svg";
    $("img").alt = s.title + " example: " + s.name;
    $("src").textContent = s.source;
    $("dl-svg").href = base + ".svg";
    $("dl-ex").href = base + ".excalidraw";
    $("dl-puml").href = base + ".puml";
    const same = slides.filter((x) => x.kind === s.kind);
    $("pos").textContent = s.name + " · " + (same.indexOf(s) + 1) + "/" + same.length + " of " + s.title + " · " + (index + 1) + "/" + slides.length;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.kind === s.kind)));
    tabs.find((t) => t.dataset.kind === s.kind)?.scrollIntoView({ block: "nearest", inline: "center" });
    [...$("dots").children].forEach((d, k) => d.setAttribute("aria-current", String(k === index)));
    if (push !== false) history.replaceState(null, "", "#" + s.kind + "/" + s.name);
  };
  slides.forEach((s, k) => {
    const d = document.createElement("button");
    d.title = s.title + ": " + s.name;
    d.setAttribute("aria-label", d.title);
    d.onclick = () => show(k);
    $("dots").appendChild(d);
  });
  tabs.forEach((t) => (t.onclick = () => show(slides.findIndex((s) => s.kind === t.dataset.kind))));
  $("prev").onclick = () => show(index - 1);
  $("next").onclick = () => show(index + 1);
  $("copy").onclick = async () => {
    await navigator.clipboard.writeText(slides[index].source);
    $("copy").textContent = "Copied!";
    setTimeout(() => ($("copy").textContent = "Copy source"), 1200);
  };
  $("play").onclick = () => {
    if (timer) { clearInterval(timer); timer = null; }
    else timer = setInterval(() => show(index + 1), 3500);
    $("play").setAttribute("aria-pressed", String(!!timer));
    $("play").textContent = timer ? "❚❚ Pause" : "▶ Autoplay";
  };
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.closest("pre")) return;
    if (e.key === "ArrowRight") show(index + 1);
    if (e.key === "ArrowLeft") show(index - 1);
  });
  let x0 = null;
  $("img").addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
  $("img").addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  window.addEventListener("hashchange", () => show(fromHash(), false));
  show(fromHash(), false);
})();
</script>
</body>
</html>
`;
writeFileSync(path.join(out, "index.html"), html);
const { copyFileSync } = await import("node:fs");
copyFileSync(
  path.join(ROOT, "assets", "fonts", "Excalifont-Regular.woff2"),
  path.join(out, "excalifont.woff2"),
);
writeFileSync(path.join(out, ".nojekyll"), "");
console.log(
  `Built ${slides.length} slides for ${kinds.length} diagram types into ${path.relative(ROOT, out)}/`,
);
