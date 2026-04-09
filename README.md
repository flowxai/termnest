<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="TermNest Logo">
</p>

<h1 align="center">TermNest</h1>

<p align="center">
  面向 AI 编码工作流的桌面工作台
</p>

<p align="center">
  Tauri v2 · 项目管理 · 会话恢复 · 终端分屏 · 轻量编辑器
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.9-blue" alt="version">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="platform">
  <img src="https://img.shields.io/badge/Tauri-v2-orange" alt="tauri">
  <img src="https://img.shields.io/badge/React-19-61dafb" alt="react">
  <img src="https://img.shields.io/badge/Rust-2021-dea584" alt="rust">
</p>

---

## 简介

`TermNest` 不是传统 IDE，也不只是系统终端的桌面壳。

它的目标很明确：把 AI 编码过程中最常用的几个环节放进同一个窗口里：

- 项目切换
- AI 会话恢复
- 多终端管理
- 分屏协作
- 轻量文件编辑
- Git 查看

如果你的日常工作流是同时开多个项目、多个 `Claude Code` / `Codex` 会话，再配合终端与少量代码编辑，那么 `TermNest` 会比“系统终端 + 编辑器 + 一堆窗口”更顺。

## 为什么做这个

在 AI 编码工作流里，很多人真正高频使用的不是完整 IDE，而是：

- 一个能长期挂着的终端
- 能快速切换项目的工作区
- 能续接上一次 AI 会话的入口
- 能随手改几个文件并保存的编辑器
- 能看到当前仓库改了什么的 Git 面板

传统 IDE 往往太重，系统终端又太散。  
`TermNest` 想解决的就是这个中间地带。

## 核心能力

### 1. 项目工作台

- 左侧统一管理多个项目
- 支持项目分组、拖拽排序和折叠
- 在同一个窗口里切换不同仓库和会话上下文

### 2. 终端优先

- 顶层 terminal tabs
- 递归分屏
- 终端标题重命名
- 终端状态聚合
- 终端内容缓存，切换布局不丢屏幕内容

### 3. AI Sessions

- 自动读取本机 `Claude` / `Codex` 会话
- 单击直接恢复会话
- 本地别名
- 本地置顶
- 按最后活跃时间排序
- 删除原始会话记录

### 4. 轻量编辑器

- 文件树单击直接打开
- 多文件标签
- 脏状态提示
- `Cmd/Ctrl + S` 保存
- 外部文件修改检测
- 无终端时编辑器独占，有终端时与终端共存

### 5. Git 面板

- 文件树显示 Git 状态
- 工作区 Diff
- 提交历史
- 提交文件 Diff
- 多仓库发现

### 6. 环境与配置

- 多 Shell 配置
- 全局代理 + 项目级代理覆盖
- 主题切换
- 布局持久化
- 版本检查

## 界面预览

### 主工作台

![主界面](docs/screenshots/main.png)

### 设置

![设置界面](docs/screenshots/settings.png)

### Git 与工作区

![Git 与工作区](docs/screenshots/git.png)

## 当前定位

`TermNest` 现在的定位是：

- 一个已经可用的 AI-first 桌面工作台
- 一个终端优先的轻量开发环境
- 一个比系统终端更适合恢复 AI 会话的入口

它**不是**：

- 传统大而全 IDE
- 完整 Git 客户端
- Monaco 级重型代码编辑器

## 已知限制

当前有几件事是刻意保持诚实的：

- 内嵌终端对不同版本 `Codex` 的 TUI 兼容性仍可能波动
- Git `pull/push` 目前还是轻封装，不是完整交互式流程
- 编辑器适合轻量修改，不追求完整 IDE 能力

如果你的主要工作流是 `Claude Code + 多终端 + 会话恢复 + 轻量编辑`，它已经比较适合。  
如果你想要的是完整 IDE 级代码理解、调试、重构与语言服务，那它不是替代品。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Tauri v2 |
| 前端 | React 19 + TypeScript + Zustand + Tailwind CSS v4 + Vite 7 |
| 终端 | xterm.js v6 |
| 布局 | Allotment |
| PTY | portable-pty |
| Git | git2 |
| 文件监听 | notify + ignore |
| 后端 | Rust |

## 快速开始

### 下载发行版

前往 [Releases](https://github.com/flowxai/termnest/releases) 下载最新版本。

### 从源码运行

#### 前置条件

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.70
- [Tauri v2 CLI](https://v2.tauri.app/start/prerequisites/)

#### 安装依赖

```bash
git clone https://github.com/flowxai/termnest.git
cd termnest
npm install
```

#### 启动开发环境

```bash
npm run tauri dev
```

#### 构建发布包

```bash
npm run tauri build
```

## 使用方式

一个典型流程通常是：

1. 在左侧添加项目
2. 打开一个或多个终端
3. 从 `Sessions` 面板恢复已有 `Claude` / `Codex` 会话
4. 在中间文件树中打开文件并做轻量修改
5. 在下方 Git 面板查看改动和提交历史

这套交互的重点不是“做所有事”，而是把高频动作放到一个稳定窗口里。

## 项目结构

```text
termnest/
├── src/
│   ├── App.tsx
│   ├── store.ts
│   ├── types.ts
│   ├── styles.css
│   ├── components/
│   │   ├── ProjectList.tsx
│   │   ├── SessionList.tsx
│   │   ├── FileTree.tsx
│   │   ├── WorkspaceArea.tsx
│   │   ├── TerminalArea.tsx
│   │   ├── SplitLayout.tsx
│   │   ├── PaneGroup.tsx
│   │   ├── TerminalInstance.tsx
│   │   ├── EditorTabs.tsx
│   │   ├── EditorPane.tsx
│   │   ├── GitHistory.tsx
│   │   ├── SettingsModal.tsx
│   │   └── NotificationCenter.tsx
│   └── utils/
│       ├── terminalCache.ts
│       ├── ptyWriteQueue.ts
│       ├── themeManager.ts
│       └── updateChecker.ts
├── src-tauri/
│   └── src/
│       ├── lib.rs
│       ├── pty.rs
│       ├── ai_sessions.rs
│       ├── config.rs
│       ├── fs.rs
│       ├── git.rs
│       └── process_monitor.rs
├── docs/
│   └── screenshots/
└── README.md
```

## 架构概览

```text
App
├── 左栏：项目列表 + Sessions
├── 中栏：文件树 + Git 历史
└── 右栏：Workspace
    ├── 编辑器区域
    └── 终端区域（tabs + split tree）
```

核心数据流：

```text
用户输入 -> xterm -> write_pty -> Rust PTY
PTY 输出 -> backlog/attach -> pty-output -> xterm
进程监控 -> pty-status-change -> 状态点/标签聚合
文件变化 -> fs-change -> 文件树与编辑器刷新
```

## 开发建议

推荐环境：

- VS Code
- Tauri VS Code 插件
- rust-analyzer

常用命令：

```bash
npm run tauri dev
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

## 仓库

- GitHub: [flowxai/termnest](https://github.com/flowxai/termnest)
