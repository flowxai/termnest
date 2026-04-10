<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="TermNest">
</p>

<h1 align="center">TermNest</h1>

<p align="center">
  <strong>终端优先的 AI 原生桌面工作台</strong><br>
  <sub>AI-native desktop workspace for terminal-first developers</sub>
</p>

<p align="center">
  <a href="https://github.com/flowxai/termnest/releases"><img src="https://img.shields.io/github/v/release/flowxai/termnest?style=flat-square&color=blue" alt="release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="platform">
  <img src="https://img.shields.io/badge/Tauri-v2-orange?style=flat-square" alt="tauri">
  <img src="https://img.shields.io/badge/React%2019-Rust-dea584?style=flat-square" alt="stack">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/flowxai/termnest?style=flat-square" alt="license"></a>
</p>

---

> 一个窗口。多个项目。所有 Claude / Codex 会话。分屏终端。文件编辑。Git diff。没有 Electron。
>
> One window. Multiple projects. All your Claude / Codex sessions. Split terminals. File editing. Git diffs. No Electron.

---

## 为什么做这个 / Why

AI 编码工作流里，你真正需要的不是完整 IDE，而是一个**驾驶舱**：

In an AI coding workflow, you don't need a full IDE — you need a **cockpit**:

- 能长期挂着的终端 / Terminals that stay alive across sessions
- 一键恢复 Claude Code 和 Codex 对话 / One-click resume for AI conversations
- 分屏看 agent 工作的同时跑测试 / Split panes to watch agents while running tests
- 随手改文件不用切窗口 / Quick file edits without leaving the window
- 扫一眼就知道仓库改了什么 / Git status at a glance

TermNest 把这些事放进一个基于 Tauri v2 + Rust 的原生窗口里。

TermNest puts all of this in a single, fast, native window built on Tauri v2 + Rust.

---

## 界面预览 / Screenshots

### 主工作台 / Main Workspace

左栏管理项目和 AI 会话，中栏浏览文件树，右栏是终端和编辑器的主战场。

Left panel for projects and AI sessions, center for file tree, right side for terminals and editor.

![主工作台 / Main Workspace](docs/screenshots/main.png)

### 设置面板 / Settings

终端外观、字体、代理配置、Shell 管理，一处搞定。支持全局代理默认值和项目级覆盖。

Terminal appearance, fonts, proxy settings, and shell management in one place. Supports global proxy defaults with per-project overrides.

![设置面板 / Settings](docs/screenshots/settings.png)

### Git 集成 / Git Integration

文件树直接显示工作区状态，查看 diff、提交历史和逐提交文件变更。

File tree shows working-tree status. View diffs, commit history, and per-commit file changes.

![Git 集成 / Git Integration](docs/screenshots/git.png)

---

## 核心能力 / Features

### 多项目工作台 / Multi-project Workspace

项目间即时切换，每个项目独立维护自己的标签页、分屏布局和会话历史。支持项目分组、拖拽排序和折叠。

Switch between repos instantly. Each project maintains its own tabs, split layout, and session history. Supports project grouping, drag-to-reorder, and collapsing.

### 终端优先 / Terminal-first

多标签终端 + 递归分屏，xterm.js v6 WebGL 加速渲染，PTY 零延迟输出。终端内容在切换布局时不丢失。支持终端标题重命名和状态聚合。

Tabbed terminals with recursive split panes. xterm.js v6 with WebGL-accelerated rendering and zero-latency PTY I/O. Terminal content survives layout changes. Supports tab renaming and status aggregation.

### AI 会话管理 / AI Session Management

自动发现本机 Claude Code 和 Codex 的历史会话，一键恢复任意对话。支持会话置顶、本地别名、按最后活跃时间排序、删除原始记录。

Auto-discovers local Claude Code and Codex sessions. Resume any conversation with one click. Pin, rename, sort by last active time, or delete session records.

### 轻量编辑器 / Lightweight Editor

文件树点击即开，多标签编辑，`Cmd/Ctrl+S` 保存。脏状态追踪，外部修改检测。无终端时编辑器独占工作区，有终端时二者共存。

Click to open from file tree, edit across tabs, `Cmd/Ctrl+S` to save. Dirty state tracking and external modification detection. Editor fills the workspace when no terminal is open; coexists when one is.

### Git 集成 / Git Integration

文件树显示 Git 工作区状态。支持查看 diff、提交历史、逐提交文件变更。多仓库自动发现。

File tree shows Git working-tree status. View diffs, commit history, and per-commit file changes. Multi-repo auto-discovery.

### 代理配置 / Proxy Configuration

全局代理默认值 + 项目级覆盖。仅对 TermNest 内终端生效，不污染系统 Terminal 或 iTerm。

Global proxy defaults with per-project overrides. Only affects terminals inside TermNest — never touches your system Terminal or iTerm.

---

## 架构 / Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri v2 (Rust backend)                                    │
│                                                             │
│  pty.rs             PTY 生命周期 / 零延迟 I/O                │
│                     PTY lifecycle / zero-latency I/O        │
│  ai_sessions.rs     Claude / Codex 会话发现                  │
│                     AI session discovery                    │
│  process_monitor.rs AI 进程状态检测                           │
│                     AI process state detection              │
│  fs.rs              目录列表 + 文件监听                       │
│                     Directory listing + file watcher        │
│  git.rs             libgit2 绑定                             │
│                     libgit2 bindings                        │
│  config.rs          持久化配置 + 代理解析                      │
│                     Persistent config + proxy resolution    │
├─────────────────────────────────────────────────────────────┤
│  React 19 + TypeScript (frontend)                           │
│                                                             │
│  Zustand            全局单一 store / global state            │
│  xterm.js v6        WebGL 渲染终端 / GPU-rendered terminals  │
│  Allotment          三栏可拖拽布局 / resizable columns        │
│  SplitNode          递归二叉分屏树 / recursive split tree     │
├─────────────────────────────────────────────────────────────┤
│  数据流 / Data Flow                                          │
│                                                             │
│  按键 → xterm → write_pty → PTY                              │
│  Keypress → xterm → write_pty → PTY                         │
│                                                             │
│  PTY 输出 → 即时 flush → pty-output event → xterm            │
│  PTY output → immediate flush → pty-output event → xterm    │
│                                                             │
│  进程监控 → pty-status-change → 状态指示                      │
│  Process monitor → pty-status-change → status indicators    │
│                                                             │
│  文件变化 → fs-change → 文件树刷新                             │
│  File change → fs-change → file tree refresh                │
└─────────────────────────────────────────────────────────────┘
```

---

## 快速开始 / Quick Start

### 下载 / Download

前往 [Releases](https://github.com/flowxai/termnest/releases) 下载最新版本。

Go to [Releases](https://github.com/flowxai/termnest/releases) for the latest build.

### 从源码构建 / Build from Source

```bash
# 前置条件 / Prerequisites:
# Node.js >= 18, Rust >= 1.70, Tauri v2 CLI

git clone https://github.com/flowxai/termnest.git
cd termnest
npm install

npm run tauri dev      # 开发环境 / development
npm run tauri build    # 生产构建 / production bundle
```

---

## 技术栈 / Tech Stack

| 层 / Layer | 技术 / Technology |
|---|------|
| 框架 / Framework | Tauri v2 + Rust |
| 前端 / Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4, Vite |
| 终端 / Terminal | xterm.js v6 + WebGL addon, portable-pty |
| Git | libgit2 (git2-rs) |
| 文件监听 / File watch | notify + ignore |
| 布局 / Layout | Allotment + recursive SplitNode tree |

---

## 不做什么 / Non-goals

TermNest 不是完整 IDE，不是 Git 客户端，不是 Monaco 代码编辑器。它是一个**工作台** — 在一个视图里管理你的 AI agent、终端和项目。

TermNest is not a full IDE, not a Git client, not a Monaco code editor. It's a **workspace** — one view to manage your AI agents, terminals, and projects.

---

## License

[MIT](LICENSE)
