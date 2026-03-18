// @ts-nocheck
import { ItemView, WorkspaceLeaf, TFile, TFolder, FuzzySuggestModal, prepareFuzzySearch } from 'obsidian';
import * as d3 from 'd3';
import { FileManager, FileNode } from './fileManager';
import type { VaultSnifferSettings, DisplayMode, ExtraProperty, FileSortRule } from './settings';
import { t } from './i18n';

const VIEW_TYPE = 'vault-sniffer-view';

export class VaultSnifferView extends ItemView {
	private fileManager: FileManager;
	private settings: VaultSnifferSettings;
	private onSaveSettings: () => Promise<void>;
	private currentPath = '/';
	private currentFilterMode: 'all' | 'notes' | 'attachments' = 'all';
	private currentDepth = 1;
	private maxDepth = 1;
	displayMode: DisplayMode = 'count';
	private viewContainer: HTMLElement | null = null;
	private tooltip: any = null;
	private isLoading = false;
	private resizeObserver: ResizeObserver | null = null;
	private resizeTimer: number | null = null;
	private searchQuery = '';
	private currentZoom = 100;

	constructor(leaf: WorkspaceLeaf, fileManager: FileManager, settings: VaultSnifferSettings, saveSettings: () => Promise<void>) {
		super(leaf);
		this.fileManager = fileManager;
		this.settings = settings;
		this.displayMode = settings.defaultMode;
		this.onSaveSettings = saveSettings;
	}

	getViewType() {
		return VIEW_TYPE;
	}

	getDisplayText() {
		return 'Vault Sniffer';
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('vault-sniffer-view');
		this.viewContainer = container;

		// 注入加载动画 CSS
		if (!document.querySelector('#vault-sniffer-anim')) {
			const style = document.createElement('style');
			style.id = 'vault-sniffer-anim';
			style.textContent = `@keyframes loading-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`;
			document.head.appendChild(style);
		}

		// 只创建一次 tooltip
		this.tooltip = d3.select('body')
			.append('div')
			.attr('class', 'tooltip')
			.style('position', 'absolute')
			.style('display', 'none')
			.style('background', 'rgba(0,0,0,0.8)')
			.style('color', 'white')
			.style('padding', '8px')
			.style('border-radius', '4px')
			.style('font-size', '12px');

		this.renderToolbar();

		// 预热缓存
		this.fileManager.getVaultStructure();

		await this.renderChart();

		// 动态调整大小
		this.resizeObserver = new ResizeObserver(() => {
			if (this.resizeTimer) clearTimeout(this.resizeTimer);
			this.resizeTimer = window.setTimeout(() => {
				if (!this.isLoading && this.viewContainer) this.renderChart();
			}, 200);
		});
		this.resizeObserver.observe(container);
	}

	private renderToolbar() {
		const toolbar = this.viewContainer!.createDiv('toolbar');
		this.viewContainer!.prepend(toolbar);

		// ── 第一行：路径(左) + 搜索 + 刷新(右) ──
		const row1 = toolbar.createDiv('toolbar-row');

		const pathGroup = row1.createDiv('toolbar-left');
		const breadcrumb = pathGroup.createDiv('breadcrumb');
		this.updateBreadcrumb(breadcrumb);
		if (this.currentPath !== '/') {
			const upBtn = pathGroup.createEl('button', { cls: 'toolbar-btn', attr: { title: t('goUp') } });
			upBtn.textContent = '⬆️';
			upBtn.addEventListener('click', () => this.navigateUp());
		}

		const rightGroup = row1.createDiv('toolbar-right');
		const searchInput = rightGroup.createEl('input', {
			cls: 'search-input',
			attr: { type: 'text', placeholder: t('searchPlaceholder'), spellcheck: 'false' }
		});
		searchInput.value = this.searchQuery;
		const clearSearchBtn = rightGroup.createEl('button', { cls: 'toolbar-btn search-clear-btn', attr: { title: t('clearSearch') } });
		clearSearchBtn.textContent = '✕';
		clearSearchBtn.style.display = this.searchQuery ? '' : 'none';
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value;
			clearSearchBtn.style.display = this.searchQuery ? '' : 'none';
			this.applySearchHighlight();
		});
		clearSearchBtn.addEventListener('click', () => {
			this.searchQuery = '';
			searchInput.value = '';
			clearSearchBtn.style.display = 'none';
			this.applySearchHighlight();
		});
		const refreshBtn = rightGroup.createEl('button', { cls: 'toolbar-btn', attr: { title: t('refresh') } });
		refreshBtn.textContent = '🔄';
		refreshBtn.addEventListener('click', () => this.refresh());

		const goToFolderBtn = rightGroup.createEl('button', { cls: 'toolbar-btn', attr: { title: t('goToFolder') } });
		goToFolderBtn.textContent = '📂';
		goToFolderBtn.addEventListener('click', () => this.openFolderSuggester());

		// ── 第二行：深度 | 统计方式 | 显示内容 ──
		const row2 = toolbar.createDiv('toolbar-row toolbar-row-spread');

		// 深度
		const depthControl = row2.createDiv('depth-control');
		const shallowDisabled = this.currentDepth <= 1 ? 'disabled' : '';
		depthControl.innerHTML = `
			<button class="toolbar-btn" data-action="shallow" ${shallowDisabled}>➖</button>
			<span class="depth-indicator">${t('depthLabel')(this.currentDepth)}</span>
			<button class="toolbar-btn" data-action="deep">➕</button>
		`;
		depthControl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const action = target.dataset.action || target.closest('[data-action]')?.getAttribute('data-action');
			if (action === 'deep') this.changeDepth(1);
			else if (action === 'shallow') this.changeDepth(-1);
		});

		// 缩放
		const zoomControl = row2.createDiv('zoom-control');
		const zoomOutDisabled = this.currentZoom <= 100 ? 'disabled' : '';
		const zoomInDisabled = this.currentZoom >= 300 ? 'disabled' : '';
		zoomControl.innerHTML = `
			<button class="toolbar-btn" data-action="zoom-out" ${zoomOutDisabled}>➖</button>
			<span class="zoom-indicator">${t('zoomLabel')(this.currentZoom)}</span>
			<button class="toolbar-btn" data-action="zoom-in" ${zoomInDisabled}>➕</button>
		`;
		zoomControl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const action = target.dataset.action || target.closest('[data-action]')?.getAttribute('data-action');
			if (action === 'zoom-in') this.changeZoom(50);
			else if (action === 'zoom-out') this.changeZoom(-50);
		});

		// 统计方式
		const modeToggle = row2.createDiv('mode-toggle');
		modeToggle.innerHTML = `
			<button class="mode-btn${this.displayMode === 'size' ? ' active' : ''}" data-mode="size">${t('modeSize')}</button>
			<button class="mode-btn${this.displayMode === 'count' ? ' active' : ''}" data-mode="count">${t('modeCount')}</button>
		`;
		modeToggle.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('mode-btn')) this.changeMode(target.dataset.mode as DisplayMode);
		});

		// 排序
		const sortControl = row2.createDiv('sort-control');
		sortControl.createEl('span', { text: t('sortLabel'), cls: 'sort-label' });
		if (this.displayMode === 'size') {
			const sortSelect = sortControl.createEl('select', { cls: 'sort-select', attr: { disabled: 'true' } });
			sortSelect.createEl('option', { text: t('sortSizeDefault') });
		} else {
			const sortSelect = sortControl.createEl('select', { cls: 'sort-select' });
			const sortOptions: { value: FileSortRule; label: string }[] = [
				{ value: 'default', label: t('sortDefault') },
				{ value: 'name-asc', label: t('sortNameAsc') },
				{ value: 'name-desc', label: t('sortNameDesc') },
				{ value: 'ctime-desc', label: t('sortCtimeDesc') },
				{ value: 'ctime-asc', label: t('sortCtimeAsc') },
				{ value: 'mtime-desc', label: t('sortMtimeDesc') },
				{ value: 'mtime-asc', label: t('sortMtimeAsc') },
				{ value: 'size-desc', label: t('sortSizeDesc') },
				{ value: 'size-asc', label: t('sortSizeAsc') },
			];
			for (const opt of sortOptions) {
				sortSelect.createEl('option', { text: opt.label, attr: { value: opt.value } });
			}
			sortSelect.value = this.settings.fileSortRule;
			sortSelect.addEventListener('change', async () => {
				this.settings.fileSortRule = sortSelect.value as FileSortRule;
				await this.onSaveSettings();
				this.renderChart();
			});
		}

		// 显示内容
		const filterGroup = row2.createDiv('filter-group');
		filterGroup.createEl('button', { text: t('filterAll'), cls: `filter-btn${this.currentFilterMode === 'all' ? ' active' : ''}`, attr: { 'data-filter': 'all' } });
		filterGroup.createEl('button', { text: t('filterNotes'), cls: `filter-btn${this.currentFilterMode === 'notes' ? ' active' : ''}`, attr: { 'data-filter': 'notes' } });
		filterGroup.createEl('button', { text: t('filterAttachments'), cls: `filter-btn${this.currentFilterMode === 'attachments' ? ' active' : ''}`, attr: { 'data-filter': 'attachments' } });
		filterGroup.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('filter-btn')) this.applyFilter(target);
		});
	}

	private async refresh() {
		if (this.isLoading) return;
		this.fileManager.clearCache();
		await this.renderChart();
	}

	private async renderChart() {
		this.showLoading();
		this.isLoading = true;

		try {
			let data = this.currentPath === '/'
				? await this.fileManager.getVaultStructure()
				: await this.fileManager.getFolderAtPath(this.currentPath);

			if (!data) return;

			// 应用内容过滤
			if (this.currentFilterMode === 'notes') {
				data = this.fileManager.filterByExtension(data, ['md']);
				if (!data) return;
			} else if (this.currentFilterMode === 'attachments') {
				data = this.fileManager.filterByNotExtension(data, ['md']);
				if (!data) return;
			}

			// 应用深度过滤
			data = this.fileManager.filterByDepth(data, data.depth + this.currentDepth);
			if (!data) return;

			this.renderChartWithData(data);
		} finally {
			this.hideLoading();
			this.isLoading = false;
		}
	}

	private getFileColor(extension?: string): string {
		const colors: Record<string, string> = {
			md: '#4a9eff',      // 蓝色
			png: '#ff6b6b',     // 红色
			jpg: '#ff6b6b',
			jpeg: '#ff6b6b',
			gif: '#ff6b6b',
			pdf: '#feca57',     // 黄色
			zip: '#5f27cd',     // 紫色
			default: '#95a5a6'   // 灰色
		};

		return extension ? (colors[extension] || colors.default) : '#1dd1a1';
	}

	private getContrastColor(extension?: string): string {
		const darkBg = ['md', 'zip', 'default'];
		return darkBg.includes(extension || '') ? 'white' : 'black';
	}

	private formatSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
	}

	private formatWordCount(count: number): string {
		return t('formatWordCount')(count);
	}

	private truncateText(text: string, maxWidth: number): string {
		const avgCharWidth = 7;
		const maxChars = Math.floor(maxWidth / avgCharWidth);
		return text.length > maxChars ? text.substring(0, maxChars - 2) + '...' : text;
	}

	private escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	private formatPropValue(val: string): string {
		if (!this.settings.dateFormat) return val;
		// 只尝试解析看起来像日期的字符串
		if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(val)) return val;
		const d = new Date(val);
		if (isNaN(d.getTime())) return val;
		const pad = (n: number) => n < 10 ? '0' + n : String(n);
		return this.settings.dateFormat
			.replace('YYYY', String(d.getFullYear()))
			.replace('MM', pad(d.getMonth() + 1))
			.replace('DD', pad(d.getDate()))
			.replace('HH', pad(d.getHours()))
			.replace('mm', pad(d.getMinutes()))
			.replace('ss', pad(d.getSeconds()));
	}

	private updateBreadcrumb(breadcrumb: HTMLElement) {
		// 生成面包屑路径
		const isRoot = this.currentPath === '/';
		const parts = isRoot ? [] : this.currentPath.split('/').filter(p => p);
		
		let html = `<span class="nav-item" data-path="/">🏠 Root</span>`;
		for (let i = 0; i < parts.length; i++) {
			const pathSoFar = parts.slice(0, i + 1).join('/');
			html += `<span class="breadcrumb-separator">/</span>`;
			html += `<span class="nav-item" data-path="${pathSoFar}">${parts[i]}</span>`;
		}
		breadcrumb.innerHTML = html;

		// 添加点击事件
		breadcrumb.querySelectorAll('.nav-item').forEach(item => {
			item.addEventListener('click', (e) => {
				e.stopPropagation();
				const target = e.target as HTMLElement;
				if (target.classList.contains('nav-item')) {
					this.navigateTo(target.dataset.path!);
				}
			});
		});
	}

	private async navigateUp() {
		if (this.currentPath === '/') {
			return;
		}

		// 获取父路径
		const pathParts = this.currentPath.split('/').filter(p => p);
		pathParts.pop();
		const parentPath = pathParts.length > 0 ? pathParts.join('/') : '/';

		await this.navigateTo(parentPath);
	}

	private async navigateTo(path: string) {
		if (this.isLoading) return;
		this.isLoading = true;
		this.showLoading();

		try {
			// 先获取数据，避免 DOM 空窗期导致闪烁
			const newPath = path;
			let data = newPath === '/'
				? await this.fileManager.getVaultStructure()
				: await this.fileManager.getFolderAtPath(newPath);

			if (!data) return;

			if (this.currentFilterMode === 'notes') {
				data = this.fileManager.filterByExtension(data, ['md']);
				if (!data) return;
			} else if (this.currentFilterMode === 'attachments') {
				data = this.fileManager.filterByNotExtension(data, ['md']);
				if (!data) return;
			}

			data = this.fileManager.filterByDepth(data, data.depth + 1);
			if (!data) return;

			// 数据就绪，一次性更新状态和 DOM
			this.currentPath = newPath;
			this.currentDepth = 1;
			this.maxDepth = 1;

			const oldToolbar = this.viewContainer?.querySelector('.toolbar');
			if (oldToolbar) oldToolbar.remove();
			this.renderToolbar();

			this.renderChartWithData(data);
		} finally {
			this.hideLoading();
			this.isLoading = false;
		}
	}

	private renderChartWithData(data: any) {
		if (!this.viewContainer) return;

		// 清除旧图表
		const oldChart = this.viewContainer.querySelector('.treemap-chart');
		if (oldChart) oldChart.remove();

		// 清除旧状态栏
		const oldStatus = this.viewContainer.querySelector('.status-bar');
		if (oldStatus) oldStatus.remove();

		// 清除旧的 tooltip
		d3.selectAll('body > .tooltip').remove();
		this.tooltip = null;

		// 状态栏（先创建，以便计算高度）
		const statusBar = this.viewContainer.createDiv('status-bar');
		this.updateStatusBar(statusBar, data);

		const chartContainer = this.viewContainer.createDiv('treemap-chart');
		// 插入到状态栏前面
		this.viewContainer.insertBefore(chartContainer, statusBar);

		// 等 DOM 布局完成后计算实际尺寸
		const width = chartContainer.clientWidth;
		const baseHeight = chartContainer.clientHeight;
		const height = Math.round(baseHeight * this.currentZoom / 100);

		if (width <= 0 || baseHeight <= 0) return;

		// 缩放时允许纵向滚动
		if (this.currentZoom > 100) {
			chartContainer.style.overflowY = 'auto';
		} else {
			chartContainer.style.overflowY = 'hidden';
		}

		// 为 D3 创建数据（filterByDepth 已将目标深度节点变为叶节点）
		const hierarchy = d3.hierarchy(data)
			.sum((d: any) => (!d.children || d.children.length === 0)
				? (this.displayMode === 'size' ? d.size : d.count)
				: 0)
			.sort((a: any, b: any) => {
				if (this.displayMode === 'size') return (b.value || 0) - (a.value || 0);
				const aIsFile = a.data.type === 'file';
				const bIsFile = b.data.type === 'file';
				if (!aIsFile || !bIsFile) return (b.value || 0) - (a.value || 0);
				return this.compareBySort(a.data, b.data);
			});

		const treemap = d3.treemap<any>()
			.tile(d3.treemapSquarify.ratio(4))
			.size([width, height])
			.padding(2)
			.round(true);

		const root = treemap(hierarchy);
		const leaves = root.leaves();

		if (leaves.length === 0) {
			chartContainer.createEl('div', { text: t('emptyLevel') });
			return;
		}

		const svg = d3.select(chartContainer)
			.append('svg')
			.attr('width', width)
			.attr('height', height);

		const cells = svg.selectAll('g')
			.data(leaves)
			.enter()
			.append('g')
			.attr('transform', (d: any) => `translate(${d.x0},${d.y0})`);

		// 绘制矩形
		cells.append('rect')
			.attr('width', (d: any) => d.x1 - d.x0)
			.attr('height', (d: any) => d.y1 - d.y0)
			.attr('fill', (d: any) => this.getFileColor(d.data.extension))
			.attr('stroke', 'white')
			.attr('stroke-width', 1)
			.style('cursor', 'pointer')
			.on('click', (event: any, d: any) => {
				// 单击：如果是文件夹，进入该层级
				if (d.data.type === 'folder') {
					this.navigateTo(d.data.path);
				} else {
					this.openFile(d.data.path);
				}
			})
			.on('dblclick', (event: any, d: any) => {
				// 双击：如果是文件夹，进入该层级
				event.stopPropagation();
				if (d.data.type === 'folder') {
					this.navigateTo(d.data.path);
				}
			});

		// 添加文本标签
		const extraProps = (this.settings.extraProperties || []).filter(p => p.builtin || p.key);
		cells.each((d: any, i: number, nodes: any[]) => {
			const g = d3.select(nodes[i]);
			const rectWidth = d.x1 - d.x0;
			const rectHeight = d.y1 - d.y0;
			const fill = this.getContrastColor(d.data.extension);

			if (rectWidth < 40 || rectHeight < 18) return;

			let yOffset = 14;
			const lineHeight = 13;

			// 名称（优先使用 title 属性）
			const displayName = d.data.displayName || d.data.name;
			g.append('text')
				.attr('x', 4).attr('y', yOffset)
				.text(this.truncateText(displayName, rectWidth - 8))
				.style('font-size', '11px')
				.style('fill', fill)
				.style('pointer-events', 'none');
			yOffset += lineHeight;

			if (d.data.type === 'folder') {
				// 文件夹：始终显示文件数和体积
				if (yOffset + 2 <= rectHeight && rectWidth > 50) {
					g.append('text')
						.attr('x', 4).attr('y', yOffset)
						.text(this.truncateText(`${t('fileCount')(d.data.count)}`, rectWidth - 8))
						.style('font-size', '10px')
						.style('fill', fill)
						.style('opacity', '0.7')
						.style('pointer-events', 'none');
					yOffset += lineHeight;
				}
				if (yOffset + 2 <= rectHeight && rectWidth > 50) {
					g.append('text')
						.attr('x', 4).attr('y', yOffset)
						.text(this.truncateText(this.formatSize(d.data.size), rectWidth - 8))
						.style('font-size', '10px')
						.style('fill', fill)
						.style('opacity', '0.7')
						.style('pointer-events', 'none');
				}
			} else if (d.data.extension === 'md') {
				// Markdown 笔记：按 extraProperties 配置显示
				for (const prop of extraProps) {
					if (!prop.showInRect) continue;
					if (yOffset + 2 > rectHeight || rectWidth < 50) break;
					let text: string | null = null;
					if (prop.builtin === 'wordCount') {
						if (d.data.wordCount != null) text = this.formatWordCount(d.data.wordCount);
					} else if (prop.builtin === 'fileSize') {
						text = this.formatSize(d.data.size);
					} else if (prop.builtin === 'folder') {
						const parts = d.data.path.split('/');
						if (parts.length >= 2) text = parts[parts.length - 2];
					} else if (d.data.extraProps) {
						const val = d.data.extraProps[prop.key];
						if (val) text = this.formatPropValue(val);
					}
					if (text == null) continue;
					const prefix = prop.label || '';
					g.append('text')
						.attr('x', 4).attr('y', yOffset)
						.text(this.truncateText(prefix + text, rectWidth - 8))
						.style('font-size', '10px')
						.style('fill', fill)
						.style('opacity', '0.7')
						.style('pointer-events', 'none');
					yOffset += lineHeight;
				}
			}
		});

		// 重新创建 tooltip（因为之前的被移除了）
		this.tooltip = d3.select('body')
			.append('div')
			.attr('class', 'tooltip')
			.style('position', 'absolute')
			.style('display', 'none')
			.style('background', 'rgba(0,0,0,0.8)')
			.style('color', 'white')
			.style('padding', '8px')
			.style('border-radius', '4px')
			.style('font-size', '12px');

		cells
			.on('mouseenter', (event: any, d: any) => {
				this.tooltip.style('display', 'block');
			})
			.on('mousemove', (event: any, d: any) => {
				const icon = d.data.type === 'folder' ? '📁' : '📄';
				const tooltipName = this.settings.useTitleInTooltip
					? (d.data.displayName || d.data.name)
					: d.data.name;
				const size = this.formatSize(d.data.size);

				if (d.data.type === 'folder') {
					// 文件夹：始终显示文件数和体积
					this.tooltip
						.html(`${icon} <strong>${this.escapeHtml(tooltipName)}</strong><br/>${size}<br/>${t('fileCount')(d.data.count)}`)
						.style('left', (event.pageX + 10) + 'px')
						.style('top', (event.pageY + 10) + 'px');
				} else if (d.data.extension === 'md') {
					// Markdown 笔记：按 extraProperties 配置显示
					const infoTokens: string[] = [];
					let propsHtml = '';
					for (const prop of extraProps) {
						if (!prop.showInTooltip) continue;
						const prefix = prop.label || '';
						if (prop.builtin === 'wordCount') {
							if (d.data.wordCount != null) infoTokens.push(prefix + this.formatWordCount(d.data.wordCount));
						} else if (prop.builtin === 'fileSize') {
							infoTokens.push(prefix + size);					} else if (prop.builtin === 'folder') {
						const parts = d.data.path.split('/');
						if (parts.length >= 2) infoTokens.push(prefix + parts[parts.length - 2]);						} else if (d.data.extraProps) {
							const val = d.data.extraProps[prop.key];
							if (val) propsHtml += `<br/><span style="opacity:0.75">${this.escapeHtml(prop.key)}: ${this.escapeHtml(String(val))}</span>`;
						}
					}
					const infoLine = infoTokens.join(' · ');
					this.tooltip
						.html(`${icon} <strong>${this.escapeHtml(tooltipName)}</strong>${infoLine ? '<br/>' + infoLine : ''}${propsHtml}`)
						.style('left', (event.pageX + 10) + 'px')
						.style('top', (event.pageY + 10) + 'px');
				} else {
					// 其他文件：只显示名称和体积
					this.tooltip
						.html(`${icon} <strong>${this.escapeHtml(tooltipName)}</strong><br/>${size}`)
						.style('left', (event.pageX + 10) + 'px')
						.style('top', (event.pageY + 10) + 'px');
				}
			})
			.on('mouseleave', (event: any, d: any) => {
				this.tooltip.style('display', 'none');
			});

		// 应用当前搜索高亮
		this.applySearchHighlight();
	}

	private applySearchHighlight() {
		const svg = this.viewContainer?.querySelector('.treemap-chart svg');
		if (!svg) return;

		const query = this.searchQuery.trim();
		const keywords = query ? query.split(/\s+/).filter(k => k) : [];
		const fuzzyMatchers = keywords.map(k => prepareFuzzySearch(k));

		d3.select(svg).selectAll('g').each(function(d: any) {
			const g = d3.select(this);
			const rect = g.select('rect');
			if (!rect.node()) return;

			if (fuzzyMatchers.length === 0) {
				rect.style('opacity', null);
				return;
			}

			const name = d?.data?.displayName || d?.data?.name || '';
			const path = d?.data?.path || '';
			const match = fuzzyMatchers.every(fn => fn(name) || fn(path));
			rect.style('opacity', match ? '1' : '0.15');
		});
	}

	private updateStatusBar(statusBar: HTMLElement, data: any) {
		const folders = data.children?.filter((c: any) => c.type === 'folder').length || 0;
		const files = data.count || 0;
		const size = this.formatSize(data.size || 0);
		const items = data.children?.length || 0;

		statusBar.textContent = t('statusBar')(items, folders, files, size);
	}

	private openFile(path: string) {
		if (!this.settings.clickToOpen) return;

		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;

		const loc = this.settings.openLocation;
		if (loc === 'split') {
			this.app.workspace.getLeaf('split').openFile(file);
		} else if (loc === 'window') {
			this.app.workspace.getLeaf('window').openFile(file);
		} else {
			this.app.workspace.getLeaf('tab').openFile(file);
		}
	}

	private applyFilter(btn: HTMLElement) {
		const buttons = btn.parentElement!.querySelectorAll('.filter-btn');
		buttons.forEach(b => b.classList.remove('active'));
		btn.classList.add('active');

		const mode = btn.dataset.filter as 'all' | 'notes' | 'attachments';
		this.currentFilterMode = mode || 'all';
		this.renderChart();
	}

	private showLoading() {
		if (!this.viewContainer) return;
		const existing = this.viewContainer.querySelector('.loading-overlay');
		if (existing) return;

		const overlay = document.createElement('div');
		overlay.className = 'loading-overlay';
		overlay.style.cssText = `
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			background: transparent;
			display: flex;
			justify-content: center;
			z-index: 1000;
			pointer-events: none;
		`;

		const bar = document.createElement('div');
		bar.style.cssText = `
			width: 200px;
			height: 4px;
			background: rgba(255,255,255,0.2);
			border-radius: 2px;
			overflow: hidden;
		`;
		const fill = document.createElement('div');
		fill.style.cssText = `
			width: 40%;
			height: 100%;
			background: var(--interactive-accent);
			border-radius: 2px;
			animation: loading-slide 1s ease-in-out infinite;
		`;
		bar.appendChild(fill);
		overlay.appendChild(bar);

		// 用 prepend 保证 overlay 不影响 DOM 顺序
		this.viewContainer.prepend(overlay);
	}

	private hideLoading() {
		if (!this.viewContainer) return;
		const overlay = this.viewContainer.querySelector('.loading-overlay');
		if (overlay) {
			overlay.remove();
		}
	}

	private changeDepth(delta: number) {
		if (this.isLoading) return;

		const newDepth = this.currentDepth + delta;

		if (newDepth >= 1) {
			this.currentDepth = newDepth;
			if (newDepth > this.maxDepth) {
				this.maxDepth = newDepth;
			}
			this.updateDepthIndicator();
			this.updateDepthButtons();
			this.renderChart();
		}
	}

	private updateDepthIndicator() {
		const indicator = this.viewContainer?.querySelector('.depth-indicator');
		if (indicator) {
			indicator.textContent = t('depthLabel')(this.currentDepth);
		}
	}

	private updateDepthButtons() {
		const shallowBtn = this.viewContainer?.querySelector('[data-action="shallow"]') as HTMLElement;
		if (shallowBtn) {
			if (this.currentDepth <= 1) {
				shallowBtn.setAttribute('disabled', 'true');
			} else {
				shallowBtn.removeAttribute('disabled');
			}
		}
	}

	private changeZoom(delta: number) {
		if (this.isLoading) return;
		const newZoom = this.currentZoom + delta;
		if (newZoom >= 100 && newZoom <= 300) {
			this.currentZoom = newZoom;
			this.updateZoomIndicator();
			this.updateZoomButtons();
			this.renderChart();
		}
	}

	private updateZoomIndicator() {
		const indicator = this.viewContainer?.querySelector('.zoom-indicator');
		if (indicator) {
			indicator.textContent = t('zoomLabel')(this.currentZoom);
		}
	}

	private updateZoomButtons() {
		const zoomOutBtn = this.viewContainer?.querySelector('[data-action="zoom-out"]') as HTMLElement;
		const zoomInBtn = this.viewContainer?.querySelector('[data-action="zoom-in"]') as HTMLElement;
		if (zoomOutBtn) {
			if (this.currentZoom <= 100) zoomOutBtn.setAttribute('disabled', 'true');
			else zoomOutBtn.removeAttribute('disabled');
		}
		if (zoomInBtn) {
			if (this.currentZoom >= 300) zoomInBtn.setAttribute('disabled', 'true');
			else zoomInBtn.removeAttribute('disabled');
		}
	}

	private compareBySort(a: FileNode, b: FileNode): number {
		const rule = this.settings.fileSortRule;
		switch (rule) {
			case 'name-asc': return a.name.localeCompare(b.name);
			case 'name-desc': return b.name.localeCompare(a.name);
			case 'ctime-desc': return (b.ctime || 0) - (a.ctime || 0);
			case 'ctime-asc': return (a.ctime || 0) - (b.ctime || 0);
			case 'mtime-desc': return (b.mtime || 0) - (a.mtime || 0);
			case 'mtime-asc': return (a.mtime || 0) - (b.mtime || 0);
			case 'size-desc': return (b.size || 0) - (a.size || 0);
			case 'size-asc': return (a.size || 0) - (b.size || 0);
			default: return (b.count || 0) - (a.count || 0);
		}
	}

	private changeMode(mode: DisplayMode) {
		if (this.displayMode === mode) return;

		this.displayMode = mode;

		// 重建工具栏以切换排序控件的可见性
		const oldToolbar = this.viewContainer?.querySelector('.toolbar');
		if (oldToolbar) oldToolbar.remove();
		this.renderToolbar();

		this.renderChart();
	}

	private copyNodeTree(node: FileNode): FileNode[] | undefined {
		if (!node.children || node.children.length === 0) {
			return undefined;
		}
		return node.children.map(child => ({
			name: child.name,
			path: child.path,
			type: child.type,
			size: child.size,
			count: child.count,
			depth: child.depth - this.currentDepth + 1, // 相对深度
			children: this.copyNodeTree(child)
		}));
	}

	openFolderSuggester() {
		const modal = new FolderSuggestModal(this.app, (folder: TFolder) => {
			this.navigateTo(folder.path);
		});
		modal.open();
	}

	async onClose() {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.resizeTimer) {
			clearTimeout(this.resizeTimer);
			this.resizeTimer = null;
		}
		d3.selectAll('body > .tooltip').remove();
		this.tooltip = null;
		this.viewContainer = null;
		this.containerEl.empty();
	}
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: any, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder(t('goToFolderDesc'));
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		const collect = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFolder) {
					folders.push(child);
					collect(child);
				}
			}
		};
		collect(this.app.vault.getRoot());
		return folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
