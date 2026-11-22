// Downloads, clipboard and PNG rasterisation (canvas, no resvg).

import { pngSize } from "./options.mjs";

/**
 * Save a Blob under a file name.
 * @param {Blob} blob
 * @param {string} name
 */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Copy text to the clipboard (async API, then the legacy command).
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.setProperty("position", "fixed");
    ta.style.setProperty("opacity", "0");
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * Rasterise an SVG string to a PNG through a canvas.
 * @param {string} svg Standalone SVG with embedded font.
 * @param {{ width: number, height: number }} intrinsic
 * @param {Pick<import("./options.mjs").PlaygroundOptions, "pngWidth" | "pngScale">} options
 * @returns {Promise<{ blob: Blob, width: number, height: number, reduced: boolean }>}
 */
export async function svgToPngBlob(svg, intrinsic, options) {
  const { width, height, reduced } = pngSize(intrinsic, options);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("The browser could not load the SVG"));
      img.src = url;
    });
    try {
      await img.decode();
    } catch {
      // some browsers reject decode() for SVG images; onload was enough
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    // The embedded font is decoded lazily: draw once to trigger it, then again.
    ctx.drawImage(img, 0, 0, width, height);
    await new Promise((r) => setTimeout(r, 60));
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG export failed");
    return { blob: /** @type {Blob} */ (blob), width, height, reduced };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * File name stem for downloads.
 * @param {string | null | undefined} title
 * @param {string} fallback
 */
export function fileStem(title, fallback) {
  const s = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || fallback;
}
