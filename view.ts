// @ts-nocheck
import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import * as d3 from 'd3';
import { FileManager, FileNode } from './fileManager';
import type { VaultSnifferSettings, DisplayMode } from './settings';

const VIEW_TYPE = 'vault-sniffer-view';

export class VaultSnifferView extends ItemView {
	private fileManager: FileManager;
	private settings: VaultSnifferSettings;
	private currentPath = '/';
	private currentFilter: string[] = [];
	private currentDepth = 1;
	private maxDepth = 1;
	displayMode: DisplayMode = 'count';
	private viewContainer: HTMLElement | null = null;
	private tooltip: any = null;
	private isLoading = false;
	private resizeObserver: ResizeObserver | null = null;
	private resizeTimer: number | null = null;
	private searchQuery = '';

	constructor(leaf: WorkspaceLeaf, fileManager: FileManager, settings: VaultSnifferSettings) {
		super(leaf);
		this.fileManager = fileManager;
		this.settings = settings;
		this.displayMode = settings.defaultMode;
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

		// 第一行：导航
		const row1 = toolbar.createDiv('toolbar-row');

		const breadcrumb = row1.createDiv('breadcrumb');
		this.updateBreadcrumb(breadcrumb);

		if (this.currentPath !== '/') {
			const upBtn = row1.createEl('button', { cls: 'toolbar-btn', attr: { title: '返回上级' } });
			upBtn.textContent = '⬆️';
			upBtn.addEventListener('click', () => this.navigateUp());
		}

		const refreshBtn = row1.createEl('button', { cls: 'toolbar-btn', attr: { title: '刷新' } });
		refreshBtn.textContent = '🔄';
		refreshBtn.addEventListener('click', () => this.refresh());

		// 过滤框
		const searchInput = row1.createEl('input', {
			cls: 'search-input',
			attr: { type: 'text', placeholder: '🔍 过滤...', spellcheck: 'false' }
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
			this.applySearchHighlight();
		});

		// 第二行：所有控制
		const row2 = toolbar.createDiv('toolbar-row');

		// 深度
		const depthControl = row2.createDiv('depth-control');
		const shallowDisabled = this.currentDepth <= 1 ? 'disabled' : '';
		depthControl.innerHTML = `
			<button class="toolbar-btn" data-action="shallow" ${shallowDisabled}>➖</button>
			<span class="depth-indicator">深度: ${this.currentDepth}</span>
			<button class="toolbar-btn" data-action="deep">➕</button>
		`;
		depthControl.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const action = target.dataset.action || target.closest('[data-action]')?.getAttribute('data-action');
			if (action === 'deep') this.changeDepth(1);
			else if (action === 'shallow') this.changeDepth(-1);
		});

		// 模式
		const modeToggle = row2.createDiv('mode-toggle');
		modeToggle.innerHTML = `
			<button class="mode-btn${this.displayMode === 'size' ? ' active' : ''}" data-mode="size">📦 按大小</button>
			<button class="mode-btn${this.displayMode === 'count' ? ' active' : ''}" data-mode="count">📊 按数量</button>
		`;
		modeToggle.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (target.classList.contains('mode-btn')) this.changeMode(target.dataset.mode as DisplayMode);
		});

		// 过滤
		const filterGroup = row2.createDiv('filter-group');
		filterGroup.createEl('button', { text: '全部', cls: 'filter-btn active' });
		filterGroup.createEl('button', { text: '📝 .md', cls: 'filter-btn' });
		filterGroup.createEl('button', { text: '🖼️ 图片', cls: 'filter-btn' });
		filterGroup.createEl('button', { text: '📄 PDF', cls: 'filter-btn' });
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

	private markVisibleDepth(node: FileNode, relativeDepth: number = 0) {
		if (!node) return;
		if (relativeDepth === this.currentDepth) {
			node.visibleDepth = this.currentDepth;
		} else {
			if (node.visibleDepth) delete node.visibleDepth;
		}

		if (node.children) {
			node.children.forEach(child => {
				this.markVisibleDepth(child, relativeDepth + 1);
			});
		}
	}

	private async renderChart() {
		if (!this.viewContainer) return;

		this.showLoading();
		this.isLoading = true;

		try {
			let data = this.currentPath === '/'
				? await this.fileManager.getVaultStructure()
				: await this.fileManager.getFolderAtPath(this.currentPath);

			if (!data) return;

			if (this.currentFilter.length > 0) {
				data = this.fileManager.filterByExtension(data, this.currentFilter);
				if (!data) return;
			}

			data = this.fileManager.filterByDepth(data, data.depth + this.currentDepth);
			if (!data) return;

			this.markVisibleDepth(data, 0);

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

	private truncateText(text: string, maxWidth: number): string {
		const avgCharWidth = 7;
		const maxChars = Math.floor(maxWidth / avgCharWidth);
		return text.length > maxChars ? text.substring(0, maxChars - 2) + '...' : text;
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
		this.currentPath = path;
		this.currentDepth = 1; // 重置深度
		this.maxDepth = 1;

		// 先清除旧图表
		const oldChart = this.viewContainer?.querySelector('.treemap-chart');
		if (oldChart) oldChart.remove();

		// 重建工具栏：移除旧的，在容器开头插入新的
		const oldToolbar = this.viewContainer?.querySelector('.toolbar');
		if (oldToolbar) oldToolbar.remove();
		this.renderToolbar();

		await this.renderChart();
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
		const height = chartContainer.clientHeight;

		if (width <= 0 || height <= 0) return;

		// 将 visible depth 节点变成叶节点，使 treemap 能正确布局
		const prepareForTreemap = (node: any): any => {
			if (node.visibleDepth === this.currentDepth) {
				return { ...node, children: undefined };
			}
			if (node.children) {
				const children = node.children
					.map((c: any) => prepareForTreemap(c))
					.filter(Boolean);
				return { ...node, children: children.length > 0 ? children : undefined };
			}
			return { ...node };
		};

		const treemapData = prepareForTreemap(data);

		// 为 D3 创建数据
		const hierarchy = d3.hierarchy(treemapData)
			.sum((d: any) => (!d.children || d.children.length === 0)
				? (this.displayMode === 'size' ? d.size : d.count)
				: 0)
			.sort((a: any, b: any) => (b.value || 0) - (a.value || 0));

		const treemap = d3.treemap<any>()
			.size([width, height])
			.padding(2)
			.round(true);

		const root = treemap(hierarchy);
		const leaves = root.leaves();

		if (leaves.length === 0) {
			chartContainer.createEl('div', { text: '当前层级没有内容' });
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
		cells.each((d: any, i: number, nodes: any[]) => {
			const g = d3.select(nodes[i]);
			const rectWidth = d.x1 - d.x0;
			const rectHeight = d.y1 - d.y0;
			const fill = this.getContrastColor(d.data.extension);

			if (rectWidth < 40 || rectHeight < 18) return;

			// 名称（优先使用 title 属性）
			const displayName = d.data.displayName || d.data.name;
			g.append('text')
				.attr('x', 4).attr('y', 14)
				.text(this.truncateText(displayName, rectWidth - 8))
				.style('font-size', '11px')
				.style('fill', fill)
				.style('pointer-events', 'none');

			// 大小
			if (rectHeight > 34 && rectWidth > 50) {
				g.append('text')
					.attr('x', 4).attr('y', 28)
					.text(this.formatSize(d.data.size))
					.style('font-size', '10px')
					.style('fill', fill)
					.style('opacity', '0.75')
					.style('pointer-events', 'none');
			}

			// 文件数量（仅文件夹）
			if (rectHeight > 48 && rectWidth > 50 && d.data.type === 'folder') {
				g.append('text')
					.attr('x', 4).attr('y', 42)
					.text(`${d.data.count} 个文件`)
					.style('font-size', '10px')
					.style('fill', fill)
					.style('opacity', '0.6')
					.style('pointer-events', 'none');
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
				const displayName = d.data.displayName || d.data.name;
				const size = this.formatSize(d.data.size);
				const extra = d.data.type === 'folder' ? ` · ${d.data.count} 个文件` : '';
				this.tooltip
					.html(`${icon} <strong>${displayName}</strong><br/>${size}${extra}`)
					.style('left', (event.pageX + 10) + 'px')
					.style('top', (event.pageY + 10) + 'px');
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

		const query = this.searchQuery;
		d3.select(svg).selectAll('g').each(function(d: any) {
			const g = d3.select(this);
			const rect = g.select('rect');
			if (!rect.node()) return;

			if (!query) {
				rect.style('opacity', null);
				return;
			}

			const name = (d?.data?.displayName || d?.data?.name || '').toLowerCase();
			const path = (d?.data?.path || '').toLowerCase();
			const match = name.includes(query) || path.includes(query);
			rect.style('opacity', match ? '1' : '0.15');
		});
	}

	private updateStatusBar(statusBar: HTMLElement, data: any) {
		const folders = data.children?.filter((c: any) => c.type === 'folder').length || 0;
		const files = data.count || 0;
		const size = this.formatSize(data.size || 0);
		const items = data.children?.length || 0;

		statusBar.textContent = `${items} 个项目（${folders} 文件夹、${items - folders} 文件）· ${files} 个文件总计 · ${size}`;
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
		// 更新按钮状态
		const buttons = btn.parentElement!.querySelectorAll('.filter-btn');
		buttons.forEach(b => b.classList.remove('active'));
		btn.classList.add('active');

		const filterText = btn.textContent!;

		if (filterText === '全部') {
			this.currentFilter = [];
		} else if (filterText.includes('.md')) {
			this.currentFilter = ['md'];
		} else if (filterText.includes('图片')) {
			this.currentFilter = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
		} else if (filterText.includes('PDF')) {
			this.currentFilter = ['pdf'];
		}

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
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			z-index: 1000;
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
			indicator.textContent = `深度: ${this.currentDepth}`;
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

	private changeMode(mode: DisplayMode) {
		if (this.displayMode === mode) return;

		this.displayMode = mode;

		// 更新按钮状态
		const buttons = this.viewContainer?.querySelectorAll('.mode-btn');
		buttons?.forEach(b => {
			b.classList.remove('active');
			if (b.dataset.mode === mode) {
				b.classList.add('active');
			}
		});

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
