/**
 * Settings tab.
 * @module settings_tab
 */

import { PluginSettingTab, Setting } from "obsidian";
import { THEME_CHOICES } from "./config.js";

const THEME_LABELS = {
  auto: "Automatic (follows light/dark mode)",
  sketch: "Sketch",
  plain: "Plain",
  hachure: "Hachure",
  mono: "Monochrome",
  dark: "Dark",
  blueprint: "Blueprint",
};

export class ExcaliplantSettingTab extends PluginSettingTab {
  /**
   * @param {import("obsidian").App} app
   * @param {import("./main.js").default} plugin
   */
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl, plugin } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Theme")
      .setDesc(
        "Colours and line style. Single blocks can override it: ```plantuml {theme=blueprint}",
      )
      .addDropdown((dd) => {
        for (const name of THEME_CHOICES) {
          dd.addOption(name, /** @type {Record<string, string>} */ (THEME_LABELS)[name] ?? name);
        }
        dd.setValue(plugin.settings.theme).onChange((value) =>
          plugin.updateSettings({ theme: value }),
        );
      });

    new Setting(containerEl)
      .setName("Clean strokes")
      .setDesc("Draw straight, regular lines instead of the hand-drawn look.")
      .addToggle((t) =>
        t
          .setValue(plugin.settings.clean)
          .onChange((value) => plugin.updateSettings({ clean: value })),
      );

    new Setting(containerEl)
      .setName("Seed")
      .setDesc("Changes the stroke wobble of the hand-drawn look. Leave empty for the default.")
      .addText((t) =>
        t
          .setPlaceholder("Default")
          .setValue(plugin.settings.seed)
          .onChange((value) => plugin.updateSettings({ seed: value })),
      );

    new Setting(containerEl)
      .setName("Maximum width")
      .setDesc("Largest display width of a diagram in pixels. 0 means the width of the note.")
      .addText((t) =>
        t
          .setPlaceholder("0")
          .setValue(String(plugin.settings.maxWidth))
          .onChange((value) => plugin.updateSettings({ maxWidth: Number(value) })),
      );

    new Setting(containerEl)
      .setName("Transparent background")
      .setDesc("Let the note background show through. Works best with the automatic theme.")
      .addToggle((t) =>
        t
          .setValue(plugin.settings.transparent)
          .onChange((value) => plugin.updateSettings({ transparent: value })),
      );

    new Setting(containerEl)
      .setName("Show warnings")
      .setDesc("List ignored or unsupported lines below each diagram.")
      .addToggle((t) =>
        t
          .setValue(plugin.settings.showWarnings)
          .onChange((value) => plugin.updateSettings({ showWarnings: value })),
      );

    new Setting(containerEl)
      .setName("Prepare in the background")
      .setDesc(
        "Load the layout engine shortly after Obsidian starts, so the first class, component or state diagram appears quickly. Turn off to load it only when a diagram needs it. Turning it off takes effect at the next start.",
      )
      .addToggle((t) =>
        t
          .setValue(plugin.settings.warmup)
          .onChange((value) => plugin.updateSettings({ warmup: value })),
      );
  }
}
