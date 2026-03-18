import { moment } from 'obsidian';

const zh = {
	// 设置面板 - 分组标题
	ignoreRules: '忽略规则',
	propertyConfig: '属性配置',
	behavior: '交互行为',

	// 忽略规则
	ignoreFolders: '忽略文件夹',
	ignoreFoldersDesc: '输入要忽略的文件夹名称，每行一个。匹配任意层级中同名的文件夹。',
	ignoreExtensions: '忽略文件类型',
	ignoreExtensionsDesc: '输入要忽略的文件扩展名（不含点），每行一个。例如：tmp、log',
	ignorePatterns: '忽略路径模式',
	ignorePatternsDesc: '输入要忽略的路径关键词，每行一个。路径中包含该关键词的文件/文件夹会被忽略。',
	ignoreHidden: '忽略隐藏文件',
	ignoreHiddenDesc: '忽略以 . 开头的文件和文件夹（如 .obsidian、.git）',
	ignoreNote: '修改忽略规则后，请点击刷新按钮以生效。',

	// 属性配置
	titleProperty: '显示名称属性',
	titlePropertyDesc: '读取 frontmatter 中的此属性作为显示名称，未设置时回退到文件名。留空则始终使用文件名。',
	useTitleInTooltip: '浮动提示使用显示名称',
	useTitleInTooltipDesc: '开启后，tooltip 中使用 title 属性作为名称；关闭则始终显示文件原名。',
	displayProperties: '笔记属性显示',
	displayPropertiesDesc: '仅对 Markdown 笔记生效。在矩形和浮动提示中显示的属性。内置属性不可删除，自定义属性读取 frontmatter。文件夹始终显示文件数和体积。',
	addProperty: '+ 添加属性',
	colProperty: '属性',
	colPrefix: '显示前缀',
	showInRect: '在矩形内显示',
	showInTooltip: '在浮动提示中显示',
	deleteProperty: '删除',
	builtinWordCount: '字数',
	builtinFileSize: '体积',
	builtinFolder: '文件夹',
	placeholderKey: '属性名',
	placeholderPrefix: '显示前缀',
	dateFormat: '日期属性格式',
	dateFormatDesc: '如果额外属性的值能解析为日期，则按此格式显示。支持 YYYY、MM、DD、HH、mm、ss。',

	// 排序
	sortGroup: '排序',
	fileSortRule: '文件排序规则',
	fileSortRuleDesc: '仅在「按数量」模式下对文件生效，文件夹始终按数量/体积排序。',
	sortLabel: '文件排序',
	sortSizeDefault: '默认（体积）',
	sortDefault: '默认（数量）',
	sortNameAsc: '文件名 A → Z',
	sortNameDesc: '文件名 Z → A',
	sortCtimeDesc: '创建时间 新 → 旧',
	sortCtimeAsc: '创建时间 旧 → 新',
	sortMtimeDesc: '修改时间 新 → 旧',
	sortMtimeAsc: '修改时间 旧 → 新',
	sortSizeDesc: '体积 大 → 小',
	sortSizeAsc: '体积 小 → 大',
	ctimeProperty: '创建时间属性覆盖',
	ctimePropertyDesc: '用 frontmatter 中的此属性替代文件创建时间，留空则使用系统 ctime。',
	mtimeProperty: '修改时间属性覆盖',
	mtimePropertyDesc: '用 frontmatter 中的此属性替代文件修改时间，留空则使用系统 mtime。',

	// 交互行为
	defaultMode: '默认计数规则',
	defaultModeDesc: '打开视图时默认的显示模式',
	modeSizeLabel: '按体积',
	modeCountLabel: '按数量',
	clickToOpen: '点击打开文件',
	clickToOpenDesc: '点击文件矩形时打开对应文件',
	openLocation: '打开位置',
	openLocationDesc: '选择文件打开的位置',
	openInTab: '新标签页',
	openInSplit: '分屏',
	openInWindow: '新窗口',

	goToFolder: '跳转文件夹',
	goToFolderDesc: '选择一个文件夹，快速跳转到该位置',
	noFolders: '没有找到文件夹',

	// 视图工具栏
	goUp: '返回上级',
	refresh: '刷新',
	clearSearch: '清空过滤',
	searchPlaceholder: '🔍 过滤...',
	depthLabel: (n: number) => `深度: ${n}`,
	zoomLabel: (n: number) => `缩放: ${n}%`,
	modeSize: '📦 按体积',
	modeCount: '📊 按数量',
	filterAll: '全部',
	filterNotes: '📝 笔记',
	filterAttachments: '📎 附件',

	// 图表
	emptyLevel: '当前层级没有内容',
	fileCount: (n: number) => `${n} 个文件`,
	statusBar: (items: number, folders: number, files: number, size: string) =>
		`${items} 个项目（${folders} 文件夹、${items - folders} 文件）· ${files} 个文件总计 · ${size}`,

	// Word count format
	formatWordCount: (n: number) => {
		if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万字';
		if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' 千字';
		return n + ' 字';
	},
};

const en: typeof zh = {
	// Settings panel - group headings
	ignoreRules: 'Ignore Rules',
	propertyConfig: 'Properties',
	behavior: 'Behavior',

	// Ignore rules
	ignoreFolders: 'Ignore Folders',
	ignoreFoldersDesc: 'Folder names to ignore, one per line. Matches folders at any depth with the same name.',
	ignoreExtensions: 'Ignore File Types',
	ignoreExtensionsDesc: 'File extensions to ignore (without dot), one per line. Example: tmp, log',
	ignorePatterns: 'Ignore Path Patterns',
	ignorePatternsDesc: 'Path keywords to ignore, one per line. Files/folders whose path contains the keyword will be ignored.',
	ignoreHidden: 'Ignore Hidden Files',
	ignoreHiddenDesc: 'Ignore files and folders starting with . (e.g. .obsidian, .git)',
	ignoreNote: 'After modifying ignore rules, click the refresh button to apply.',

	// Property config
	titleProperty: 'Title Property',
	titlePropertyDesc: 'Read this frontmatter property as the display name. Falls back to filename if not set. Leave empty to always use the filename.',
	useTitleInTooltip: 'Use Title in Tooltip',
	useTitleInTooltipDesc: 'When enabled, the tooltip uses the title property as the name; otherwise always shows the raw filename.',
	displayProperties: 'Note Properties',
	displayPropertiesDesc: 'Only applies to Markdown notes. Properties shown on rects and tooltips. Built-in properties cannot be deleted; custom ones read from frontmatter. Folders always show file count and size.',
	addProperty: '+ Add Property',
	colProperty: 'Property',
	colPrefix: 'Prefix',
	showInRect: 'Show on rect',
	showInTooltip: 'Show in tooltip',
	deleteProperty: 'Delete',
	builtinWordCount: 'Words',
	builtinFileSize: 'Size',
	builtinFolder: 'Folder',
	placeholderKey: 'Property key',
	placeholderPrefix: 'Prefix',
	dateFormat: 'Date Format',
	dateFormatDesc: 'If a property value can be parsed as a date, display it in this format. Supports YYYY, MM, DD, HH, mm, ss.',

	// Sort
	sortGroup: 'Sorting',
	fileSortRule: 'File Sort Rule',
	fileSortRuleDesc: 'Only applies to files in "By count" mode. Folders are always sorted by count/size.',
	clearSearch: 'Clear filter',
	sortLabel: 'File sort',
	sortSizeDefault: 'Default (size)',
	sortDefault: 'Default (count)',
	sortNameAsc: 'Name A → Z',
	sortNameDesc: 'Name Z → A',
	sortCtimeDesc: 'Created newest first',
	sortCtimeAsc: 'Created oldest first',
	sortMtimeDesc: 'Modified newest first',
	sortMtimeAsc: 'Modified oldest first',
	sortSizeDesc: 'Size largest first',
	sortSizeAsc: 'Size smallest first',
	ctimeProperty: 'Created Time Property Override',
	ctimePropertyDesc: 'Use this frontmatter property instead of file ctime. Leave empty to use system ctime.',
	mtimeProperty: 'Modified Time Property Override',
	mtimePropertyDesc: 'Use this frontmatter property instead of file mtime. Leave empty to use system mtime.',

	// Behavior
	defaultMode: 'Default Mode',
	defaultModeDesc: 'Default display mode when opening the view',
	modeSizeLabel: 'By size',
	modeCountLabel: 'By count',
	clickToOpen: 'Click to Open File',
	clickToOpenDesc: 'Open the file when clicking its rect',
	openLocation: 'Open Location',
	openLocationDesc: 'Choose where to open the file',
	openInTab: 'New tab',
	openInSplit: 'Split',
	openInWindow: 'New window',

	goToFolder: 'Go to folder',
	goToFolderDesc: 'Select a folder to jump to',
	noFolders: 'No folders found',

	// View toolbar
	goUp: 'Go up',
	refresh: 'Refresh',
	searchPlaceholder: '🔍 Filter...',
	depthLabel: (n: number) => `Depth: ${n}`,
	zoomLabel: (n: number) => `Zoom: ${n}%`,
	modeSize: '📦 By size',
	modeCount: '📊 By count',
	filterAll: 'All',
	filterNotes: '📝 Notes',
	filterAttachments: '📎 Attachments',

	// Chart
	emptyLevel: 'Nothing at this level',
	fileCount: (n: number) => `${n} file${n === 1 ? '' : 's'}`,
	statusBar: (items: number, folders: number, files: number, size: string) =>
		`${items} item${items === 1 ? '' : 's'} (${folders} folder${folders === 1 ? '' : 's'}, ${items - folders} file${items - folders === 1 ? '' : 's'}) · ${files} file${files === 1 ? '' : 's'} total · ${size}`,

	// Word count format
	formatWordCount: (n: number) => {
		if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
		if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
		return String(n);
	},
};

function getLang(): string {
	return moment.locale();
}

export function t<K extends keyof typeof zh>(key: K): typeof zh[K] {
	const lang = getLang();
	const isChinese = lang.startsWith('zh');
	return (isChinese ? zh[key] : en[key]) as typeof zh[K];
}
