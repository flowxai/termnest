<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="TermNest">
</p>

<h1 align="center">TermNest</h1>

<p align="center">
  <strong>终端优先的 AI 原生桌面工作台</strong>
</p>

<p align="center">
  <a href="https://github.com/flowxai/termnest/releases"><img src="https://img.shields.io/github/v/release/flowxai/termnest?style=flat-square&color=blue" alt="release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="platform">
  <img src="https://img.shields.io/badge/Tauri-v2-orange?style=flat-square" alt="tauri">
  <img src="https://img.shields.io/badge/React%2019-Rust-dea584?style=flat-square" alt="stack">
</p>

---

一个窗口。多个项目。所有 Claude / Codex 会话。分屏终端。文件编辑。Git diff。没有 Electron。

![main](docs/screenshots/main.png)

## 为什么做这个

AI 编码工作流里，你真正需要的不是完整 IDE，而是一个**驾驶舱**：

- 能长期挂着的终端
- 一键恢复 Claude Code 和 Codex 对话
- 分屏看 agent 工作的同时跑测试
- 随手改文件不用切窗口
- 扫一眼就知道仓库改了什么

TermNest 把这些事放进一个基于 Tauri v2 + Rust 的原生窗口里。

## 核心能力

**多项目工作台** — 项目间即时切换，每个项目独立维护自己的标签页、分屏布局和会话历史。

**终端优先** — 多标签 + 递归分屏，xterm.js v6 WebGL 加速渲染，PTY 零延迟输出。

**AI 会话管理** — 自动发现本机 Claude Code 和 Codex 会话记录，一键恢复任意对话。支持置顶、别名、按项目隔离。

**轻量编辑器** — 文件树点击打开，多标签编辑，`Cmd+S` 保存，脏状态追踪，外部修改检测。无终端时独占工作区，有终端时共存。

**Git 集成** — 文件树显示工作区状态，查看 diff、提交历史、逐提交文件变更，不用离开窗口。

**代理配置** — 全局代理默认值 + 项目级覆盖。仅对 TermNest 内终端生效，不污染系统终端。

![settings](docs/screenshots/settings.png)

## 架构

```
┌─────────────────────────────────────────────────────────┐
│ Tauri v2 (Rust)                                         │
│  ├─ pty.rs           PTY 生命周期，零延迟 I/O            │
│  ├─ ai_sessions      Claude / Codex 会话发现             │
│  ├─ process_monitor   AI 进程状态检测                    │
│  ├─ fs.rs            目录列表 + 文件监听                  │
│  ├─ git.rs           libgit2 绑定                       │
│  └─ config.rs        持久化配置 + 代理解析                │
├─────────────────────────────────────────────────────────┤
│ React 19 + TypeScript                                   │
│  ├─ Zustand          全局单一 store                      │
│  ├─ xterm.js v6      WebGL 渲染终端实例                   │
│  ├─ Allotment        三栏可拖拽布局                       │
│  └─ SplitNode        递归二叉分屏树                       │
├─────────────────────────────────────────────────────────┤
│ 数据流                                                   │
│  按键 → xterm → write_pty → PTY                         │
│  PTY 输出 → 即时 flush → pty-output → xterm              │
│  进程监控 → pty-status-change → 状态指示                  │
│  文件变化 → fs-change → 文件树刷新                        │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

### 下载

前往 [Releases](https://github.com/flowxai/termnest/releases) 下载最新版本。

### 从源码构建

```bash
# 前置条件：Node.js >= 18, Rust >= 1.70, Tauri v2 CLI
git clone https://github.com/flowxai/termnest.git
cd termnest
npm install
npm run tauri dev      # 开发环境
npm run tauri build    # 生产构建
```

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Tauri v2 + Rust |
| 前端 | React 19、TypeScript、Zustand、Tailwind CSS v4、Vite |
| 终端 | xterm.js v6 + WebGL addon、portable-pty |
| Git | libgit2 (git2-rs) |
| 文件监听 | notify + ignore |
| 布局 | Allotment + 递归 SplitNode 树 |

## 不做什么

TermNest 不是完整 IDE，不是 Git 客户端，不是 Monaco 代码编辑器。它是一个**工作台** — 在一个视图里管理你的 AI agent、终端和项目。

## License

MIT
