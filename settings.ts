import { App, PluginSettingTab, Setting } from 'obsidian';
import type VaultSnifferPlugin from './main';

export type OpenLocation = 'tab' | 'split' | 'window';
export type DisplayMode = 'size' | 'count';

export interface VaultSnifferSettings {
	ignoreFolders: string[];
	ignoreExtensions: string[];
	ignorePatterns: string[];
	ignoreHidden: boolean;
	clickToOpen: boolean;
	openLocation: OpenLocation;
	defaultMode: DisplayMode;
	titleProperty: string;
}

export const DEFAULT_SETTINGS: VaultSnifferSettings = {
	ignoreFolders: ['Assets', 'assets', 'node_modules', '.trash'],
	ignoreExtensions: [],
	ignorePatterns: [],
	ignoreHidden: true,
	clickToOpen: true,
	openLocation: 'tab',
	defaultMode: 'count',
	titleProperty: 'title',
};

export class VaultSnifferSettingTab extends PluginSettingTab {
	plugin: VaultSnifferPlugin;

	constructor(app: App, plugin: VaultSnifferPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── 忽略文件夹 ──
		new Setting(containerEl)
			.setName('忽略文件夹')
			.setDesc('输入要忽略的文件夹名称，每行一个。匹配任意层级中同名的文件夹。')
			.addTextArea(text => {
				text.setPlaceholder('Assets\nassets\nnode_modules')
					.setValue(this.plugin.settings.ignoreFolders.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.ignoreFolders = value
							.split('\n')
							.map(s => s.trim())
							.filter(s => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 5;
				text.inputEl.cols = 30;
			});

		// ── 忽略扩展名 ──
		new Setting(containerEl)
			.setName('忽略文件类型')
			.setDesc('输入要忽略的文件扩展名（不含点），每行一个。例如：tmp、log')
			.addTextArea(text => {
				text.setPlaceholder('tmp\nlog\nbak')
					.setValue(this.plugin.settings.ignoreExtensions.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.ignoreExtensions = value
							.split('\n')
							.map(s => s.trim().replace(/^\./, ''))
							.filter(s => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.cols = 30;
			});

		// ── 忽略模式 ──
		new Setting(containerEl)
			.setName('忽略路径模式')
			.setDesc('输入要忽略的路径关键词，每行一个。路径中包含该关键词的文件/文件夹会被忽略。')
			.addTextArea(text => {
				text.setPlaceholder('backup\narchive')
					.setValue(this.plugin.settings.ignorePatterns.join('\n'))
					.onChange(async (value) => {
						this.plugin.settings.ignorePatterns = value
							.split('\n')
							.map(s => s.trim())
							.filter(s => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.cols = 30;
			});

		// ── 隐藏文件 ──
		new Setting(containerEl)
			.setName('忽略隐藏文件')
			.setDesc('忽略以 . 开头的文件和文件夹（如 .obsidian、.git）')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.ignoreHidden)
					.onChange(async (value) => {
						this.plugin.settings.ignoreHidden = value;
						await this.plugin.saveSettings();
					});
			});

		// ── 默认计数规则 ──
		new Setting(containerEl)
			.setName('默认计数规则')
			.setDesc('打开视图时默认的显示模式')
			.addDropdown(drop => {
				drop.addOption('size', '按大小')
					.addOption('count', '按数量')
					.setValue(this.plugin.settings.defaultMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultMode = value as 'size' | 'count';
						await this.plugin.saveSettings();
					});
			});

		// ── 标题属性 ──
		new Setting(containerEl)
			.setName('显示名称属性')
			.setDesc('读取 frontmatter 中的此属性作为显示名称，未设置时回退到文件名。留空则始终使用文件名。')
			.addText(text => {
				text.setPlaceholder('title')
					.setValue(this.plugin.settings.titleProperty)
					.onChange(async (value) => {
						this.plugin.settings.titleProperty = value.trim();
						await this.plugin.saveSettings();
					});
			});

		// ── 点击打开文件 ──
		const clickSetting = new Setting(containerEl)
			.setName('点击打开文件')
			.setDesc('点击文件矩形时打开对应文件')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.clickToOpen)
					.onChange(async (value) => {
						this.plugin.settings.clickToOpen = value;
						await this.plugin.saveSettings();
						this.display(); // 刷新以显示/隐藏下拉
					});
			});

		if (this.plugin.settings.clickToOpen) {
			new Setting(containerEl)
				.setName('打开位置')
				.setDesc('选择文件打开的位置')
				.addDropdown(drop => {
					drop.addOption('tab', '新标签页')
						.addOption('split', '分屏')
						.addOption('window', '新窗口')
						.setValue(this.plugin.settings.openLocation)
						.onChange(async (value) => {
							this.plugin.settings.openLocation = value as OpenLocation;
							await this.plugin.saveSettings();
						});
				});
		}

		// ── 提示 ──
		containerEl.createEl('p', {
			text: '修改忽略规则后，请重新打开 Vault Sniffer 视图或点击刷新按钮以生效。',
			cls: 'setting-item-description',
		});
	}
}
