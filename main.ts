import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from "obsidian";

interface TemplateFile {
  plugin: "core" | "templater";
  path: string;
}

interface HotkeysForTemplateSettings {
  files: string[];
  templaterFiles: string[];
}

const DEFAULT_SETTINGS: HotkeysForTemplateSettings = {
  files: [],
  templaterFiles: []
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
        this.pushCommand({ path: file, plugin: "core" });
      }
      for (const file of this.settings.templaterFiles) {
        this.pushCommand({ path: file, plugin: "templater" });
      }
    });
  }

  onunload() {
    console.log('unloading ' + this.manifest.name + " plugin");
  }

  pushCommand(templateFile: TemplateFile) {
    if (this.getFile(templateFile)) {
      if (templateFile.plugin === "core") {
        this.addCommand({
          id: templateFile.path,
          name: `Insert: ${templateFile.path.replace(".md", "")}`,
          callback: () => this.coreInsertTemplate(templateFile)
        });
      } else {
        this.addCommand({
          id: templateFile.plugin + ":" + templateFile.path,
          name: `Insert from Templater: ${templateFile.path.replace(".md", "")}`,
          callback: () => this.templaterInsertTemplate(templateFile)
        });
      }
    } else {
      if (templateFile.plugin === "core") {
        this.settings.files.remove(templateFile.path);
      } else {
        this.settings.templaterFiles.remove(templateFile.path);
      }
      this.saveSettings();
    }
  }


  coreInsertTemplate(fileName: TemplateFile): void {
    const file = this.getFile(fileName);

    if (!(file instanceof TFile)) {
      new Notice("Cannot find file");
      return;
    }

    this.corePlugin.insertTemplate(file);
  }

  templaterInsertTemplate(fileName: TemplateFile): void {
    const file = this.getFile(fileName);

    if (!(file instanceof TFile)) {
      new Notice("Cannot find file");
      return;
    }

    this.getTemplater().fuzzy_suggester.replace_templates_and_append(file);
  }

  getFile(fileName: TemplateFile) {
    let templateFolder;

    if (fileName.plugin === "core") {
      templateFolder = this.corePlugin.options.folder;
    } else {
      templateFolder = this.getTemplater().settings.template_folder;
    }

    if (!templateFolder) {
      new Notice("Template folder must be set");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(normalizePath(templateFolder) + "/" + fileName.path);
    return file;
  }

  getTemplater() {
    return (this.app as any).plugins.plugins["templater-obsidian"];
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
  constructor(app: App, plugin: HotkeysForTemplates) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {

    let { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: this.plugin.manifest.name });
    containerEl.createEl("h3", {
      text: "By enabling a template, a command is added. You can set the hotkey for the command in the default 'Hotkeys' section. If you have the 'Templater plugin' installed, you can set hotkeys for these templates too.",
    });

    // core templates plugin
    containerEl.createEl("h4", {
      text: "Templates by the core Templates plugin",
    });
    const coreTemplateFolderPath = normalizePath(this.plugin.corePlugin.options.folder);

    const coreTemplateFolder = this.plugin.app.vault.getAbstractFileByPath(coreTemplateFolderPath);
    if (!this.plugin.corePlugin.options.folder || !(coreTemplateFolder instanceof TFolder)) {
      new Notice("Cannot find template folder from core plugin.");
      return;
    }
    const coreTemplates = this.getTemplateFiles(coreTemplateFolder, coreTemplateFolderPath).map((e): TemplateFile => {
      return { path: e, plugin: "core" };
    });
    for (const file of coreTemplates) {
      this.addTemplateToggle(file);
    }

    // templater plugin
    const templater = this.plugin.getTemplater();
    if (!templater) return;

    containerEl.createEl("h4", {
      text: "Templates by the Templater plugin",
    });

    const templaterTemplateFolderPath = templater.settings.template_folder;
    const templaterTemplateFolder = this.plugin.app.vault.getAbstractFileByPath(templaterTemplateFolderPath);
    if (!templater.settings.template_folder || !(templaterTemplateFolder instanceof TFolder)) {
      new Notice("Cannot find template folder from Templater plugin");
      return;
    }
    const templaterTemplates = this.getTemplateFiles(coreTemplateFolder, coreTemplateFolderPath).map((e): TemplateFile => {
      return { path: e, plugin: "templater" };
    });

    for (const file of templaterTemplates) {
      this.addTemplateToggle(file);
    }
  }

  addTemplateToggle(file: TemplateFile) {
    new Setting(this.containerEl)
      .setName(file.path.replace(".md", ""))
      .addToggle(cb => cb
        .setValue(file.plugin === "core" ? this.plugin.settings.files.contains(file.path) : this.plugin.settings.templaterFiles.contains(file.path))
        .onChange((value) => this.onToggleChange(value, file)));
  }
  onToggleChange(value: boolean, file: TemplateFile) {
    if (value) {
      if (file.plugin === "core") {
        this.plugin.settings.files.push(file.path);
      } else {
        this.plugin.settings.templaterFiles.push(file.path);
      }
      this.plugin.pushCommand(file);
    } else {
      if (file.plugin === "core") {
        this.plugin.settings.files.remove(file.path);
      } else {
        this.plugin.settings.templaterFiles.remove(file.path);
      }
      (this.plugin.app as any).commands.removeCommand(`${this.plugin.manifest.id}:${file.plugin}:${file.path}`);
    }
    this.plugin.saveSettings();
  }

  getTemplateFiles(file: TAbstractFile, folderPath: string): string[] {
    if (file instanceof TFile && file.extension === "md") {
      return [file.path.substring(folderPath.length + 1)];
    } else if (file instanceof TFolder) {
      let temp: string[] = [];
      file.children.forEach(file => temp.push(...this.getTemplateFiles(file, folderPath)));
      return temp;
    } else {
      return [];
    }
  }
}
