/**
 * Excaliplant for Obsidian: renders ```plantuml / ```puml / ```uml code blocks
 * as Excalidraw-style SVG, entirely offline (no network access, no telemetry).
 * @module main
 */

import { MarkdownRenderChild, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LANGUAGES, normalizeSettings } from "./config.js";
import {
  createRenderCache,
  exportBlock,
  fenceAttrsAt,
  findBlock,
  isDarkMode,
  renderInto,
  resolveOptions,
} from "./engine.js";
import { ExcaliplantSettingTab } from "./settings_tab.js";

/** One rendered code block; re-renders when settings or the colour scheme change. */
class DiagramBlock extends MarkdownRenderChild {
  /**
   * @param {ExcaliplantPlugin} plugin
   * @param {HTMLElement} el
   * @param {string} source
   * @param {import("../../../src/markdown/scan.mjs").FenceAttrs} attrs
   * @param {number | null} noteLine 1-based line of the opening fence, if known.
   */
  constructor(plugin, el, source, attrs, noteLine) {
    super(el);
    this.plugin = plugin;
    this.source = source;
    this.attrs = attrs;
    this.noteLine = noteLine;
    this.generation = 0;
  }

  onload() {
    this.plugin.blocks.add(this);
  }

  onunload() {
    this.generation++;
    this.plugin.blocks.delete(this);
  }

  /** @returns {Promise<void>} */
  async draw() {
    const generation = ++this.generation;
    const { settings, cache } = this.plugin;
    const options = resolveOptions(settings, this.attrs, {
      dark: isDarkMode(),
      scope: ".excaliplant",
      cache,
    });
    try {
      await renderInto(this.containerEl, this.source, options, {
        attrs: this.attrs,
        noteLine: this.noteLine,
        showWarnings: settings.showWarnings,
        maxWidth: settings.maxWidth,
        isActive: () => generation === this.generation,
      });
    } catch (err) {
      console.error("Excaliplant: rendering failed", err);
    }
  }
}

export default class ExcaliplantPlugin extends Plugin {
  async onload() {
    this.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...(await this.loadData()) });
    this.cache = createRenderCache();
    /** @type {Set<DiagramBlock>} */
    this.blocks = new Set();

    for (const lang of LANGUAGES) {
      this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
        const info = ctx.getSectionInfo(el);
        const fence = info ? fenceAttrsAt(info.text, info.lineStart) : null;
        el.addClass("excaliplant-block");
        const child = new DiagramBlock(
          this,
          el,
          source,
          fence?.attrs ?? {},
          info && fence?.fenceLine ? info.lineStart + 1 : null,
        );
        ctx.addChild(child);
        return child.draw();
      });
    }

    const exports = [
      ["export-excalidraw", "Export diagram as .excalidraw attachment", "excalidraw"],
      ["export-svg", "Export diagram as SVG attachment", "svg"],
      ["export-png", "Export diagram as PNG attachment", "png"],
    ];
    for (const [id, name, kind] of exports) {
      this.addCommand({
        id,
        name,
        editorCallback: (editor, view) => this.exportAtCursor(editor, view, kind),
      });
    }
    this.addCommand({
      id: "copy-excalidraw-json",
      name: "Copy diagram as Excalidraw JSON",
      editorCallback: (editor, view) => this.exportAtCursor(editor, view, "clipboard"),
    });

    this.addSettingTab(new ExcaliplantSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        if (this.settings.theme === "auto") this.redrawAll();
      }),
    );
  }

  /** @param {Partial<import("./config.js").ExcaliplantSettings>} patch */
  async updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    await this.saveData(this.settings);
    this.redrawAll();
  }

  redrawAll() {
    for (const block of this.blocks) void block.draw();
  }

  /**
   * @param {import("obsidian").Editor} editor
   * @param {import("obsidian").MarkdownView | import("obsidian").MarkdownFileInfo} view
   * @param {import("./engine.js").ExportKind} kind
   */
  async exportAtCursor(editor, view, kind) {
    const block = findBlock(editor.getValue(), editor.getCursor().line);
    if (!block) {
      new Notice("Place the cursor inside a PlantUML code block.");
      return;
    }
    const file = view.file ?? null;
    try {
      const options = resolveOptions(this.settings, block.attrs, {
        dark: isDarkMode(),
        cache: this.cache,
        forExport: true,
      });
      const out = await exportBlock(kind, block.source, options, file?.basename ?? "");
      if (kind === "clipboard") {
        await navigator.clipboard.writeText(/** @type {string} */ (out.data));
        new Notice("Copied the diagram as Excalidraw JSON.");
        return;
      }
      const path = await this.app.fileManager.getAvailablePathForAttachment(
        out.name,
        file?.path ?? "",
      );
      if (typeof out.data === "string") await this.app.vault.create(path, out.data);
      else await this.app.vault.createBinary(path, out.data);
      new Notice(`Saved ${path}`);
    } catch (err) {
      new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
