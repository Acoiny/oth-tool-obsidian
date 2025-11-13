import {
	App,
	Editor,
	FileSystemAdapter,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
	requestUrl,
} from "obsidian";

import { getWeekDates, Mensaplan } from "Mensaplan";

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mensaplanFile: string;
	autoOpen: boolean; // automatically open the mensaplan after pulling it
	fetchOnFirstOpen: boolean; // fetch the mensaplan, if no mensaplan file from today has been found
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mensaplanFile: "Mensaplan.md",
	autoOpen: true,
	fetchOnFirstOpen: false,
};
const BASE_URL = "https://stwno.de/infomax/daten-extern/html/";

const REST_URL = "speiseplan-render.php";

export default class OthTool extends Plugin {
	settings: MyPluginSettings;

	vault_base_path: string;

	async onload() {
		await this.loadSettings();

		let vaultPath = "";
		if (this.app.vault.adapter instanceof FileSystemAdapter) {
			vaultPath = this.app.vault.adapter.getBasePath();
		}
		this.vault_base_path = vaultPath;

		if (this.settings.fetchOnFirstOpen) {
			this.app.workspace.onLayoutReady(() => {
				this.isFileOlderThanToday(this.settings.mensaplanFile).then(
					(isOlder) => {
						if (isOlder) this.fetchMensaplan("today");
					}
				);
			});
		}

		this.addCommand({
			id: "fetch-oth-mensaplan-today",
			name: "Fetch today's OTH- Mensaplan",
			callback: () => {
				this.fetchMensaplan("today");
			},
		});

		this.addCommand({
			id: "fetch-oth-mensaplan-week",
			name: "Fetch this week's OTH- Mensaplan",
			callback: () => {
				this.fetchMensaplan("week");
			},
		});

		this.addCommand({
			id: "fetch-oth-mensaplan-next-week",
			name: "Fetch next week's OTH- Mensaplan",
			callback: () => {
				this.fetchMensaplan("nextWeek");
			},
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async fetchMensaplan(mode: "today" | "week" | "nextWeek") {
		const mensaplan = new Mensaplan(BASE_URL, REST_URL);

		const days: Date[] = [];
		switch (mode) {
			case "today":
				days.push(new Date());
				break;
			case "week":
				days.push(...getWeekDates(false));
				break;
			case "nextWeek":
				days.push(...getWeekDates(true));
				break;
		}

		for (const date of days) {
			try {
				new Notice("Fetching mensaplan for " + date.toDateString());
				await mensaplan.fetchDay(date);
			} catch (e) {
				new Notice(
					"Failed to fetch mensaplan for " +
						date.toDateString() +
						": " +
						e
				);
			}
		}

		const content = mensaplan.to_markdown_str();
		this.storeMensaplanInFile(content);
	}

	storeMensaplanInFile(content: string) {
		const normalizedPath = normalizePath(this.settings.mensaplanFile);
		this.app.vault.adapter
			.write(normalizedPath, content)
			.then(() => {
				new Notice("Mensaplan saved to " + normalizedPath);
				if (this.settings.autoOpen) {
					this.app.workspace.openLinkText(normalizedPath, "", false);
				}
			})
			.catch((err) => {
				new Notice("Failed to save Mensaplan: " + err);
			});
	}

	async isFileOlderThanToday(path: string): Promise<boolean> {
		// Use Obsidian's API instead of fs.stat
		const file = this.app.vault.getAbstractFileByPath(
			this.settings.mensaplanFile
		);

		if (file instanceof TFile) {
			const stats = await this.app.vault.adapter.stat(
				normalizePath(this.settings.mensaplanFile)
			);

			if (stats) {
				const today = new Date();
				const modTime = new Date(stats.mtime);

				if (
					!(
						today.getFullYear() === modTime.getFullYear() &&
						today.getMonth() === modTime.getMonth() &&
						today.getDate() === modTime.getDate()
					)
				) {
					// NOT on the same day!
					console.log("File is older than today.");
					return true;
				}
			}
		} else {
			// File doesn't exist
			return true;
		}

		return false;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
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
			.setName("Auto open")
			.setDesc("Automatically open the mensaplan after fetching it")
			.addToggle((cp) =>
				cp
					.setValue(this.plugin.settings.autoOpen)
					.onChange(async (value) => {
						this.plugin.settings.autoOpen = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Fetch on open")
			.setDesc(
				"Fetches the mensaplan if no Mensaplan file from today has been found on opening obsidian"
			)
			.addToggle((cp) =>
				cp
					.setValue(this.plugin.settings.fetchOnFirstOpen)
					.onChange(async (value) => {
						this.plugin.settings.fetchOnFirstOpen = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Mensaplan.md")
			.setDesc("Path to store the mensaplan inside the vault.")
			.addText((text) =>
				text
					.setPlaceholder("Mensaplan.md")
					.setValue(this.plugin.settings.mensaplanFile)
					.onChange(async (value) => {
						// make sure the value path ends with '.md'
						if (!value.endsWith(".md")) value += ".md";
						this.plugin.settings.mensaplanFile = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
