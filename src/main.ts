import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder } from "obsidian";
import { FolderSuggest } from "src/file-suggest";

interface TemplateFile {
  plugin: "core" | "templater";
  path: string;
}

interface NewFileTemplate extends TemplateFile {
  folder: string;
}

interface HotkeysForTemplateSettings {
  files: string[],
  templaterFiles: string[],
  newFileTemplates: NewFileTemplate[];
  openNewFileTemplateInNewPane: boolean;
}

const DEFAULT_SETTINGS: HotkeysForTemplateSettings = {
  files: [],
  templaterFiles: [],
  newFileTemplates: [],
  openNewFileTemplateInNewPane: true,

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

    //remove removed new file templates from the list
    this.settings.newFileTemplates = this.settings.newFileTemplates.filter(file => file != null);
    this.saveSettings();

    if (this.templaterPlugin && this.templaterPlugin._loaded) { // templater-obsidian enabled
      const templaterFolderPath = normalizePath(this.templaterPlugin.settings.template_folder);
      const templaterFolder = this.app.vault.getAbstractFileByPath(templaterFolderPath);
      if (!(templaterFolder instanceof TFolder) || templaterFolderPath === "/") {
        new Notice("Templater folder must be set");
      } else {
        this.templaterFolder = templaterFolder;
        this.activePlugins.push('templater-obsidian');

        //normal templates
        for (const file of this.settings.templaterFiles) {
          this.pushNormalCommand({ path: file, plugin: "templater" });
        }
        // new file templates
        for (const file of this.settings.newFileTemplates.filter(file => file.plugin === "templater")) {
          this.pushNewFileCommand(file);
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

        //normal templates
        for (const file of this.settings.files) {
          this.pushNormalCommand({ path: file, plugin: "core" });
        }
        // new file templates
        for (const file of this.settings.newFileTemplates.filter(file => file.plugin === "core")) {
          this.pushNewFileCommand(file);
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

  pushNormalCommand(templateFile: TemplateFile) {
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
  pushNewFileCommand(templateFile: NewFileTemplate) {
    if (this.getFile(templateFile)) {
      this.addCommand({
        id: `new-file-template-in-${templateFile.folder}-from-${templateFile.path}`,
        name: `New file in ${templateFile.folder} from ${templateFile.path.replace(".md", "")}`,
        callback: async () => {
          const folder = this.app.vault.getAbstractFileByPath(templateFile.folder);
          if (!folder) {
            new Notice(`Cannot find folder: ${folder.path}`);
            return;
          }
          const file = await (this.app.fileManager as any).createNewMarkdownFile(folder);
          await this.app.workspace.getLeaf(this.settings.openNewFileTemplateInNewPane).openFile(file, {
            active: true,
            state: {
              mode: "source"
            },
          });
          switch (templateFile.plugin) {
            case 'core':
              await this.coreInsertTemplate(templateFile);
              break;
            case 'templater':
              await this.templaterInsertTemplate(templateFile);
              break;
            default:
              new Notice(this.manifest.name + ': Unknown plugin type for ' + templateFile.path);
              return;
          }

          this.app.workspace.activeLeaf.setEphemeralState({
            rename: "all"
          });
        }
      });
    } else {
      switch (templateFile.plugin) {
        case 'core':
          this.settings.newFileTemplates.remove(templateFile);
          break;
        case 'templater':
          this.settings.newFileTemplates.remove(templateFile);
          break;
        default:
          new Notice(this.manifest.name + ': Unknown plugin type for ' + templateFile.path);
          return;
      }
      this.saveSettings();
    }
  }

  async coreInsertTemplate(fileName: TemplateFile): Promise<void> {
    const file = this.getFile(fileName);
    if (!file) {
      new Notice('Cannot find file: ' + fileName.path);
      return;
    } else {
      await this.corePlugin.instance.insertTemplate(file);
    }
  }

  async templaterInsertTemplate(fileName: TemplateFile): Promise<void> {
    const file = this.getFile(fileName);
    if (!file) {
      new Notice('Cannot find file: ' + fileName.path);
      return;
    } else {
      await this.templaterPlugin.parser.replace_templates_and_append(file);
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
  templates: Map<string, TemplateFile[]> = new Map;
  newFileTemplateIndex: number = 0;
  constructor(app: App, plugin: HotkeysForTemplates) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    this.newFileTemplateIndex = 0;
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
      this.templates.set("templater", this.getTemplateFiles(this.plugin.templaterFolder, this.plugin.templaterFolder.path).map((e): TemplateFile => {
        return { path: e, plugin: "templater" };
      }));
      for (const file of this.templates.get("templater")) {
        this.addTemplateToggle(file);
      }
    }
    if (this.plugin.activePlugins.includes('core')) {
      containerEl.createEl("h3", {
        text: "Templates defined by the core Templates plugin",
      });
      this.templates.set("core", this.getTemplateFiles(this.plugin.coreTemplateFolder, this.plugin.coreTemplateFolder.path).map((e): TemplateFile => {
        return { path: e, plugin: "core" };
      }));
      for (const file of this.templates.get("core")) {
        this.addTemplateToggle(file);
      }
    }

    containerEl.createEl("h3", {
      text: "Create a new file in a specified folder with a specified template"
    });

    new Setting(containerEl)
      .setName("Open in new pane")
      .addToggle(cb => {
        cb.setValue(this.plugin.settings.openNewFileTemplateInNewPane);
        cb.onChange(value => {
          this.plugin.settings.openNewFileTemplateInNewPane = value;
          this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Add new text field")
      .addButton(cb => {
        cb.setButtonText("Add");
        cb.setCta();
        cb.onClick((_) => {
          this.addNewFileSetting(this.newFileTemplateIndex);
          this.newFileTemplateIndex++;
        });
      });
    for (const item of this.plugin.settings.newFileTemplates) {
      if (!item) {
        this.plugin.settings.newFileTemplates.remove(item);
      } else {
        this.addNewFileSetting(this.newFileTemplateIndex);
        this.newFileTemplateIndex++;
      }
    }
    this.plugin.saveSettings();
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
      this.plugin.pushNormalCommand(file);
    } else {
      switch (file.plugin) {
        case 'core':
          this.plugin.settings.files.remove(file.path);
          (this.plugin.app as any).commands.removeCommand(`${this.plugin.manifest.id}:${file.path}`);
          break;
        case 'templater':
          this.plugin.settings.templaterFiles.remove(file.path);
          (this.plugin.app as any).commands.removeCommand(`${this.plugin.manifest.id}:${file.plugin}:${file.path}`);
          break;
        default:
          console.log(file.path + ' is associated with an unknown plugin');
          return;
      }
    }
    this.plugin.saveSettings();
  }

  addNewFileSetting(index: number) {
    let item = this.plugin.settings.newFileTemplates[index];
    if (!item) {
      item = { folder: "", path: "", plugin: "core" };
    }

    const setting = new Setting(this.containerEl)
      .setName("New file template");
    setting.addText(cb => {
      new FolderSuggest(this.app, cb.inputEl);
      cb
        .setPlaceholder("folder")
        .setValue(item.folder)
        .onChange((value) => {
          item.folder = normalizePath(value);
        });
    });
    setting.addDropdown(cb => {
      this.templates.forEach((files) => {
        for (const file of files) {
          let prefix: string;
          if (file.plugin === "core") {
            prefix = "Core: ";
          } else {
            prefix = "Templater: ";
          }
          cb.addOption(`${file.plugin}::${file.path}`, prefix + file.path.replace(".md", ""));
        }
      });
      cb.setValue(`${item.plugin}::${item.path}`);
      cb.onChange(value => {
        const index = value.indexOf("::");
        item.path = value.substring(index + 2);
        item.plugin = value.substring(0, index) as "core" | "templater";
      });
    });
    setting.addExtraButton(cb => {
      cb.setIcon("install");
      cb.setTooltip("Save");
      cb.onClick(() => {
        if (!item.folder || !item.path) {
          new Notice("Not all fields are set");
          return;
        }
        this.plugin.settings.newFileTemplates[index] = item;
        this.plugin.saveSettings();
        this.plugin.pushNewFileCommand(item);
        new Notice("Saved");
      });
    });
    setting.addExtraButton(cb => {
      cb.setIcon("cross");
      cb.setTooltip("Remove");
      cb.onClick(() => {
        this.plugin.settings.newFileTemplates[index] = undefined;
        this.plugin.saveSettings();

        (this.plugin.app as any).commands.removeCommand(`${this.plugin.manifest.id}:new-file-template-in-${item.folder}-from-${item.path}`);
        setting.settingEl.hide();
      });
    });
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
