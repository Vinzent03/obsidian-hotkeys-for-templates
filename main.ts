import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from "obsidian";

interface TemplateFile {
  plugin: "core" | "templater";
  path: string;
}

interface HotkeysForTemplateSettings {
  files: string[],
  templaterFiles: string[],
}

const DEFAULT_SETTINGS: HotkeysForTemplateSettings = {
  files: [],
  templaterFiles: [],
};

export default class HotkeysForTemplates extends Plugin {
  settings: HotkeysForTemplateSettings;

  activePlugins: string[] = [];
  templaterFolder: TFolder;
  coreTemplateFolder: TFolder;
  noActivePluginMsg: string = ('No templating plugin found. Please activate one or both of the core `Templates` or the community `Templater` plugins.');
  corePlugin: any;
  templaterPlugin: any;

  async onload() {
    console.log('loading ' + this.manifest.name + ' plugin v' + this.manifest.version);
    await this.loadSettings();
    this.app.workspace.onLayoutReady(() => {
      this.addSettingTab(new SettingsTab(this.app, this));
      this.enumerateTemplates();
    });
  }

  onunload() {
    console.log('unloading ' + this.manifest.name + " plugin");
  }

  enumerateTemplates() {
    this.activePlugins = [];
    this.corePlugin = (this.app as any).internalPlugins?.plugins["templates"];
    this.templaterPlugin = (this.app as any).plugins.plugins["templater-obsidian"];

    if (this.templaterPlugin && this.templaterPlugin._loaded) { // templater-obsidian enabled
      const templaterFolderPath = normalizePath(this.templaterPlugin.settings.template_folder);
      const templaterFolder = this.app.vault.getAbstractFileByPath(templaterFolderPath);
      if (!(templaterFolder instanceof TFolder) || templaterFolderPath === "/") {
        new Notice("Templater folder must be set");
      } else {
        this.templaterFolder = templaterFolder;
        this.activePlugins.push('templater-obsidian');

        for (const file of this.settings.templaterFiles) {
          this.pushCommand({ path: file, plugin: "templater" });
        }
      }
    }
    if (this.corePlugin && this.corePlugin.enabled) { //core plugin enabled
      const coreTemplateFolderPath = normalizePath(this.corePlugin.instance.options.folder);
      const coreTemplateFolder = this.app.vault.getAbstractFileByPath(coreTemplateFolderPath);
      if (!(coreTemplateFolder instanceof TFolder) || coreTemplateFolderPath === "/") {
        new Notice("Template (core plugin) folder must be set");
      } else {
        this.coreTemplateFolder = coreTemplateFolder;
        this.activePlugins.push('core');

        for (const file of this.settings.files) {
          this.pushCommand({ path: file, plugin: "core" });
        }
      }
    }
    if (!this.activePlugins.length) {
      new Notice(this.manifest.name + ': ' + this.noActivePluginMsg);
      return;
    } else {
      console.log(this.manifest.name + ' -> active plugins: ' + this.activePlugins);
    }
  }

  pushCommand(templateFile: TemplateFile) {
    if (this.getFile(templateFile)) {
      switch (templateFile.plugin) {
        case 'core':
          this.addCommand({
            id: templateFile.path,
            name: `Insert: ${templateFile.path.replace(".md", "")}`,
            callback: () => this.coreInsertTemplate(templateFile)
          });
          break;
        case 'templater':
          this.addCommand({
            id: templateFile.plugin + ":" + templateFile.path,
            name: `Insert from Templater: ${templateFile.path.replace(".md", "")}`,
            callback: () => this.templaterInsertTemplate(templateFile)
          });
          break;
        default:
          new Notice(this.manifest.name + ': Unknown plugin type for ' + templateFile.path);
          return;
      }
    } else {
      switch (templateFile.plugin) {
        case 'core':
          this.settings.files.remove(templateFile.path);
          break;
        case 'templater':
          this.settings.templaterFiles.remove(templateFile.path);
          break;
        default:
          new Notice(this.manifest.name + ': Unknown plugin type for ' + templateFile.path);
          return;
      }
      this.saveSettings();
    }
  }

  coreInsertTemplate(fileName: TemplateFile): void {
    const file = this.getFile(fileName);
    if (!file) {
      new Notice('Cannot find file: ' + fileName.path);
      return;
    } else {
      this.corePlugin.instance.insertTemplate(file);
    }
  }

  templaterInsertTemplate(fileName: TemplateFile): void {
    const file = this.getFile(fileName);
    if (!file) {
      new Notice('Cannot find file: ' + fileName.path);
      return;
    } else {
      this.templaterPlugin.parser.replace_templates_and_append(file);
    }
  }

  getFile(file: TemplateFile): TFile {
    let thisTemplateFolder;
    let thisTemplateFile;
    switch (file.plugin) {
      case 'core':
        thisTemplateFolder = this.coreTemplateFolder.path;
        break;
      case 'templater':
        thisTemplateFolder = this.templaterFolder.path;
        break;
      default:
        new Notice(this.manifest.name + ': Unknown plugin type for ' + file.path);
        return;
    }
    thisTemplateFile = this.app.vault.getAbstractFileByPath(thisTemplateFolder + "/" + file.path);
    if (thisTemplateFile instanceof TFile) {
      return (thisTemplateFile as TFile);
    }
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
    this.plugin.enumerateTemplates();
    containerEl.empty();
    containerEl.createEl("h2", { text: this.plugin.manifest.name });
    if (!this.plugin.activePlugins.length) {
      containerEl.createEl("h3", {
        text: this.plugin.noActivePluginMsg
      });
      return;
    }
    containerEl.createEl("h4", {
      text: "By enabling a template, a command is added. You can set the hotkey for the command in the default 'Hotkeys' section.",
    });
    if (this.plugin.activePlugins.includes('templater-obsidian')) {
      containerEl.createEl("h3", {
        text: "Templates defined by the templater-obsidian plugin",
      });
      const templaterTemplates = this.getTemplateFiles(this.plugin.templaterFolder, this.plugin.templaterFolder.path).map((e): TemplateFile => {
        return { path: e, plugin: "templater" };
      });
      for (const file of templaterTemplates) {
        this.addTemplateToggle(file);
      }
    }
    if (this.plugin.activePlugins.includes('core')) {
      containerEl.createEl("h3", {
        text: "Templates defined by the core Templates plugin",
      });
      const coreTemplates = this.getTemplateFiles(this.plugin.coreTemplateFolder, this.plugin.coreTemplateFolder.path).map((e): TemplateFile => {
        return { path: e, plugin: "core" };
      });
      for (const file of coreTemplates) {
        this.addTemplateToggle(file);
      }
    }
  }

  templateIsEnabled(file: TemplateFile): boolean {
    switch (file.plugin) {
      case 'core':
        return this.plugin.settings.files.contains(file.path);
      case 'templater':
        return this.plugin.settings.templaterFiles.contains(file.path);
      default:
        console.log(file.path + ' is associated with an unknown plugin');
        return false;
    }
  }

  addTemplateToggle(file: TemplateFile) {
    new Setting(this.containerEl)
      .setName(file.path.replace(".md", ""))
      .addToggle(cb => cb
        .setValue(this.templateIsEnabled(file))
        .onChange((value) => this.onToggleChange(value, file)));
  }
  onToggleChange(value: boolean, file: TemplateFile) {
    if (value) {
      switch (file.plugin) {
        case 'core':
          this.plugin.settings.files.push(file.path);
          break;
        case 'templater':
          this.plugin.settings.templaterFiles.push(file.path);
          break;
        default:
          console.log(file.path + ' is associated with an unknown plugin');
          return;
      }
      this.plugin.pushCommand(file);
    } else {
      switch (file.plugin) {
        case 'core':
          this.plugin.settings.files.remove(file.path);
          break;
        case 'templater':
          this.plugin.settings.templaterFiles.remove(file.path);
          break;
        default:
          console.log(file.path + ' is associated with an unknown plugin');
          return;
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
