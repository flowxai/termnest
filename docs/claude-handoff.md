# Claude 接手说明

更新时间：2026-04-09

## 项目现状

这个项目已经从原始 `mini-term` fork 成了自己的版本：

- 名称：`TermNest`
- 仓库：`https://github.com/flowxai/termnest`
- bundle id：`ai.flowx.termnest`
- 当前版本：`1.0.8`

本地桌面包位置：

- `/Applications/TermNest.app`

项目目录：

- `/Users/yskj/mini-term`

## 项目目标

目标不是传统 IDE，而是：

- AI-first 的轻量桌面工作台
- 终端优先
- 同时支持：
  - 多项目
  - Claude/Codex sessions
  - 轻量文件编辑
  - Git 视图

## 已完成的主要改造

### 1. 产品身份

已完成：

- 项目更名为 `TermNest`
- Tauri 应用名、窗口标题、版本号、bundle id 已改
- README / 更新检查 / 仓库远端文案已改

### 2. 终端工作区

已完成：

- 多项目终端
- 顶层 terminal tabs
- pane 分屏
- 单 pane 悬浮操作
- 终端标题重命名
- 终端关闭确认
  - 普通 shell 直接关
  - AI 会话才确认

### 3. 文件编辑器

已完成：

- 右侧工作区编辑器
- 多文件标签
- `Cmd/Ctrl+S`
- 脏状态
- 外部修改检测
- 无终端时编辑器独占
- 有终端时编辑器/终端共存

### 4. Sessions

已完成：

- 自动识别 `Claude` / `Codex`
- 单击恢复
- 本地别名
- 本地置顶
- 按最后活跃时间排序
- 删除原始会话记录

### 5. 代理

已完成：

- 全局代理默认值
- 项目级覆盖
- 仅对 TermNest 内新开的终端生效
- 不污染系统 Terminal / iTerm

### 6. 交互和稳定性

已完成：

- 通知 toast
- 新建终端失败有提示
- prompt/confirm 监听泄漏已修
- 配置迁移
- 主题 key 迁移
- 旧 bundle id 配置迁移

## 当前关键文件

前端：

- `src/App.tsx`
- `src/store.ts`
- `src/components/WorkspaceArea.tsx`
- `src/components/TerminalArea.tsx`
- `src/components/PaneGroup.tsx`
- `src/components/SessionList.tsx`
- `src/components/EditorPane.tsx`
- `src/components/NotificationCenter.tsx`
- `src/utils/terminalCache.ts`
- `src/utils/ptyWriteQueue.ts`

后端：

- `src-tauri/src/pty.rs`
- `src-tauri/src/ai_sessions.rs`
- `src-tauri/src/config.rs`
- `src-tauri/src/fs.rs`
- `src-tauri/src/lib.rs`

## 已确认正常的部分

### Claude Code

`Claude Code` 在 TermNest 内基本正常：

- 恢复会话可用
- 颜色正常
- 工具调用区正常
- TUI 显示基本正常

当前恢复命令是：

```bash
claude --resume <session-id> --dangerously-skip-permissions --teammate-mode tmux
```

### 普通 shell

普通 `zsh/bash` 终端可用，分屏、关闭、重命名、代理都正常。

## 当前未解决的核心问题

### Codex 内嵌终端渲染异常

`Codex` 在系统 Terminal.app 中是正常的，但在 TermNest 内嵌终端里异常。

现象：

- 没有颜色
- 没有工具调用区
- 显示明显退化
- 和系统终端相比像“弱终端模式”

对照事实：

- 同机同版本 `codex-cli 0.118.0`
- 系统 Terminal 里正常
- TermNest 里异常
- `Claude Code` 在同一个 TermNest 里正常

这说明问题大概率不在：

- session 恢复命令
- 代理
- PTY 是否创建成功
- 会话文件本身

更像在：

- `Codex CLI` TUI 对嵌入式终端的兼容性
- 或当前 `xterm.js` 方案对 `Codex` 的支持不足

## 已尝试过但无效的修复

下面这些都已经做过，但仍没解决 `Codex`：

1. 启动期 backlog 回放

- 后端在前端 attach 前缓存 PTY 输出
- attach 后回放 backlog

涉及：

- `src-tauri/src/pty.rs`
- `src/utils/terminalCache.ts`

2. data / binary 双通道回写

- `xterm` 的 `onData`
- `xterm` 的 `onBinary`

都已写回 PTY

3. 延后发送恢复命令

- 终端挂载和 resize 后再发送 `codex resume ...`

4. 补齐终端环境变量

已补：

- `TERM=xterm-256color`
- `COLORTERM=truecolor`
- `TERM_PROGRAM=TermNest`
- `TERM_PROGRAM_VERSION`
- UTF-8 locale 变量

5. 去掉 WebGL

- 已关闭 WebGL 渲染
- 改回 xterm 默认渲染器

6. 禁用同步输出模式 `DECSET 2026`

- 直接在 parser 层拦掉 `?2026h` / `?2026l`

即便如此，`Codex` 仍然不正常。

## 当前判断

当前最合理的判断是：

`Codex CLI` 的 TUI 与当前这套嵌入式 `xterm.js` 终端实现不兼容，至少和 `Claude Code` 相比明显更挑终端能力。继续在现有方案上补小洞，收益已经很低。

## 推荐的下一步方案

### 推荐方案 A：Claude 内嵌，Codex 外部终端

建议：

- `Claude` 继续内嵌在 TermNest 中恢复
- `Codex` 改成从 TermNest 里点击后，直接在系统 Terminal / iTerm 中恢复

理由：

- 最稳
- 可立即可用
- 不再陷入 `Codex TUI` 兼容性黑洞

大致实现方向：

- SessionList 点击 `Codex` 时不再走 `createTerminalTab`
- 改为调用系统终端执行：

```bash
codex resume <session-id>
```

### 方案 B：继续强攻内嵌 Codex

如果坚持内嵌，需要重新评估：

- 是否继续使用当前 `xterm.js`
- 是否要升级 / 更换终端实现
- 是否要针对 `Codex` 单独做兼容终端层

这条路成本高，而且当前没有明确的短路径。

## 当前版本演进记录

- `1.0.0`：正式改名为 TermNest
- `1.0.1`：terminal tab 关闭能力修复
- `1.0.2`：通知系统、错误提示、prompt 修复
- `1.0.3`：单终端可见 tab/header、预热终端实例
- `1.0.4`：补 terminal identity / locale，延后初始命令发送
- `1.0.5`：后端 backlog + attach 回放
- `1.0.6`：补 `onBinary` → PTY
- `1.0.7`：移除 WebGL
- `1.0.8`：禁用 `DECSET 2026` synchronized output

## 构建与验证命令

### 前端单测

```bash
cd /Users/yskj/mini-term
npm run test:unit
```

### 前端构建

```bash
cd /Users/yskj/mini-term
npm run build
```

### Rust 测试

```bash
cd /Users/yskj/mini-term/src-tauri
source ~/.cargo/env
cargo test
```

### 打包 app

```bash
cd /Users/yskj/mini-term
source ~/.cargo/env
npm run tauri build
```

### 安装本地 app

```bash
rm -rf '/Applications/TermNest.app'
ditto '/Users/yskj/mini-term/src-tauri/target/release/bundle/macos/TermNest.app' '/Applications/TermNest.app'
codesign --force --deep --sign 'Apple Development: 8617315609907 (K6T79U8T3U)' '/Applications/TermNest.app'
open '/Applications/TermNest.app'
```

## 建议 Claude 优先做的事

1. 不要先继续小修 `Codex` TUI 渲染
2. 先评估“Codex 外部终端恢复”是否更合理
3. 如果仍要内嵌，再决定是否更换终端实现
4. 保持 `Claude Code` 当前链路不要被破坏

## 相关文档

- `docs/project-status.md`
- `docs/macos-release.md`
