<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="TermNest">
</p>

<h1 align="center">TermNest</h1>

<p align="center">
  <strong>AI-native desktop workspace for terminal-first developers</strong>
</p>

<p align="center">
  <a href="https://github.com/flowxai/termnest/releases"><img src="https://img.shields.io/github/v/release/flowxai/termnest?style=flat-square&color=blue" alt="release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="platform">
  <img src="https://img.shields.io/badge/Tauri-v2-orange?style=flat-square" alt="tauri">
  <img src="https://img.shields.io/badge/React%2019-Rust-dea584?style=flat-square" alt="stack">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/flowxai/termnest?style=flat-square" alt="license"></a>
</p>

<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

---

One window. Multiple projects. All your Claude / Codex sessions. Split terminals. File editing. Git diffs. No Electron.

![Main Workspace](docs/screenshots/main.png)

## Why

When you're deep in an AI coding workflow, you don't need a full IDE — you need a **cockpit**:

- Terminals that stay alive, no context lost when switching windows
- One-click resume for yesterday's Claude Code or Codex conversation
- Split panes to watch an agent work while running tests next to it
- Quick edits without opening another editor
- Git status at a glance

These things are scattered across system terminals, editors, and browsers — constant window-switching all day. TermNest brings them together in a single native window built on Tauri v2 + Rust.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <strong>Settings</strong><br>
      <sub>Terminal appearance, fonts, proxy, shell config — all in one place</sub><br><br>
      <img src="docs/screenshots/settings.png" alt="Settings">
    </td>
    <td width="50%">
      <strong>Git Integration</strong><br>
      <sub>File tree status, diffs, commit history — without leaving the window</sub><br><br>
      <img src="docs/screenshots/git.png" alt="Git Integration">
    </td>
  </tr>
</table>

## Features

### Multi-project Workspace

Switch between repos instantly. Each project maintains its own tabs, split layout, and session history. Supports grouping, drag-to-reorder, and collapsing. No need for multiple windows to manage different repositories.

### Terminal-first

Tabbed terminals with recursive split panes. xterm.js v6 with WebGL-accelerated rendering and immediate PTY output — no artificial buffering delay. Terminal content survives layout changes. Supports tab renaming and status aggregation.

### AI Session Management

Auto-discovers local Claude Code and Codex session history. Resume any conversation with one click instead of digging through shell history. Pin, rename, sort by last active time, or delete records.

### Lightweight Editor

Click to open from the file tree. Multi-tab editing, `Cmd/Ctrl+S` to save. Tracks dirty state, detects external modifications. Editor fills the workspace when no terminal is open; coexists when one is. Good enough for quick fixes — not trying to be a full IDE.

### Git Integration

File tree annotates working-tree status directly. View diffs, commit history, and per-commit file changes. Multi-repo auto-discovery. No need to switch to a separate Git client.

### Proxy Configuration

Global proxy defaults with per-project overrides. Only affects terminals inside TermNest — never touches your system Terminal or iTerm.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Tauri v2 (Rust)                                     │
│                                                      │
│  pty.rs            PTY lifecycle, immediate I/O      │
│  ai_sessions.rs    Claude / Codex session discovery  │
│  process_monitor   AI process state detection        │
│  fs.rs             Directory listing + file watcher  │
│  git.rs            libgit2 bindings                  │
│  config.rs         Persistent config + proxy         │
├──────────────────────────────────────────────────────┤
│  React 19 + TypeScript                               │
│                                                      │
│  Zustand           Global state management           │
│  xterm.js v6       WebGL-accelerated terminals       │
│  Allotment         Resizable three-column layout     │
│  SplitNode         Recursive binary split tree       │
├──────────────────────────────────────────────────────┤
│  Data Flow                                           │
│                                                      │
│  Keypress → xterm → write_pty → PTY                 │
│  PTY → immediate flush → pty-output → xterm         │
│  Process monitor → pty-status-change → status dots  │
│  File change → fs-change → file tree refresh        │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Download

Go to [Releases](https://github.com/flowxai/termnest/releases) for the latest build.

### Build from Source

```bash
# Prerequisites: Node.js >= 18, Rust >= 1.70, Tauri v2 CLI
git clone https://github.com/flowxai/termnest.git
cd termnest
npm install
npm run tauri dev      # development
npm run tauri build    # production bundle
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 + Rust |
| Frontend | React 19, TypeScript, Zustand, Tailwind CSS v4, Vite |
| Terminal | xterm.js v6 + WebGL addon, portable-pty |
| Git | libgit2 (git2-rs) |
| File watch | notify + ignore |
| Layout | Allotment + recursive SplitNode tree |

## Non-goals

TermNest is not a full IDE, not a Git client, not a Monaco code editor. It's a **workspace** — one view to manage your AI agents, terminals, and projects.

## License

[MIT](LICENSE)
