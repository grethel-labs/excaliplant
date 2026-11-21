/**
 * "Open Preview to the Side" for PlantUML files: a script-free webview that
 * shows each diagram as an `<img>` with a `data:` URL and updates while typing.
 *
 * Security model: `enableScripts` is off, `localResourceRoots` is empty, the
 * CSP allows nothing but `data:` images and one nonce'd style element, and the
 * SVG (already sanitised) is only ever loaded as an image, where scripts,
 * external resources and the page's DOM are unreachable by construction.
 * @module vscode/preview
 */

import { randomBytes } from "node:crypto";
import { listDiagrams, messageOf, toPreviewSvg } from "./diagram.mjs";
import { blockOptions } from "./options.mjs";

const UPDATE_DELAY_MS = 300;
/** Diagrams shown per file; the rest is mentioned in a note. */
const MAX_PREVIEW_DIAGRAMS = 20;
export const PREVIEW_VIEW_TYPE = "excaliplant.preview";

/** @param {string} text */
export function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/**
 * Page body for the already rendered diagrams.
 * @param {({ svg: string, title: string } | { error: string, title: string })[]} items
 * @param {string} [note]
 */
export function previewBody(items, note) {
  const parts = items.map((item) => {
    const caption = item.title ? `<figcaption>${escapeHtml(item.title)}</figcaption>` : "";
    if ("error" in item) {
      return `<figure>${caption}<pre class="error" role="alert">${escapeHtml(item.error)}</pre></figure>`;
    }
    const url = `data:image/svg+xml;base64,${Buffer.from(item.svg, "utf8").toString("base64")}`;
    return `<figure>${caption}<img src="${url}" alt="${escapeHtml(item.title || "PlantUML diagram")}"></figure>`;
  });
  if (note) parts.push(`<p class="note">${escapeHtml(note)}</p>`);
  return parts.join("\n");
}

/**
 * Complete webview document with a strict CSP.
 * @param {string} body Output of {@link previewBody}.
 * @param {string} [nonce] Nonce for the style element (random when omitted).
 */
export function previewHtml(body, nonce = randomBytes(16).toString("base64")) {
  const csp = `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Excaliplant preview</title>
<style nonce="${nonce}">
body{margin:0;padding:12px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family)}
figure{margin:0 0 20px}
figcaption{margin:0 0 6px;opacity:.7;font-size:.9em}
img{display:block;max-width:100%;height:auto}
pre.error{white-space:pre-wrap;color:var(--vscode-errorForeground);margin:0}
.note{opacity:.7}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/**
 * @typedef {object} PreviewDeps
 * @property {any} vscode
 * @property {(uri: any) => import("./options.mjs").RenderContext} getContext
 * @property {(message: string) => void} [log]
 */

/**
 * Manages one preview panel per document.
 * @param {PreviewDeps} deps
 */
export function createPreviewManager(deps) {
  const { vscode } = deps;
  const log = deps.log ?? (() => {});
  /** @type {Map<string, { panel: any, uri: any, token: number }>} */
  const panels = new Map();
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  /**
   * @param {any} uri
   * @returns {Promise<string>}
   */
  async function readText(uri) {
    const open = vscode.workspace.textDocuments.find(
      (/** @type {any} */ d) => d.uri.toString() === uri.toString(),
    );
    if (open) return open.getText();
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
  }

  /**
   * Render the document into its panel. A newer render supersedes an older one.
   * @param {string} key
   */
  async function update(key) {
    const entry = panels.get(key);
    if (!entry) return;
    const token = ++entry.token;
    let html;
    try {
      const text = await readText(entry.uri);
      const ctx = deps.getContext(entry.uri);
      const diagrams = listDiagrams(text);
      const shown = diagrams.slice(0, MAX_PREVIEW_DIAGRAMS);
      const base = String(entry.uri.path ?? "")
        .split("/")
        .pop();
      /** @type {Parameters<typeof previewBody>[0]} */
      const items = [];
      for (const d of shown) {
        const title = shown.length > 1 ? (d.name ?? `Diagram ${d.index + 1}`) : "";
        const r = await toPreviewSvg(text, {
          options: blockOptions(ctx),
          block: d.index,
          filename: base || undefined,
        });
        items.push({ ...r, title });
      }
      const note =
        diagrams.length > shown.length
          ? `${diagrams.length - shown.length} more diagrams are not shown.`
          : undefined;
      html = previewHtml(previewBody(items, note));
    } catch (err) {
      html = previewHtml(previewBody([{ error: messageOf(err), title: "" }]));
    }
    if (token !== entry.token || !panels.has(key)) return;
    entry.panel.webview.html = html;
  }

  /** @param {string} key */
  function schedule(key) {
    const old = timers.get(key);
    if (old) clearTimeout(old);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        update(key).catch((/** @type {unknown} */ err) => log(`preview update failed: ${err}`));
      }, UPDATE_DELAY_MS),
    );
  }

  /**
   * Open (or reveal) the preview of `uri` beside the active editor.
   * @param {any} uri
   */
  function open(uri) {
    const key = uri.toString();
    const existing = panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    const name =
      String(uri.path ?? "")
        .split("/")
        .pop() || "diagram";
    const panel = vscode.window.createWebviewPanel(
      PREVIEW_VIEW_TYPE,
      `Preview ${name}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false, enableCommandUris: false, localResourceRoots: [] },
    );
    panels.set(key, { panel, uri, token: 0 });
    panel.onDidDispose(() => {
      panels.delete(key);
      const t = timers.get(key);
      if (t) clearTimeout(t);
      timers.delete(key);
    });
    update(key).catch((/** @type {unknown} */ err) => log(`preview update failed: ${err}`));
  }

  /** @param {{ uri: any }} doc */
  function documentChanged(doc) {
    const key = doc.uri.toString();
    if (panels.has(key)) schedule(key);
  }

  /** Re-render every open preview (settings or colour theme changed). */
  function refreshAll() {
    for (const key of panels.keys()) schedule(key);
  }

  function dispose() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    for (const { panel } of [...panels.values()]) panel.dispose();
    panels.clear();
  }

  return { open, documentChanged, refreshAll, dispose, panels };
}
