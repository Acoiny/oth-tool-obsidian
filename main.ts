import { App, Editor, FileSystemAdapter, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

import { exec, execSync } from 'child_process';
import { existsSync, rm, stat } from 'fs';
import { platform } from 'os';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	pythonPath: string;
	othToolPath: string;
	mensaplanFile: string;
	cloneRepo: boolean;
	autoOpen: boolean; // automatically open the mensaplan after pulling it
	fetchOnFirstOpen: boolean; // fetch the mensaplan, if no mensaplan file from today has been found
	createVenv: boolean; // if true, creates a virtual environment inside the pulled tool
}



const DEFAULT_SETTINGS: MyPluginSettings = {
	pythonPath: 'python3',
	othToolPath: '',
	mensaplanFile: 'Mensaplan.md',
	cloneRepo: false,
	autoOpen: true,
	fetchOnFirstOpen: false,
	createVenv: false,
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
					this.fetchMensaplan('today');
					return;
				}

				const today = new Date();
				const modTime = stats.mtime;

				if (!(today.getFullYear() == modTime.getFullYear() &&
					today.getMonth() == modTime.getMonth() &&
					today.getDate() == modTime.getDate())) {
					// NOT on the same day!
					this.fetchMensaplan('today');
				}
			});

		}

		this.addCommand({
			id: 'fetch-oth-mensaplan-today',
			name: 'Fetch today\'s OTH- Mensaplan',
			callback: () => {
				this.fetchMensaplan('today');
			}
		});

		this.addCommand({
			id: 'fetch-oth-mensaplan-week',
			name: 'Fetch this week\'s OTH- Mensaplan',
			callback: () => {
				this.fetchMensaplan('week');
			}
		});

		this.addCommand({
			id: 'fetch-oth-mensaplan-next-week',
			name: 'Fetch next week\'s OTH- Mensaplan',
			callback: () => {
				this.fetchMensaplan('nextWeek');
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

		this.addSettingTab(new SampleSettingTab(this.app, this));
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

	fetchMensaplan(mode: 'today' | 'week' | 'nextWeek') {
		let pythonPath = this.settings.pythonPath;

		if (this.settings.createVenv) {
			pythonPath = this.getVenvPath();
		}

		const mensaplan = this.settings.mensaplanFile;

		const time_flag = mode === 'today' ?
			'-t' :
			(mode === 'nextWeek' ?
				'-n' : '');

		const cmd = `"${pythonPath}" "${this.oth_tool_repo_path + '/oth_tool.py'}" m -m ${time_flag} > "${this.vault_base_path + '/' + mensaplan}"`
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

	private createVenv() {
		const osPrefix = platform() === 'win32' ?
			'/Scripts' :
			'/bin';
		const path = this.oth_tool_repo_path + '/venv';

		const pipPath = path + osPrefix + '/pip';
		const pythonPath = path + osPrefix + '/python3';

		if (!existsSync(path)) {
			console.log("Venv doesn't exist, executing:" + `cd ${this.oth_tool_repo_path} &&\
					python -m venv venv &&\
					${pipPath} install -r ${this.oth_tool_repo_path + '/requirements.txt'}`);
			const res = execSync(`cd ${this.oth_tool_repo_path} &&\
					python -m venv venv &&\
					${pipPath} install -r ${this.oth_tool_repo_path + '/requirements.txt'}`);
		}
	}

	/**
	* Creates the venv if not present and then returns the path
	* to the python interpreter inside the venv
	*/
	getVenvPath(): string {
		const osPrefix = platform() === 'win32' ?
			'/Scripts' :
			'/bin';
		const path = this.oth_tool_repo_path + '/venv';

		// creating the virtual environment if not present
		try {
			this.createVenv();
		} catch (ex) {
			new OthToolModal(this.app, `Unable to create venv: ${ex}`).open();
			return '';
		}

		return path + osPrefix + '/python3';
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
			.setName('Use virtual environment')
			.setDesc('If true, the tool creates and uses a virtual environment')
			.addToggle(cp => cp
				.setValue(this.plugin.settings.createVenv)
				.onChange(async value => {
					this.plugin.settings.createVenv = value;
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
