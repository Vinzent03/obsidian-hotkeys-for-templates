import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from "obsidian";

interface HotkeysForTemplateSettings {
  files: string[];
}

const DEFAULT_SETTINGS: HotkeysForTemplateSettings = {
  files: []
};

export default class HotkeysForTemplates extends Plugin {
  settings: HotkeysForTemplateSettings;
  corePlugin: any;

  async onload() {
    console.log('loading ' + this.manifest.name + " plugin");
    await this.loadSettings();
    this.corePlugin = (this.app as any).internalPlugins?.plugins["templates"]?.instance;
    if (!this.corePlugin) {
      new Notice("Cannot find Templates plugin. Please file an issue.");
      return;
    }

    this.addSettingTab(new SettingsTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {

      if (!this.corePlugin.options.folder) {
        new Notice("Template folder must be set");
        return;
      }

      for (const file of this.settings.files) {
        this.pushCommand(file);
      }
    });
  }

  onunload() {
    console.log('unloading ' + this.manifest.name + " plugin");
  }

  pushCommand(fileName: string) {
    if (this.getFile(fileName)) {
      this.addCommand({
        id: fileName,
        name: `Insert ${fileName.replace(".md", "")}`,
        callback: () => this.insertTemplate(fileName)
      });
    } else {
      this.settings.files.remove(fileName);
      this.saveSettings();
    }
  }


  insertTemplate(fileName: string): void {
    const file = this.getFile(fileName);

    if (!(file instanceof TFile)) {
      new Notice("Cannot find file");
      return;
    }

    this.corePlugin.insertTemplate(file);
  }

  getFile(fileName: string) {
    const templateFolder = this.corePlugin.options.folder;

    if (!templateFolder) {
      new Notice("Template folder must be set");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(normalizePath(templateFolder) + "/" + fileName);
    return file;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SettingsTab extends PluginSettingTab {
  plugin: HotkeysForTemplates;
  templateFiles: string[] = [];
  templateFolderPath: string;
  constructor(app: App, plugin: HotkeysForTemplates) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.templateFolderPath = normalizePath(this.plugin.corePlugin.options.folder);

    const templateFolder = this.plugin.app.vault.getAbstractFileByPath(this.templateFolderPath);
    if (!this.plugin.corePlugin.options.folder || !(templateFolder instanceof TFolder)) {
      new Notice("Cannot find template folder");
      return;
    }
    this.templateFiles = [];
    this.getTemplateFiles(templateFolder);

    let { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: this.plugin.manifest.name });
    containerEl.createEl("h3", {
      text: "By enabling a template, a command is added. You can set the hotkey for the command in the default 'Hotkeys' section",
    });

    for (const file of this.templateFiles) {
      this.addTemplateToggle(file);
    }
  }

  addTemplateToggle(file: string) {
    new Setting(this.containerEl)
      .setName(file.replace(".md", ""))
      .addToggle(cb => cb
        .setValue(this.plugin.settings.files.contains(file))
        .onChange((value) => {
          if (value) {
            this.plugin.settings.files.push(file);
            this.plugin.pushCommand(file);
          } else {
            this.plugin.settings.files.remove(file);
            (this.plugin.app as any).commands.removeCommand(`${this.plugin.manifest.id}:${file}`);
          }
          this.plugin.saveSettings();
        }));
  }

  getTemplateFiles(file: TAbstractFile) {
    if (file instanceof TFile && file.extension === "md") {
      this.templateFiles.push(file.path.substring(this.templateFolderPath.length + 1));
    } else if (file instanceof TFolder) {
      file.children.forEach(file => this.getTemplateFiles(file));
    }
  }
}
