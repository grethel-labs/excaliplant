// Minimal stand-in for the `obsidian` module and the browser DOM, just enough
// to exercise the plugin without Obsidian. Used by obsidian*.test.mjs.

export class FakeElement {
  /**
   * @param {string} tagName
   * @param {FakeDocument} ownerDocument
   */
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.nodeName = tagName;
    this.ownerDocument = ownerDocument;
    this.className = "";
    this.textContent = "";
    /** @type {FakeElement[]} */
    this.children = [];
    this.attributes = new Map();
    this.styleProps = new Map();
    this.style = { setProperty: (k, v) => this.styleProps.set(k, v) };
  }
  set innerHTML(_v) {
    throw new Error("innerHTML must not be used");
  }
  set outerHTML(_v) {
    throw new Error("outerHTML must not be used");
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }
  getAttribute(k) {
    return this.attributes.get(k) ?? null;
  }
  addClass(c) {
    this.className = `${this.className} ${c}`.trim();
  }
  /** Concatenated text of this element and its descendants. */
  get allText() {
    return this.textContent + this.children.map((c) => c.allText ?? "").join("\n");
  }
  /** @param {string} cls */
  find(cls) {
    if (this.className.split(/\s+/).includes(cls)) return this;
    for (const c of this.children) {
      const hit = c.find?.(cls);
      if (hit) return hit;
    }
    return null;
  }
}

export class FakeDocument {
  constructor(dark = false) {
    this.body = { classList: { contains: (c) => dark && c === "theme-dark" } };
    this.dark = dark;
  }
  createElement(tag) {
    return new FakeElement(tag, this);
  }
  importNode(node) {
    return node;
  }
}

/** DOMParser stand-in: remembers the string it was given. */
export class FakeDOMParser {
  parseFromString(text, type) {
    FakeDOMParser.calls.push({ text, type });
    const ok = text.startsWith("<svg");
    return {
      documentElement: { nodeName: ok ? "svg" : "parsererror", svgText: text },
      querySelector: () => null,
    };
  }
}
FakeDOMParser.calls = [];

/** Install `document`, `DOMParser` and `navigator.clipboard` on globalThis. */
export function installDom({ dark = false } = {}) {
  const doc = new FakeDocument(dark);
  globalThis.document = doc;
  globalThis.DOMParser = FakeDOMParser;
  FakeDOMParser.calls = [];
  const clipboard = { text: "", writeText: async (t) => void (clipboard.text = t) };
  Object.defineProperty(globalThis, "navigator", { value: { clipboard }, configurable: true });
  return { doc, clipboard };
}

export const notices = [];
export class Notice {
  constructor(message) {
    this.message = message;
    notices.push(message);
  }
}

export class Component {
  onload() {}
  onunload() {}
}

export class MarkdownRenderChild extends Component {
  constructor(containerEl) {
    super();
    this.containerEl = containerEl;
  }
}

export class Plugin extends Component {
  constructor(app = createApp(), manifest = { id: "excaliplant" }) {
    super();
    this.app = app;
    this.manifest = manifest;
    this.stored = null;
    this.processors = new Map();
    this.commands = [];
    this.tabs = [];
    this.events = [];
  }
  async loadData() {
    return this.stored;
  }
  async saveData(data) {
    this.stored = JSON.parse(JSON.stringify(data));
  }
  registerMarkdownCodeBlockProcessor(lang, fn) {
    this.processors.set(lang, fn);
  }
  addCommand(cmd) {
    this.commands.push(cmd);
    return cmd;
  }
  addSettingTab(tab) {
    this.tabs.push(tab);
  }
  registerEvent(ref) {
    this.events.push(ref);
  }
}

export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = { empty() {} };
  }
}

export class Setting {
  constructor() {}
}

/** Fake `App` that records vault writes. */
export function createApp() {
  const created = [];
  const handlers = new Map();
  return {
    created,
    handlers,
    workspace: {
      on(name, fn) {
        handlers.set(name, fn);
        return { name };
      },
    },
    fileManager: {
      getAvailablePathForAttachment: async (name, source) => `attachments/${name}#${source}`,
    },
    vault: {
      create: async (path, data) => void created.push({ path, data }),
      createBinary: async (path, data) => void created.push({ path, data }),
    },
  };
}

/** Context passed to a code block processor. */
export function createContext({ text = "", lineStart = 0, children = [] } = {}) {
  return {
    getSectionInfo: () => (text ? { text, lineStart, lineEnd: lineStart + 1 } : null),
    addChild(child) {
      children.push(child);
      child.onload();
    },
    children,
  };
}

/** Fake editor for editorCallback commands. */
export function createEditor(text, line) {
  return { getValue: () => text, getCursor: () => ({ line, ch: 0 }) };
}
