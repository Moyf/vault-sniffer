import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type VaultSnifferPlugin from './main';

export type OpenLocation = 'tab' | 'split' | 'window';
export type DisplayMode = 'size' | 'count';

export interface ExtraProperty {
	key: string;
	label: string;
	showInRect: boolean;
	showInTooltip: boolean;
	builtin?: 'wordCount' | 'fileSize';
}

export interface VaultSnifferSettings {
	ignoreFolders: string[];
	ignoreExtensions: string[];
	ignorePatterns: string[];
	ignoreHidden: boolean;
	clickToOpen: boolean;
	openLocation: OpenLocation;
	defaultMode: DisplayMode;
	titleProperty: string;
	useTitleInTooltip: boolean;
	extraProperties: ExtraProperty[];
	dateFormat: string;
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
	useTitleInTooltip: false,
	extraProperties: [
		{ key: '', label: '', showInRect: true, showInTooltip: true, builtin: 'wordCount' as const },
		{ key: '', label: '', showInRect: true, showInTooltip: true, builtin: 'fileSize' as const },
	],
	dateFormat: 'YYYY-MM-DD',
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

		// ════════════════════════════════
		// 忽略规则
		// ════════════════════════════════
		const ignoreGroup = containerEl.createDiv('setting-group');
		ignoreGroup.createEl('h3', { text: '忽略规则', cls: 'setting-group-title' });

		new Setting(ignoreGroup)
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

		new Setting(ignoreGroup)
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

		new Setting(ignoreGroup)
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

		new Setting(ignoreGroup)
			.setName('忽略隐藏文件')
			.setDesc('忽略以 . 开头的文件和文件夹（如 .obsidian、.git）')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.ignoreHidden)
					.onChange(async (value) => {
						this.plugin.settings.ignoreHidden = value;
						await this.plugin.saveSettings();
					});
			});

		ignoreGroup.createEl('p', {
			text: '修改忽略规则后，请点击刷新按钮以生效。',
			cls: 'setting-item-description',
		});

		// ════════════════════════════════
		// 属性配置
		// ════════════════════════════════
		const propGroup = containerEl.createDiv('setting-group');
		propGroup.createEl('h3', { text: '属性配置', cls: 'setting-group-title' });

		new Setting(propGroup)
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

		new Setting(propGroup)
			.setName('浮动提示使用显示名称')
			.setDesc('开启后，tooltip 中使用 title 属性作为名称；关闭则始终显示文件原名。')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.useTitleInTooltip)
					.onChange(async (value) => {
						this.plugin.settings.useTitleInTooltip = value;
						await this.plugin.saveSettings();
					});
			});

		// ── 显示属性列表 ──────────────────────────────
		const extraSetting = new Setting(propGroup)
			.setName('显示属性')
			.setDesc('在矩形和浮动提示中显示的属性。内置属性不可删除，自定义属性读取文件的 frontmatter。')
			.addButton(btn => {
				btn.setButtonText('+ 添加属性')
					.setCta()
					.onClick(async () => {
						this.plugin.settings.extraProperties.push({ key: '', label: '', showInRect: true, showInTooltip: true });
						await this.plugin.saveSettings();
						this.display();
					});
			});

		const listContainer = propGroup.createDiv('extra-props-list');

		// 列标题行
		const headerRow = listContainer.createDiv('extra-prop-header');
		headerRow.createDiv('extra-prop-header-spacer'); // 对齐手柄/锁
		headerRow.createEl('span', { text: '属性', cls: 'extra-prop-header-key' });
		headerRow.createEl('span', { text: '显示前缀', cls: 'extra-prop-header-label' });
		headerRow.createDiv({ cls: 'extra-prop-spacer' });
		const rectHeader = headerRow.createDiv('extra-prop-header-icon');
		setIcon(rectHeader, 'layout-grid');
		rectHeader.setAttribute('title', '在矩形内显示');
		const tipHeader = headerRow.createDiv('extra-prop-header-icon');
		setIcon(tipHeader, 'message-square');
		tipHeader.setAttribute('title', '在浮动提示中显示');
		headerRow.createDiv('extra-prop-header-delete'); // 占位

		// 统一属性列表（内置 + 自定义，均可拖动排序）
		this.plugin.settings.extraProperties.forEach((prop, index) => {
			const item = listContainer.createDiv('extra-prop-item');
			item.setAttribute('draggable', 'true');
			item.dataset.index = String(index);

			// 拖拽手柄
			const handle = item.createSpan('extra-prop-handle');
			handle.textContent = '⠿';

			// 属性名：内置显示固定文本，自定义可编辑
			if (prop.builtin) {
				const builtinNames: Record<string, string> = { wordCount: '字数', fileSize: '体积' };
				item.createEl('span', {
					text: builtinNames[prop.builtin] || prop.builtin,
					cls: 'extra-prop-name-fixed extra-prop-key'
				});
			} else {
				const keyInput = item.createEl('input', {
					cls: 'extra-prop-input extra-prop-key',
					attr: { type: 'text', placeholder: '属性名', spellcheck: 'false' }
				});
				keyInput.value = prop.key;
				keyInput.addEventListener('change', async (e) => {
					this.plugin.settings.extraProperties[index].key = (e.target as HTMLInputElement).value.trim();
					await this.plugin.saveSettings();
				});
			}

			// 显示前缀
			const labelInput = item.createEl('input', {
				cls: 'extra-prop-input extra-prop-label',
				attr: { type: 'text', placeholder: '显示前缀', spellcheck: 'false' }
			});
			labelInput.value = prop.label;
			labelInput.addEventListener('change', async (e) => {
				this.plugin.settings.extraProperties[index].label = (e.target as HTMLInputElement).value.trim();
				await this.plugin.saveSettings();
			});

			item.createDiv('extra-prop-spacer');

			// 矩形显示开关
			const rectToggle = item.createEl('button', {
				cls: `extra-prop-toggle ${prop.showInRect ? 'active' : ''}`,
				attr: { title: '在矩形内显示' }
			});
			setIcon(rectToggle, 'layout-grid');
			rectToggle.addEventListener('click', async () => {
				this.plugin.settings.extraProperties[index].showInRect = !this.plugin.settings.extraProperties[index].showInRect;
				await this.plugin.saveSettings();
				rectToggle.toggleClass('active', this.plugin.settings.extraProperties[index].showInRect);
			});

			// tooltip 显示开关
			const tipToggle = item.createEl('button', {
				cls: `extra-prop-toggle ${prop.showInTooltip ? 'active' : ''}`,
				attr: { title: '在浮动提示中显示' }
			});
			setIcon(tipToggle, 'message-square');
			tipToggle.addEventListener('click', async () => {
				this.plugin.settings.extraProperties[index].showInTooltip = !this.plugin.settings.extraProperties[index].showInTooltip;
				await this.plugin.saveSettings();
				tipToggle.toggleClass('active', this.plugin.settings.extraProperties[index].showInTooltip);
			});

			// 删除按钮（内置属性无删除）
			if (!prop.builtin) {
				const removeBtn = item.createEl('button', { cls: 'extra-prop-remove', attr: { title: '删除' } });
				setIcon(removeBtn, 'trash-2');
				removeBtn.addEventListener('click', async () => {
					this.plugin.settings.extraProperties.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				});
			} else {
				item.createDiv('extra-prop-delete-placeholder');
			}

			// 拖放事件（所有属性均可排序）
			item.addEventListener('dragstart', (e) => {
				e.dataTransfer!.effectAllowed = 'move';
				e.dataTransfer!.setData('text/plain', String(index));
				item.addClass('dragging');
			});
			item.addEventListener('dragend', () => {
				item.removeClass('dragging');
			});
			item.addEventListener('dragover', (e) => {
				e.preventDefault();
				e.dataTransfer!.dropEffect = 'move';
				item.addClass('drag-over');
			});
			item.addEventListener('dragleave', () => {
				item.removeClass('drag-over');
			});
			item.addEventListener('drop', async (e) => {
				e.preventDefault();
				item.removeClass('drag-over');
				const fromIndex = parseInt(e.dataTransfer!.getData('text/plain'), 10);
				const toIndex = index;
				if (fromIndex === toIndex) return;
				const arr = this.plugin.settings.extraProperties;
				const [moved] = arr.splice(fromIndex, 1);
				arr.splice(toIndex, 0, moved);
				await this.plugin.saveSettings();
				this.display();
			});
		});

		new Setting(propGroup)
			.setName('日期属性格式')
			.setDesc('如果额外属性的值能解析为日期，则按此格式显示。支持 YYYY、MM、DD、HH、mm、ss。')
			.addText(text => {
				text.setPlaceholder('YYYY-MM-DD')
					.setValue(this.plugin.settings.dateFormat)
					.onChange(async (value) => {
						this.plugin.settings.dateFormat = value.trim();
						await this.plugin.saveSettings();
					});
			});

		// ════════════════════════════════
		// 交互行为
		// ════════════════════════════════
		const behaviorGroup = containerEl.createDiv('setting-group');
		behaviorGroup.createEl('h3', { text: '交互行为', cls: 'setting-group-title' });

		new Setting(behaviorGroup)
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

		new Setting(behaviorGroup)
			.setName('点击打开文件')
			.setDesc('点击文件矩形时打开对应文件')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.clickToOpen)
					.onChange(async (value) => {
						this.plugin.settings.clickToOpen = value;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.clickToOpen) {
			new Setting(behaviorGroup)
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
	}
}
