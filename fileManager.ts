import { App, TFile, TFolder, CachedMetadata } from 'obsidian';
import type { VaultSnifferSettings } from './settings';

export interface FileNode {
	name: string;
	displayName?: string;
	path: string;
	size: number;
	count: number;
	type: 'file' | 'folder';
	extension?: string;
	children?: FileNode[];
	depth: number;
}

export class FileManager {
	private cache: Map<string, FileNode> = new Map();
	private lastUpdateTime = 0;
	private readonly CACHE_TTL = 300000; // 5分钟缓存
	private settings: VaultSnifferSettings | null = null;

	constructor(private app: App) {}

	setSettings(settings: VaultSnifferSettings) {
		this.settings = settings;
		// 设置变更时清除缓存
		this.cache.clear();
		this.lastUpdateTime = 0;
	}

	clearCache() {
		this.cache.clear();
		this.lastUpdateTime = 0;
	}

	private shouldIgnore(name: string, path: string, isFolder: boolean, extension?: string): boolean {
		if (!this.settings) return false;

		// 隐藏文件
		if (this.settings.ignoreHidden && name.startsWith('.')) return true;

		// 文件夹名称
		if (isFolder && this.settings.ignoreFolders.includes(name)) return true;

		// 扩展名
		if (extension && this.settings.ignoreExtensions.includes(extension)) return true;

		// 路径关键词
		if (this.settings.ignorePatterns.some(p => path.includes(p))) return true;

		return false;
	}

	async getVaultStructure(refresh = false): Promise<FileNode> {
		const now = Date.now();
		if (!refresh && this.cache.has('root') && now - this.lastUpdateTime < this.CACHE_TTL) {
			return this.cache.get('root')!;
		}

		const rootNode = await this.buildTree(this.app.vault.getRoot());
		this.cache.set('root', rootNode);
		this.lastUpdateTime = now;
		return rootNode;
	}

	async getFolderAtPath(path: string, refresh = false): Promise<FileNode | null> {
		const cacheKey = `folder:${path}`;
		const now = Date.now();

		if (!refresh && this.cache.has(cacheKey) && now - this.lastUpdateTime < this.CACHE_TTL) {
			return this.cache.get(cacheKey)!;
		}

		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!folder || !(folder instanceof TFolder)) {
			return null;
		}

		const node = await this.buildTree(folder);
		this.cache.set(cacheKey, node);
		return node;
	}

	private async buildTree(folder: TFolder): Promise<FileNode> {
		const children = folder.children;

		const node: FileNode = {
			name: folder.name,
			path: folder.path,
			size: 0,
			count: 0,
			type: 'folder',
			children: [],
			depth: this.getDepth(folder.path)
		};

		// 并行获取所有子文件/文件夹的大小
		const childPromises = children.map(async (child) => {
			if (child instanceof TFile) {
				if (this.shouldIgnore(child.name, child.path, false, child.extension)) return null;
				const displayName = this.getDisplayName(child);
				return {
					name: child.name,
					displayName,
					path: child.path,
					size: await this.getFileSize(child),
					count: 1,
					type: 'file' as const,
					extension: child.extension,
					depth: node.depth + 1
				};
			} else if (child instanceof TFolder) {
				if (this.shouldIgnore(child.name, child.path, true)) return null;
				return this.buildTree(child);
			}
		});

		const results = await Promise.all(childPromises);
		node.children = results.filter(Boolean) as FileNode[];
		node.size = node.children.reduce((sum, child) => sum + child.size, 0);
		node.count = node.children.reduce((sum, child) => sum + child.count, 0);

		return node;
	}

	private async getFileSize(file: TFile): Promise<number> {
		try {
			const stat = await this.app.vault.adapter.stat(file.path);
			return (stat?.size as number) || 0;
		} catch (e) {
			console.error('Error getting file size:', e);
			return 0;
		}
	}

	private getDepth(path: string): number {
		return path.split('/').filter(p => p).length;
	}

	private getDisplayName(file: TFile): string | undefined {
		if (!this.settings?.titleProperty) return undefined;
		const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
		const title = cache?.frontmatter?.[this.settings.titleProperty];
		return typeof title === 'string' && title.length > 0 ? title : undefined;
	}

	// 过滤功能
	filterByExtension(node: FileNode, extensions: string[]): FileNode | null {
		if (node.type === 'file') {
			if (!node.extension || !extensions.includes(node.extension)) {
				return null;
			}
			return { ...node };
		}

		const filteredChildren = (node.children || [])
			.map(child => this.filterByExtension(child, extensions))
			.filter((child): child is FileNode => child !== null);

		if (filteredChildren.length === 0) {
			return null;
		}

		return {
			...node,
			children: filteredChildren,
			size: filteredChildren.reduce((sum, child) => sum + child.size, 0),
			count: filteredChildren.reduce((sum, child) => sum + child.count, 0)
		};
	}

	// 按深度过滤，只显示到指定深度的节点
	filterByDepth(node: FileNode, targetDepth: number): FileNode | null {
		if (node.depth > targetDepth) {
			// 超过目标深度，不包含
			return null;
		}

		if (node.depth === targetDepth) {
			// 到达目标深度，保留节点和所有子节点（用于计算size/count）
			// 注意：这里不清除 children，因为需要递归计算总和
			return { ...node };
		}

		// 未到达目标深度，继续递归
		const filteredChildren = (node.children || [])
			.map(child => this.filterByDepth(child, targetDepth))
			.filter((child): child is FileNode => child !== null);

		return {
			...node,
			children: filteredChildren,
			size: filteredChildren.reduce((sum, child) => sum + child.size, 0),
			count: filteredChildren.reduce((sum, child) => sum + child.count, 0)
		};
	}
}
