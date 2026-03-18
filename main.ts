import { Plugin, WorkspaceLeaf } from 'obsidian';
import { FileManager } from './fileManager';
import { VaultSnifferView } from './view';
import { VaultSnifferSettings, VaultSnifferSettingTab, DEFAULT_SETTINGS } from './settings';

const VIEW_TYPE = 'vault-sniffer-view';

export default class VaultSnifferPlugin extends Plugin {
	private fileManager: FileManager;
	settings: VaultSnifferSettings;

	async onload() {
		console.log('Loading Vault Sniffer plugin');

		// Load settings
		await this.loadSettings();

		// Initialize file manager
		this.fileManager = new FileManager(this.app);
		this.fileManager.setSettings(this.settings);

		// Register settings tab
		this.addSettingTab(new VaultSnifferSettingTab(this.app, this));

		// Register view
		this.registerView(
			VIEW_TYPE,
			(leaf) => new VaultSnifferView(leaf, this.fileManager, this.settings)
		);

		// This adds a ribbon icon
		this.addRibbonIcon('pie-chart', 'Vault Sniffer', () => {
			this.activateView();
		});

		// This adds a status bar item to bottom of app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Vault Sniffer');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-vault-sniffer',
			name: 'Open vault sniffer',
			callback: () => {
				this.activateView();
			},
		});
	}

	async onunload() {
		console.log('Unloading Vault Sniffer plugin');
	}

	async loadSettings() {
		const loaded = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		// 迁移旧版 string[] 格式的 extraProperties
		if (this.settings.extraProperties?.length > 0 && typeof this.settings.extraProperties[0] === 'string') {
			this.settings.extraProperties = (this.settings.extraProperties as any[]).map((key: string) => ({
				key, label: '', showInRect: true, showInTooltip: true
			}));
			// 清理旧的全局开关
			delete (this.settings as any).showExtraPropsInRect;
			delete (this.settings as any).showExtraPropsInTooltip;
		}
		// 迁移：注入内置属性（字数、体积）
		const hasWordCount = this.settings.extraProperties.some((p: any) => p.builtin === 'wordCount');
		const hasFileSize = this.settings.extraProperties.some((p: any) => p.builtin === 'fileSize');
		if (!hasWordCount || !hasFileSize) {
			if (!hasWordCount) {
				const old: any = (loaded as any).wordCount || {};
				this.settings.extraProperties.unshift({ key: '', label: old.label || '', showInRect: old.showInRect ?? true, showInTooltip: old.showInTooltip ?? true, builtin: 'wordCount' as const });
			}
			if (!hasFileSize) {
				const old: any = (loaded as any).fileSize || {};
				const wcIdx = this.settings.extraProperties.findIndex((p: any) => p.builtin === 'wordCount');
				this.settings.extraProperties.splice(wcIdx + 1, 0, { key: '', label: old.label || '', showInRect: old.showInRect ?? true, showInTooltip: old.showInTooltip ?? true, builtin: 'fileSize' as const });
			}
			delete (this.settings as any).wordCount;
			delete (this.settings as any).fileSize;
			await this.saveData(this.settings);
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.fileManager.setSettings(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;

		// Try to find existing view
		const leaves = workspace.getLeavesOfType(VIEW_TYPE);
		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			// Create new leaf
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}

		// Reveal the leaf
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}
