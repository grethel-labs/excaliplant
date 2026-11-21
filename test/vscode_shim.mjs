// Test shim for the VS Code extension: a small in-memory `vscode` API and a
// mini markdown-it. Not a test file (the runner only picks up *.test.mjs).

import path from "node:path";

/** Minimal event emitter with VS Code's `Event` shape. */
export function emitter() {
  /** @type {Set<(e: any) => void>} */
  const listeners = new Set();
  return {
    event: (/** @type {(e: any) => void} */ fn) => {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
    fire: (/** @type {any} */ e) => {
      for (const fn of [...listeners]) fn(e);
    },
    get size() {
      return listeners.size;
    },
  };
}

export class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

export class Uri {
  constructor(scheme, p) {
    this.scheme = scheme;
    this.path = p;
  }
  get fsPath() {
    return this.path;
  }
  with(change) {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
  }
  toString() {
    return `${this.scheme}://${this.path}`;
  }
  static file(p) {
    return new Uri("file", p);
  }
  static joinPath(base, ...parts) {
    return base.with({ path: path.posix.join(base.path, ...parts) });
  }
}

export class WorkspaceEdit {
  constructor() {
    this.edits = [];
  }
  replace(uri, range, text) {
    this.edits.push({ uri, range, text });
  }
}

/**
 * A text document backed by a mutable string.
 * @param {string} file
 * @param {string} languageId
 * @param {string} text
 */
export function mockDocument(file, languageId, text) {
  const doc = {
    uri: Uri.file(file),
    languageId,
    text,
    getText: () => doc.text,
    positionAt(offset) {
      const before = doc.text.slice(0, offset).split("\n");
      return new Position(before.length - 1, before[before.length - 1].length);
    },
  };
  return doc;
}

/**
 * Build a mock `vscode` module plus the state the tests inspect.
 * @param {{ settings?: Record<string, any>, trusted?: boolean, dark?: boolean, folder?: string }} [init]
 */
export function createMockVscode(init = {}) {
  const state = {
    settings: { ...(init.settings ?? {}) },
    trusted: init.trusted !== false,
    colorKind: init.dark ? 2 : 1,
    commands: new Map(),
    executed: /** @type {any[][]} */ ([]),
    messages: /** @type {{ level: string, text: string }[]} */ ([]),
    files: new Map(),
    dirs: new Set(),
    documents: new Map(),
    panels: /** @type {any[]} */ ([]),
    quickPickAnswer: /** @type {number} */ (0),
    saveAnswer: /** @type {((defaultUri: any) => any) | null} */ (null),
    activeTextEditor: /** @type {any} */ (undefined),
    folder: init.folder ?? "/ws",
    watchers: /** @type {any[]} */ ([]),
    quickPicks: /** @type {any[][]} */ ([]),
  };
  const events = {
    changeDoc: emitter(),
    openDoc: emitter(),
    config: emitter(),
    trust: emitter(),
    theme: emitter(),
  };

  const message = (level) => (text) => {
    state.messages.push({ level, text: String(text) });
    return Promise.resolve(undefined);
  };

  const vscode = {
    Uri,
    Range,
    Position,
    WorkspaceEdit,
    RelativePattern: class {
      constructor(base, pattern) {
        this.base = base;
        this.pattern = pattern;
      }
    },
    ViewColumn: { Beside: -2 },
    ProgressLocation: { Window: 10, Notification: 15 },
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
    commands: {
      registerCommand(id, fn) {
        state.commands.set(id, fn);
        return { dispose: () => state.commands.delete(id) };
      },
      async executeCommand(id, ...args) {
        state.executed.push([id, ...args]);
        const fn = state.commands.get(id);
        return fn ? fn(...args) : undefined;
      },
    },
    window: {
      get activeTextEditor() {
        return state.activeTextEditor;
      },
      get activeColorTheme() {
        return { kind: state.colorKind };
      },
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      showWarningMessage: message("warning"),
      showErrorMessage: message("error"),
      showInformationMessage: message("info"),
      showQuickPick(items, opts) {
        state.quickPicks.push(items);
        return Promise.resolve(items[state.quickPickAnswer]);
      },
      showSaveDialog(opts) {
        return Promise.resolve(state.saveAnswer ? state.saveAnswer(opts.defaultUri) : undefined);
      },
      withProgress: (_o, task) => task(),
      onDidChangeActiveColorTheme: events.theme.event,
      createWebviewPanel(viewType, title, column, options) {
        const disposed = emitter();
        const panel = {
          viewType,
          title,
          column,
          options,
          revealed: 0,
          webview: { html: "" },
          reveal() {
            panel.revealed++;
          },
          onDidDispose: disposed.event,
          dispose() {
            disposed.fire();
          },
        };
        state.panels.push(panel);
        return panel;
      },
    },
    workspace: {
      get isTrusted() {
        return state.trusted;
      },
      get textDocuments() {
        return [...state.documents.values()];
      },
      get workspaceFolders() {
        return [{ uri: Uri.file(state.folder), name: "ws" }];
      },
      getWorkspaceFolder: () => ({ uri: Uri.file(state.folder), name: "ws" }),
      getConfiguration(section) {
        return {
          get: (key, dflt) => {
            const full = `${section}.${key}`;
            return full in state.settings ? state.settings[full] : dflt;
          },
        };
      },
      async openTextDocument(uri) {
        const doc = state.documents.get(uri.toString());
        if (!doc) throw new Error(`Cannot open ${uri.toString()}`);
        return doc;
      },
      async applyEdit(edit) {
        for (const e of edit.edits) {
          const doc = state.documents.get(e.uri.toString());
          doc.text = e.text;
        }
        return true;
      },
      fs: {
        async writeFile(uri, data) {
          state.files.set(uri.path, Buffer.from(data).toString("utf8"));
        },
        async createDirectory(uri) {
          state.dirs.add(uri.path);
        },
      },
      createFileSystemWatcher(pattern) {
        const w = {
          pattern,
          change: emitter(),
          create: emitter(),
          del: emitter(),
          disposed: false,
        };
        state.watchers.push(w);
        return {
          onDidChange: w.change.event,
          onDidCreate: w.create.event,
          onDidDelete: w.del.event,
          dispose: () => {
            w.disposed = true;
          },
        };
      },
      onDidChangeTextDocument: events.changeDoc.event,
      onDidOpenTextDocument: events.openDoc.event,
      onDidChangeConfiguration: events.config.event,
      onDidGrantWorkspaceTrust: events.trust.event,
    },
  };

  /** Register a document and optionally make it the active editor. */
  function addDocument(file, languageId, text, { active = false, line = 0 } = {}) {
    const doc = mockDocument(file, languageId, text);
    state.documents.set(doc.uri.toString(), doc);
    if (active) {
      state.activeTextEditor = { document: doc, selection: { active: new Position(line, 0) } };
    }
    return doc;
  }

  return { vscode, state, events, addDocument };
}

/** Wait until `fn()` is truthy. */
export async function waitFor(fn, { timeout = 20_000, interval = 25 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * A just-enough markdown-it: fenced blocks only, everything else is a paragraph.
 * It has the pieces the excaliplant plugin uses: `renderer.rules.fence`, `parse`, `use`.
 */
export function createMiniMarkdownIt() {
  const md = {
    renderer: {
      rules: {
        fence: (tokens, idx) =>
          `<pre><code>${tokens[idx].content.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>\n`,
      },
    },
    use(plugin, options) {
      plugin(md, options);
      return md;
    },
    parse(text) {
      const tokens = [];
      const lines = String(text).split("\n");
      for (let i = 0; i < lines.length; i++) {
        const open = /^ {0,3}(`{3,})(.*)$/.exec(lines[i]);
        if (!open) {
          if (lines[i].trim()) tokens.push({ type: "paragraph", content: lines[i] });
          continue;
        }
        const body = [];
        i++;
        while (i < lines.length && !/^ {0,3}`{3,}\s*$/.test(lines[i])) body.push(lines[i++]);
        tokens.push({
          type: "fence",
          info: open[2].trim(),
          content: body.length ? `${body.join("\n")}\n` : "",
        });
      }
      return tokens;
    },
    render(text, env = {}) {
      const tokens = md.parse(text, env);
      return tokens
        .map((t, i) =>
          t.type === "fence"
            ? md.renderer.rules.fence(tokens, i, {}, env, md.renderer)
            : `<p>${t.content}</p>\n`,
        )
        .join("");
    },
  };
  return md;
}
