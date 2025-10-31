import { App, Editor, FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

import { exec } from 'child_process';
import { existsSync, rm, stat } from 'fs';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	pythonPath: string;
	othToolPath: string;
	mensaplanFile: string;
	cloneRepo: boolean;
	autoOpen: boolean; // automatically open the mensaplan after pulling it
	fetchOnFirstOpen: boolean; // fetch the mensaplan, if no mensaplan file from today has been found
}



const DEFAULT_SETTINGS: MyPluginSettings = {
	pythonPath: 'python3',
	othToolPath: '',
	mensaplanFile: 'Mensaplan.md',
	cloneRepo: false,
	autoOpen: true,
	fetchOnFirstOpen: false,
}

export default class OthTool extends Plugin {
	settings: MyPluginSettings;

	// path where the mensatool should be cloned into
	oth_tool_repo_path: string;

	vault_base_path: string;

	venv_data: { basePath: string, python: string }

	readonly oth_tool_repo_url: string = 'https://github.com/Acoiny/oth-scrape-tool';

	async onload() {
		await this.loadSettings();

		let vaultPath = '';
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			vaultPath = this.app.vault.adapter.getBasePath();
		}
		this.vault_base_path = vaultPath;

		this.oth_tool_repo_path = vaultPath + '/' + this.manifest.dir + '/oth-scrape-tool';

		if (this.settings.cloneRepo) {
			this.updateRepo();
		}

		if (this.settings.fetchOnFirstOpen) {
			stat(this.vault_base_path + '/' + this.settings.mensaplanFile, (err, stats) => {
				if (err) {
					// file doesn't exist!
					console.log(err);
					this.fetchMensaplan();
					return;
				}

				const today = new Date();
				const acc = stats.mtime;

				if (!(today.getFullYear() == acc.getFullYear() &&
					today.getMonth() == acc.getMonth() &&
					today.getDate() == acc.getDate())) {
					// NOT on the same day!
					this.fetchMensaplan();
				}
			});

		}

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'fetch-oth-mensaplan',
			name: 'Fetch OTH-Mensaplan',
			callback: () => {
				this.fetchMensaplan();
				//new ErrorModal(this.app, "Unable to fetch mensaplan").open();
			}
		});

		this.addCommand({
			id: 'clone-oth-scrape-tool',
			name: 'Clone the oth-scrape-tool',
			callback: () => {
				this.updateRepo();
			}
		});

		this.addCommand({
			id: 'remove-oth-scrape-tool',
			name: 'Remove the cloned oth-scrape-tool',
			callback: () => {
				if (existsSync(this.oth_tool_repo_path)) {
					rm(this.oth_tool_repo_path, { force: true, recursive: true }, (error) => {
						if (error)
							new OthToolModal(this.app, `Unable to remove tool: ${error}`).open();
					});
				}
			}
		});

		// TODO: add command to pull mensaplan AND directly open it

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	/**
	 * Executes git pull inside the repo,
	 * or freshly clones it if it isn't present
	 */
	updateRepo() {
		if (!existsSync(this.oth_tool_repo_path)) {
			this.cloneRepoIfNotExists();
			return;
		}
		const cmd = `cd ${this.oth_tool_repo_path} && git pull`;
		console.log(cmd);
		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				new OthToolModal(this.app, `Error git pull: ${error}`).open();
				return;
			}
			console.log(stdout);
			if (stderr)
				console.error(stderr);
		});
	}

	cloneRepoIfNotExists() {
		if (existsSync(this.oth_tool_repo_path)) return;

		const cmd = `git clone ${this.oth_tool_repo_url} ${this.oth_tool_repo_path}`;

		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				new OthToolModal(this.app, `Error on clone: ${error}`).open();
				return;
			}
			console.log(stdout);
			if (stderr)
				console.error(stderr);
		});

		// now create the venv
	}

	fetchMensaplan() {
		const pythonPath = this.settings.pythonPath;
		const mensaplan = this.settings.mensaplanFile;

		const cmd = `"${pythonPath}" "${this.oth_tool_repo_path + '/oth_tool.py'}" m -mt > "${this.vault_base_path + '/' + mensaplan}"`
		console.log("Executing: ", cmd);
		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				new OthToolModal(this.app, `Error on getting mensaplan: ${error}`).open();
				return;
			}

			console.log(stdout);
			if (stderr)
				console.error(stderr);

			if (this.settings.autoOpen) {
				const file = this.app.vault.getAbstractFileByPath(this.settings.mensaplanFile);
				if (file)
					this.app.workspace.openLinkText(this.settings.mensaplanFile, '', false);
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class OthToolModal extends Modal {
	message: string;

	constructor(app: App, message: string) {
		super(app);
		this.message = message;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText(this.message);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: OthTool;

	constructor(app: App, plugin: OthTool) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Python path')
			.setDesc('Path to the python interpreter used to fetch the \
				mensaplan. Can be inside a virtual environment (Recommended).')
			.addText(text => text
				.setPlaceholder('/path/to/python3')
				.setValue(this.plugin.settings.pythonPath)
				.onChange(async (value) => {
					this.plugin.settings.pythonPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Clone tool')
			.setDesc('Automatically clone and pull new versions of the the oth-tool into this plugin\'s folder')
			.addToggle(cp => cp
				.setValue(this.plugin.settings.cloneRepo)
				.onChange(async value => {
					this.plugin.settings.cloneRepo = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto open')
			.setDesc('Automatically open the mensaplan after fetching it')
			.addToggle(cp => cp
				.setValue(this.plugin.settings.autoOpen)
				.onChange(async value => {
					this.plugin.settings.autoOpen = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fetch on open')
			.setDesc('Fetches the mensaplan if no Mensaplan file from today has been found on opening obsidian')
			.addToggle(cp => cp
				.setValue(this.plugin.settings.fetchOnFirstOpen)
				.onChange(async value => {
					this.plugin.settings.fetchOnFirstOpen = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Mensaplan.md')
			.setDesc('Path to store the mensaplan inside the vault.')
			.addText(text => text
				.setPlaceholder('Mensaplan.md')
				.setValue(this.plugin.settings.mensaplanFile)
				.onChange(async (value) => {
					// make sure the value path ends with '.md'
					if (!value.endsWith('.md'))
						value += '.md';
					this.plugin.settings.mensaplanFile = value;
					await this.plugin.saveSettings();
				}));
	}
}
