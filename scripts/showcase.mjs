// Shared showcase data for the README carousel, the gallery page and the
// GitHub Pages site: example discovery, display order, titles and notes.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listDiagramTypes } from "../src/index.mjs";
import { excalidrawToSvg } from "../src/render/svg.mjs";
import { excalifontFaceCss } from "../src/render/font.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE_URL = "https://grethel-labs.github.io/excaliplant/";

/** Display order and one-line descriptions per diagram kind. */
export const TYPES = /** @type {const} */ ([
  [
    "sequence",
    "Sequence",
    "Participants, all arrow styles, activations, notes, fragments, dividers, autonumber, boxes.",
  ],
  [
    "class",
    "Class & IE",
    "Classes, interfaces, enums, generics, members, packages, all UML relations, IE crow's feet.",
  ],
  [
    "activity",
    "Activity",
    "New syntax with if/switch/while/repeat/fork/split, partitions, notes and swimlanes.",
  ],
  [
    "state",
    "State",
    "Composite states, concurrent regions, choice, fork/join, history, entry/exit actions.",
  ],
  [
    "component",
    "Component & C4",
    "Components, interfaces, ports, packages, nodes — and C4 via `!include <C4/...>`.",
  ],
  ["usecase", "Use case", "Actors, use cases, system boundaries, include/extend."],
  [
    "deployment",
    "Deployment",
    "Nodes, clouds, databases, queues, artifacts and nested deployment targets.",
  ],
  ["object", "Object", "Objects with fields, maps (`key => value`) and links."],
  [
    "timing",
    "Timing",
    "Robust, concise, clock, binary and analog signals with messages and constraints.",
  ],
  [
    "gantt",
    "Gantt",
    "Tasks, dependencies, milestones, progress, resources, closed days, today marker.",
  ],
  ["mindmap", "Mind map", "OrgMode/Markdown outlines on both sides, colours, boxless nodes."],
  ["wbs", "WBS", "Work breakdown structures as org charts."],
  ["json", "JSON", "JSON documents as linked tables with highlights."],
  ["yaml", "YAML", "YAML documents as linked tables."],
  [
    "archimate",
    "ArchiMate",
    "ArchiMate elements by layer with icons, junctions and `Rel_*` macros.",
  ],
  [
    "chen",
    "Chen ER",
    "Chen ER diagrams: entities, weak entities, relationships, attributes, cardinalities.",
  ],
  ["nwdiag", "Network", "Networks, addresses, multi-homed nodes, groups and peer links."],
  [
    "salt",
    "Salt wireframe",
    "Wireframes: grids, buttons, inputs, check boxes, trees, tabs, group boxes.",
  ],
  ["ebnf", "EBNF", "EBNF grammars as railroad diagrams."],
  ["regex", "Regex", "Regular expressions as railroad diagrams."],
  ["dot", "Graphviz DOT", "Graphviz DOT graphs laid out with ELK."],
  ["chronology", "Chronology", "Events and spans on a time line with links."],
  ["files", "Files", "File trees from path lists with notes."],
  ["chart", "Chart", "Bar, line, area and scatter charts."],
  ["math", "AsciiMath", "AsciiMath formulas."],
  ["latex", "LaTeX", "LaTeX formulas."],
  ["ditaa", "Ditaa", "ASCII art boxes, lines, arrows and colour tags."],
  [
    "legacy-activity",
    "Legacy activity",
    'The classic `(*) --> "Activity"` syntax with sync bars and branches.',
  ],
  ["creole", "Creole", "Rich text with headings, lists, tables and links."],
]);

/** Preferred first example per kind (used for the README carousel). */
const PRIMARY = {
  sequence: "checkout-flow",
  class: "shop-domain",
  activity: "order-processing",
  state: "order-lifecycle",
  component: "c4-container",
  deployment: "kubernetes",
};

/**
 * @typedef {object} Example
 * @property {string} kind
 * @property {string} name
 * @property {string} title Human title of the kind.
 * @property {string} note
 * @property {string} source
 */

/**
 * All examples in display order (primary example first within each kind).
 * @returns {Example[]}
 */
export function loadExamples() {
  const known = new Set(listDiagramTypes().map((t) => t.kind));
  /** @type {Example[]} */
  const out = [];
  for (const [kind, title, note] of TYPES) {
    if (!known.has(kind)) throw new Error(`Unknown diagram kind in showcase: ${kind}`);
    const dir = path.join(ROOT, "examples", kind);
    if (!existsSync(dir)) continue;
    const names = readdirSync(dir)
      .filter((f) => f.endsWith(".puml"))
      .map((f) => f.replace(/\.puml$/, ""))
      .sort(
        (a, b) =>
          Number(b === PRIMARY[/** @type {keyof typeof PRIMARY} */ (kind)]) -
            Number(a === PRIMARY[/** @type {keyof typeof PRIMARY} */ (kind)]) || a.localeCompare(b),
      );
    for (const name of names) {
      out.push({
        kind,
        name,
        title,
        note,
        source: readFileSync(path.join(dir, `${name}.puml`), "utf8"),
      });
    }
  }
  const missing = [...known].filter((k) => !TYPES.some(([t]) => t === k));
  if (missing.length)
    throw new Error(`Diagram kinds missing from the showcase order: ${missing.join(", ")}`);
  return out;
}

/**
 * Inner markup and size of a document's SVG without the outer element and font.
 * @param {any} doc Excalidraw document.
 */
function innerSvg(doc) {
  const svg = excalidrawToSvg(doc, { embedFont: false, background: "transparent", padding: 8 });
  const size = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const body = svg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "")
    .replace(/<defs>[\s\S]*?<\/defs>/, "")
    // One decimal is plenty at carousel scale and halves the file size.
    .replace(/(\d+\.\d)\d+/g, "$1");
  return { body, w: Number(size?.[1] ?? 100), h: Number(size?.[2] ?? 100) };
}

/** @param {string} s */
const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

const brandPalettes = {
  light: { background: "#f7fbfa", ink: "#172e32", accent: "#0b7168", line: "#c9ddd7" },
  dark: { background: "#111827", ink: "#bfd1d3", accent: "#2db8a8", line: "#315058" },
};

/**
 * Place the same outlined logo used by the website inside a generated SVG.
 * @param {"light" | "dark"} mode
 * @param {number} x
 * @param {number} y
 * @param {number} width
 */
function brandLogo(mode, x, y, width) {
  return readFileSync(path.join(ROOT, "assets", "brand", `logo-${mode}.svg`), "utf8")
    .trim()
    .replace(/\bwidth="350" height="64"/, `width="${width}" height="${(width * 64) / 350}"`)
    .replace(/^<svg /, `<svg x="${x}" y="${y}" `);
}

/** @param {any} document An Excalidraw document used in the share card. */
export function socialCardSvg(document) {
  const { body, w, h } = innerSvg(document);
  const scale = Math.min(1040 / w, 230 / h);
  const width = w * scale;
  const height = h * scale;
  const { background, ink, accent, line } = brandPalettes.dark;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">',
    `<rect width="1200" height="630" fill="${background}"/>`,
    `<path d="M72 233H1128" stroke="${line}" stroke-width="2"/>`,
    brandLogo("dark", 63, 56, 545),
    `<text x="72" y="199" font-family="Excalifont" font-size="30" fill="${ink}">PlantUML in, hand-drawn diagrams out.</text>`,
    `<rect x="72" y="273" width="1056" height="283" rx="24" fill="#1b3038" stroke="${line}" stroke-width="2"/>`,
    `<svg x="${(1200 - width) / 2}" y="${414.5 - height / 2}" width="${width}" height="${height}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
    `<path d="M72 598H1128" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`,
    "</svg>",
  ].join("");
}

/**
 * Build an auto-playing carousel SVG (CSS animation; works in GitHub READMEs,
 * which strip scripts but keep animated SVG images).
 * @param {{ kind: string, title: string, name: string, doc: any }[]} slides
 * @param {{ seconds?: number, mode?: "light" | "dark" }} [options]
 * @returns {string}
 */
export function carouselSvg(slides, options = {}) {
  const W = 960;
  const H = 700;
  const header = 74;
  const footer = 40;
  const mode = options.mode ?? "light";
  const { background, ink, accent, line } = brandPalettes[mode];
  const per = options.seconds ?? 4;
  const n = slides.length;
  const total = per * n;
  const fade = (0.5 / total) * 100;
  const end = (per / total) * 100;
  const pct = (/** @type {number} */ v) => `${Math.round(v * 1000) / 1000}%`;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="excaliplant diagram showcase">`,
  );
  out.push(
    `<defs><style>${excalifontFaceCss()}text{font-family:Excalifont,"Segoe UI Emoji",sans-serif;white-space:pre}` +
      `.s{opacity:0;animation:show ${total}s infinite}.s0{opacity:1}` +
      `@keyframes show{0%{opacity:0}${pct(fade)}{opacity:1}${pct(end - fade)}{opacity:1}${pct(end)}{opacity:0}100%{opacity:0}}` +
      `</style></defs>`,
  );
  out.push(
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18" fill="${background}" stroke="${line}" stroke-width="2"/>`,
  );
  out.push(brandLogo(mode, 26, 19, 176));
  out.push(
    `<text x="${W - 32}" y="46" font-size="15" fill="${ink}" text-anchor="end">PlantUML in, hand-drawn diagrams out</text>`,
  );
  out.push(
    `<line x1="24" y1="${header - 8}" x2="${W - 24}" y2="${header - 8}" stroke="${line}" stroke-width="2"/>`,
  );
  const dx = (W - n * 12) / 2 + 6;
  // Inactive dots are painted underneath the animated slides.
  for (let i = 0; i < n; i++) {
    out.push(
      `<circle cx="${(dx + i * 12).toFixed(1)}" cy="${H - footer + 4}" r="3" fill="${line}"/>`,
    );
  }
  const areaW = W - 64;
  const areaH = H - header - footer - 16;
  slides.forEach((slide, i) => {
    const { body, w, h } = innerSvg(slide.doc);
    const scale = Math.min(areaW / w, areaH / h, 1.6);
    const dw = w * scale;
    const dh = h * scale;
    const x = 32 + (areaW - dw) / 2;
    const y = header + (areaH - dh) / 2;
    out.push(`<g class="s${i === 0 ? " s0" : ""}" style="animation-delay:${i * per}s">`);
    out.push(
      `<text x="${W / 2}" y="46" font-size="22" fill="${accent}" text-anchor="middle">${esc(slide.title)}</text>`,
    );
    out.push(
      `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
    );
    out.push(
      `<text x="${W / 2}" y="${H - 16}" font-size="13" fill="${ink}" text-anchor="middle">${i + 1} / ${n} · examples/${esc(slide.kind)}/${esc(slide.name)}.puml</text>`,
    );
    out.push(
      `<circle cx="${(dx + i * 12).toFixed(1)}" cy="${H - footer + 4}" r="4" fill="${accent}"/>`,
    );
    out.push(`</g>`);
  });
  out.push("</svg>");
  return out.join("");
}
