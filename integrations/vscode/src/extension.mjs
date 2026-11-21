/**
 * Extension wiring. The VS Code API is passed in, so the same code runs in the
 * bundle (`main.mjs` hands over the real `vscode` module) and in the tests
 * (a mock). Nothing here reads files, opens sockets or sends telemetry.
 * @module vscode/extension
 */

import { readSettings } from "./config.mjs";
import { resolveIncludeRoot } from "./include.mjs";
import { createCommands } from "./commands.mjs";
import { createMarkdownIntegration } from "./markdown.mjs";
import { createPreviewManager } from "./preview.mjs";

/** Command ids; keep in sync with `contributes.commands` in package.json. */
export const COMMANDS = Object.freeze({
  renderExcalidraw: "excaliplant.renderExcalidraw",
  renderSvg: "excaliplant.renderSvg",
  openPreviewToSide: "excaliplant.openPreviewToSide",
  replaceInMarkdown: "excaliplant.replaceInMarkdown",
});

/**
 * @param {any} vscode The `vscode` module (or a mock of it).
 * @returns {{ activate: (context: any) => any, deactivate: () => void }}
 */
export function createExtension(vscode) {
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

  /** @param {any} context */
  function activate(context) {
    output = vscode.window.createOutputChannel?.("Excaliplant") ?? null;
    const markdown = createMarkdownIntegration({ vscode, getContext: () => getContext(), log });
    const preview = createPreviewManager({ vscode, getContext, log });
    const commands = createCommands({ vscode, getContext });

    /** @type {Array<{ dispose(): void }>} */
    const subs = [
      { dispose: () => markdown.dispose() },
      { dispose: () => preview.dispose() },
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
        const target = uri && uri.scheme ? uri : vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          vscode.window.showWarningMessage("Excaliplant: open a PlantUML file first.");
          return;
        }
        preview.open(target);
      }),
      vscode.workspace.onDidChangeTextDocument((/** @type {any} */ e) => {
        preview.documentChanged(e.document);
        markdown.schedulePrerender(e.document);
      }),
      vscode.workspace.onDidOpenTextDocument((/** @type {any} */ doc) =>
        markdown.schedulePrerender(doc),
      ),
      vscode.workspace.onDidChangeConfiguration((/** @type {any} */ e) => {
        if (!e.affectsConfiguration("excaliplant")) return;
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
    for (const doc of vscode.workspace.textDocuments ?? []) markdown.schedulePrerender(doc);

    return { extendMarkdownIt: (/** @type {any} */ md) => markdown.extendMarkdownIt(md) };
  }

  function deactivate() {
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
