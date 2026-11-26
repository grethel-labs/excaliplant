/**
 * Extension wiring. The VS Code API is passed in, so the same code runs in the
 * bundle (`main.mjs` hands over the real `vscode` module) and in the tests
 * (a mock). Nothing here reads files, opens sockets or sends telemetry.
 * @module vscode/extension
 */

import { isDiagramDocument, readSettings, readWarmupEnabled } from "./config.mjs";
import { warmup as defaultWarmup } from "./engine.mjs";
import { resolveIncludeRoot } from "./include.mjs";
import { createCommands } from "./commands.mjs";
import { createMarkdownIntegration } from "./markdown.mjs";
import { createPreviewManager, DIAGRAM_EDITOR_TYPE } from "./preview.mjs";

/** Command ids; keep in sync with `contributes.commands` in package.json. */
export const COMMANDS = Object.freeze({
  renderExcalidraw: "excaliplant.renderExcalidraw",
  renderSvg: "excaliplant.renderSvg",
  openPreviewToSide: "excaliplant.openPreviewToSide",
  openPreview: "excaliplant.openPreview",
  openSource: "excaliplant.openSource",
  replaceInMarkdown: "excaliplant.replaceInMarkdown",
});

/** Delay before the warm-up starts, so activation and the first render are not slowed down. */
const WARMUP_DELAY_MS = 250;

/**
 * @typedef {object} ExtensionOptions
 * @property {() => Promise<void>} [warmup] Pre-loads the layout engine (default: the library's `warmup`).
 * @property {number} [warmupDelayMs] Delay before it starts (default 250 ms).
 */

/**
 * @param {any} vscode The `vscode` module (or a mock of it).
 * @param {ExtensionOptions} [options]
 * @returns {{ activate: (context: any) => any, deactivate: () => void }}
 */
export function createExtension(vscode, options = {}) {
  const runWarmup = options.warmup ?? defaultWarmup;
  const warmupDelay = options.warmupDelayMs ?? WARMUP_DELAY_MS;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let warmupTimer = null;
  let warmupStarted = false;
  /** @type {any} */
  let output = null;
  /** @type {Array<{ dispose(): void }>} */
  let disposables = [];
  let includeGeneration = 0;

  /** @param {string} message */
  const log = (message) => {
    try {
      output?.appendLine(message);
    } catch {
      // the log channel is a convenience only
    }
  };

  /**
   * @param {any} [resource]
   * @returns {import("./options.mjs").RenderContext}
   */
  const getContext = (resource) => ({
    settings: readSettings(vscode, resource),
    workspaceFolder: (
      (resource && vscode.workspace.getWorkspaceFolder?.(resource)) ||
      vscode.workspace.workspaceFolders?.[0]
    )?.uri?.fsPath,
    includeGeneration,
  });

  /**
   * Start the layout engine warm-up in the background once a diagram document
   * is around (a PlantUML file or Markdown with a diagram fence), unless
   * `excaliplant.warmup` is off. Fire and forget, once, after a short delay;
   * the render path never waits for it and a failure is ignored.
   * @param {any} doc
   */
  function maybeWarmup(doc) {
    if (warmupStarted || warmupTimer || !isDiagramDocument(doc) || !readWarmupEnabled(vscode)) {
      return;
    }
    warmupTimer = setTimeout(() => {
      warmupTimer = null;
      if (warmupStarted || !readWarmupEnabled(vscode)) return;
      warmupStarted = true;
      try {
        Promise.resolve(runWarmup()).catch(() => {});
      } catch {
        // warming up is an optimisation only
      }
    }, warmupDelay);
    // Never keep a Node host (tests, extension host shutdown) alive for this.
    warmupTimer.unref?.();
  }

  /** @param {any} context */
  function activate(context) {
    output = vscode.window.createOutputChannel?.("Excaliplant") ?? null;
    const markdown = createMarkdownIntegration({ vscode, getContext: () => getContext(), log });
    const preview = createPreviewManager({ vscode, getContext, log });
    const commands = createCommands({ vscode, getContext });

    /** @param {any} uri */
    const previewTarget = (uri) => {
      const target = uri?.scheme ? uri : vscode.window.activeTextEditor?.document.uri;
      if (!target) vscode.window.showWarningMessage("Excaliplant: open a PlantUML file first.");
      return target;
    };

    /** @type {Array<{ dispose(): void }>} */
    const subs = [
      { dispose: () => markdown.dispose() },
      { dispose: () => preview.dispose() },
      vscode.window.registerCustomEditorProvider(
        DIAGRAM_EDITOR_TYPE,
        {
          resolveCustomTextEditor: (/** @type {any} */ document, /** @type {any} */ panel) =>
            preview.attach(document.uri, panel),
        },
        { supportsMultipleEditorsPerDocument: true },
      ),
      vscode.commands.registerCommand(COMMANDS.renderExcalidraw, (/** @type {any} */ uri) =>
        commands.renderTo("excalidraw", uri),
      ),
      vscode.commands.registerCommand(COMMANDS.renderSvg, (/** @type {any} */ uri) =>
        commands.renderTo("svg", uri),
      ),
      vscode.commands.registerCommand(COMMANDS.replaceInMarkdown, (/** @type {any} */ uri) =>
        commands.replaceInMarkdown(uri),
      ),
      vscode.commands.registerCommand(COMMANDS.openPreviewToSide, (/** @type {any} */ uri) => {
        const target = previewTarget(uri);
        if (target) preview.open(target);
      }),
      vscode.commands.registerCommand(COMMANDS.openPreview, (/** @type {any} */ uri) => {
        const target = previewTarget(uri);
        if (!target) return;
        return vscode.commands.executeCommand("vscode.openWith", target, DIAGRAM_EDITOR_TYPE, {
          viewColumn: vscode.window.tabGroups.activeTabGroup.viewColumn,
        });
      }),
      vscode.commands.registerCommand(COMMANDS.openSource, async () => {
        const group = vscode.window.tabGroups.activeTabGroup;
        const input = group.activeTab?.input;
        if (input?.viewType !== DIAGRAM_EDITOR_TYPE) return;
        const document = await vscode.workspace.openTextDocument(input.uri);
        return vscode.window.showTextDocument(document, { viewColumn: group.viewColumn });
      }),
      vscode.workspace.onDidChangeTextDocument((/** @type {any} */ e) => {
        preview.documentChanged(e.document);
        markdown.schedulePrerender(e.document);
        maybeWarmup(e.document);
      }),
      vscode.workspace.onDidOpenTextDocument((/** @type {any} */ doc) => {
        markdown.schedulePrerender(doc);
        maybeWarmup(doc);
      }),
      vscode.workspace.onDidChangeConfiguration((/** @type {any} */ e) => {
        if (!e.affectsConfiguration("excaliplant")) return;
        // Turning the setting on later warms up for documents that are already open.
        for (const doc of vscode.workspace.textDocuments ?? []) maybeWarmup(doc);
        watchIncludes();
        markdown.reconfigure();
        preview.refreshAll();
      }),
      vscode.workspace.onDidGrantWorkspaceTrust?.(() => {
        watchIncludes();
        markdown.reconfigure();
        preview.refreshAll();
      }),
      vscode.window.onDidChangeActiveColorTheme?.(() => {
        // `theme: auto` follows the colour theme; the cache is keyed by the
        // resolved theme, so this is cheap when nothing visible changes.
        markdown.reconfigure();
        preview.refreshAll();
      }),
      { dispose: () => watcher?.dispose() },
    ];

    /** @type {{ dispose(): void } | null} */
    let watcher = null;
    /** Watch the include folder so edited include files re-render diagrams. */
    function watchIncludes() {
      watcher?.dispose();
      watcher = null;
      const ctx = getContext();
      const root = resolveIncludeRoot(ctx.settings.includeDir, ctx.workspaceFolder);
      if (!root || !vscode.workspace.createFileSystemWatcher) return;
      const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, "**/*"));
      const bump = () => {
        includeGeneration++;
        markdown.reconfigure();
        preview.refreshAll();
      };
      w.onDidChange?.(bump);
      w.onDidCreate?.(bump);
      w.onDidDelete?.(bump);
      watcher = w;
    }
    watchIncludes();

    disposables = subs.filter(Boolean);
    for (const d of disposables) context?.subscriptions?.push(d);
    if (output) context?.subscriptions?.push(output);

    // Documents that were open before activation.
    for (const doc of vscode.workspace.textDocuments ?? []) {
      markdown.schedulePrerender(doc);
      maybeWarmup(doc);
    }

    return { extendMarkdownIt: (/** @type {any} */ md) => markdown.extendMarkdownIt(md) };
  }

  function deactivate() {
    if (warmupTimer) clearTimeout(warmupTimer);
    warmupTimer = null;
    for (const d of disposables.splice(0)) {
      try {
        d?.dispose();
      } catch {
        // already disposed
      }
    }
  }

  return { activate, deactivate };
}
