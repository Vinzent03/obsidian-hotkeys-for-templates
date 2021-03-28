import { App, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from "obsidian";

interface MyPluginSettings {
  files: string[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  files: []
};

export default class HotkeysForTemplates extends Plugin {
  settings: MyPluginSettings;
  corePlugin: any;

  async onload() {
    console.log('loading ' + this.manifest.name + " plugin");
    await this.loadSettings();
    this.corePlugin = (this.app as any).internalPlugins.plugins["templates"].instance;
    this.addSettingTab(new SettingsTab(this.app, this));

    for (const file of this.settings.files) {
      this.pushCommand(this, file);
    }
  }

  onunload() {
    console.log('unloading ' + this.manifest.name + " plugin");
  }

  pushCommand(plugin: HotkeysForTemplates, fileName: string) {
    plugin.addCommand({
      id: fileName,
      name: `Insert ${fileName.replace(".md", "")}`,
      callback: () => this.insertTemplate(fileName)
    });
  }


  insertTemplate(filePath: string): void {
    const templateFolder = this.corePlugin.options.folder;

    if (!templateFolder) {
      new Notice("Template folder must be set");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(templateFolder + "/" + filePath);

    if (!(file instanceof TFile)) {
      new Notice("Cannot find file");
      return;
    }

    this.corePlugin.insertTemplate(file);
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

    this.templateFolderPath = this.plugin.corePlugin.options.folder;
    const templateFolder = this.plugin.app.vault.getAbstractFileByPath(this.templateFolderPath);
    if (!(templateFolder instanceof TFolder)) {
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

    for (const file of this.plugin.settings.files) {
      if (!this.templateFiles.contains(file)) {
        this.plugin.settings.files.remove(file);
      }
    }
    this.plugin.saveSettings();

    for (const file of this.templateFiles) {
      this.addTextField(file);
    }
  }

  addTextField(file: string) {
    new Setting(this.containerEl)
      .setName(file.replace(".md", ""))
      .addToggle(cb => cb
        .setValue(this.plugin.settings.files.contains(file))
        .onChange((value) => {
          if (value) {
            this.plugin.settings.files.push(file);
            this.plugin.pushCommand(this.plugin, file);
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
