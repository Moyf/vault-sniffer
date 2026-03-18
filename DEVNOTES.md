# Vault Sniffer - Obsidian Treemap 可视化插件

## 项目概述
Obsidian 插件，以 Treemap 矩形树图的方式可视化展示 Vault 中文件/文件夹的大小和数量分布。

## 技术栈
- TypeScript + Obsidian Plugin API
- D3.js (treemap 布局 + SVG 渲染)
- esbuild 打包，输出到 dist/ 并自动复制到 Obsidian 插件目录

## 文件结构
- `main.ts` — 插件入口，注册视图、命令、设置面板
- `view.ts` — VaultSnifferView (ItemView)，核心视图逻辑（`@ts-nocheck`）
- `fileManager.ts` — 文件树构建、缓存、过滤、忽略规则、title 属性读取
- `settings.ts` — 设置接口 + 设置面板 UI
- `styles.css` — 所有样式
- `d3.d.ts` — D3 类型声明

## 已实现功能

### 视图
- Treemap 矩形树图，使用 D3 treemap 布局
- 支持按「大小」或「数量」两种模式显示
- 矩形上显示：名称（优先 frontmatter title）、大小、文件数（文件夹）
- Tooltip 悬浮信息
- 文件类型颜色区分：md(蓝)、图片(红)、pdf(黄)、zip(紫)、文件夹(绿)、其他(灰)

### 导航
- 面包屑路径导航（点击跳转）
- 返回上级按钮 ⬆️
- 点击文件夹矩形可钻入
- 深度控制 ➖/➕（展开/折叠层级）

### 工具栏（两行布局）
- 第一行：面包屑(居左) | 返回上级 | 刷新🔄 | 搜索过滤框(居右)
- 第二行：深度控制 | 模式切换(按大小/按数量) | 文件类型过滤(全部/md/图片/PDF)

### 搜索过滤
- 输入框实时过滤，匹配名称/路径的矩形正常显示，不匹配的降低透明度(0.15)

### 底部状态栏
- 显示当前层级汇总：项目数（文件夹+文件）、文件总计、总大小

### 设置面板
- 忽略文件夹（默认: Assets, assets, node_modules, .trash）
- 忽略文件类型（扩展名）
- 忽略路径模式（关键词匹配）
- 忽略隐藏文件（默认开启，忽略 . 开头）
- 默认计数规则（默认「按数量」）
- 显示名称属性（默认 "title"，读取 frontmatter）
- 点击打开文件（默认开启）
- 打开位置（新标签页/分屏/新窗口）

### 性能优化
- 5 分钟缓存（FileManager.cache）
- onOpen 时预热缓存
- ResizeObserver 动态适应窗口大小（200ms 防抖）
- 刷新按钮清除缓存并重新加载

### 布局
- 整体 flex 纵向布局（toolbar + chart + status-bar），无滚动条
- chart 区域 flex:1 自适应
- toolbar/status-bar flex-shrink:0 固定
- loading overlay 使用 prepend 不影响 DOM 顺序

### 清理
- onClose 时清除 tooltip DOM、ResizeObserver、resize timer

## 关键路径约定
- 根目录用 `'/'` 表示，其他路径使用 Obsidian 原生路径（不带前导 `/`）
- `renderChart()` 根据 currentPath 判断调用 `getVaultStructure()` 或 `getFolderAtPath()`
- `navigateTo()` 重建 toolbar + 重新 renderChart

## 已修复的 Bug
- treemap 数据绑定：用 `.sum()` 替代 `.each()` + 用 `root.leaves()` 获取带坐标的节点
- 路径不一致：面包屑生成的路径去掉前导 `/`
- filterByDepth 使用 `data.depth + currentDepth` 作为绝对深度
- markVisibleDepth 添加 null 防护
- tooltip 关闭视图时残留：onClose 中移除
- 按钮 active 状态用 class 而非 HTML 属性
- FileManager 改用 App 实例（而非 Vault）以正确访问 metadataCache
- changeMode 缩进修复、stray `});` 移除
