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
  <a href="LICENSE"><img src="https://img.shields.io/github/license/flowxai/termnest?style=flat-square" alt="license"></a>
</p>

<p align="center">
  简体中文 | <a href="README.en.md">English</a>
</p>

---

一个窗口。多个项目。所有 Claude / Codex 会话。分屏终端。文件编辑。Git diff。没有 Electron。

![主工作台](docs/screenshots/main.png)

## 为什么做这个

AI 编码的日常不需要完整 IDE，需要的是一个**驾驶舱**：

- 能长期挂着的终端，不因切窗口而丢失上下文
- 一键恢复昨天的 Claude Code 或 Codex 对话
- 分屏看 agent 干活，同时在旁边跑测试
- 随手改几行代码，不用打开另一个编辑器
- 扫一眼就知道仓库改了什么

这些事散落在系统终端、编辑器、浏览器之间，每天在窗口间反复跳转。TermNest 把它们收进一个基于 Tauri v2 + Rust 构建的原生窗口里。

## 界面预览

<table>
  <tr>
    <td width="50%">
      <strong>设置面板</strong><br>
      <sub>终端外观、字体、代理、Shell，一处搞定</sub><br><br>
      <img src="docs/screenshots/settings.png" alt="设置面板">
    </td>
    <td width="50%">
      <strong>Git 集成</strong><br>
      <sub>文件树状态、diff、提交历史，不用离开窗口</sub><br><br>
      <img src="docs/screenshots/git.png" alt="Git 集成">
    </td>
  </tr>
</table>

## 核心能力

### 多项目工作台

项目间即时切换。每个项目独立维护标签页、分屏布局和会话历史。支持分组、拖拽排序、折叠。不用开多个窗口来管理不同仓库。

### 终端优先

多标签 + 递归分屏。xterm.js v6 渲染，PTY 自适应输出（按键即时响应，突发数据智能合并），平滑滚动。终端内容在布局切换时不丢失，支持标题重命名和状态聚合。

### AI 会话管理

自动发现本机 Claude Code 和 Codex 的历史会话。一键恢复任意对话，不用去翻命令行历史。自动处理终端环境兼容性（包括 Codex TUI 的颜色和尺寸适配）。支持置顶、别名、按活跃时间排序、删除记录。

### 轻量编辑器

文件树点击即开，多标签，`Cmd/Ctrl+S` 保存。追踪脏状态，检测外部修改。没有终端时编辑器铺满工作区，有终端时两者共存。够用就好，不追求 IDE 级编辑能力。

### Git 集成

文件树直接标注工作区状态。查看 diff、提交历史、逐提交文件变更，多仓库自动发现。不用切到另一个 Git 客户端。

### UI 风格系统

7 种视觉风格可选：经典、专业工具、终端工作台、现代产品、任务控制、编辑室、多巴胺脉冲。每种风格独立调校了配色、圆角、阴影、终端色板。支持亮/暗主题切换，终端可选跟随或独立主题。

### 代理配置

全局代理默认值 + 项目级覆盖。仅对 TermNest 内的终端生效，不影响系统 Terminal 或 iTerm。

## 架构

```
┌──────────────────────────────────────────────────────┐
│  Tauri v2 (Rust)                                     │
│                                                      │
│  pty.rs            PTY 生命周期，自适应 I/O           │
│  ai_sessions.rs    Claude / Codex 会话发现            │
│  process_monitor   AI 进程状态检测                    │
│  fs.rs             目录列表 + 文件监听                │
│  git.rs            libgit2 绑定                      │
│  config.rs         持久化配置 + 代理解析              │
├──────────────────────────────────────────────────────┤
│  React 19 + TypeScript                               │
│                                                      │
│  Zustand           全局状态管理                       │
│  xterm.js v6       终端渲染 + 平滑滚动                │
│  Allotment         三栏可拖拽布局                     │
│  SplitNode         递归二叉分屏树                     │
├──────────────────────────────────────────────────────┤
│  数据流                                              │
│                                                      │
│  按键 → xterm → write_pty → PTY                     │
│  PTY → 自适应 flush → pty-output → xterm            │
│  进程监控 → pty-status-change → 状态指示             │
│  文件变化 → fs-change → 文件树刷新                   │
└──────────────────────────────────────────────────────┘
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
| 前端 | React 19, TypeScript, Zustand, Tailwind CSS v4, Vite |
| 终端 | xterm.js v6, portable-pty |
| Git | libgit2 (git2-rs) |
| 文件监听 | notify + ignore |
| 布局 | Allotment + 递归 SplitNode 树 |

## 不做什么

TermNest 不是完整 IDE，不是 Git 客户端，不是 Monaco 代码编辑器。它是一个**工作台**——在一个视图里管理 AI agent、终端和项目。

## License

[MIT](LICENSE)
