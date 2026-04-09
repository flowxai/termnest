# TermNest 项目说明与当前进度

更新时间：2026-04-09

## 1. 项目定位

`TermNest` 是基于原仓库 `dreamlonglll/mini-term` fork 出来的桌面应用，目标不再是“轻量终端壳”，而是：

- 更接近轻量 IDE 的 AI-first 工作台
- 以终端、Claude/Codex 会话恢复、文件编辑为核心
- 保留终端优先的交互，不做成传统大而全 IDE

当前技术栈：

- 前端：React + Zustand + xterm.js + Allotment
- 后端：Tauri v2 + Rust + portable_pty
- 平台：当前主要在 macOS 上开发与打包

## 2. 当前版本

当前代码版本：

- `1.0.2`

版本号位置：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

当前 macOS 应用：

- `/Applications/TermNest.app`

## 3. 已完成的主要改造

### 3.1 品牌与项目身份

已从原始 `mini-term` 改为 `TermNest`：

- App 名
- Tauri `bundle identifier`
- GitHub 仓库地址
- 窗口标题
- README / 文案 / 更新检查目标仓库

当前标识：

- 仓库：`https://github.com/flowxai/termnest`
- bundle id：`ai.flowx.termnest`

### 3.2 终端能力

已完成：

- 多项目终端管理
- 顶层 terminal tab
- pane 分屏
- 终端标题重命名
- 终端状态点显示
- 代理环境变量按项目/全局注入
- Claude 恢复命令自动追加：
  - `--dangerously-skip-permissions`
  - `--teammate-mode tmux`

已做的稳定性修复：

- 关闭普通 `zsh/bash` 不再弹确认
- 关闭 AI 会话时才确认
- 修复“关闭终端后又回退到已关闭 tab”的问题
- 终端创建失败时增加全局 toast 提示

### 3.3 文件编辑器

已完成：

- 右侧工作区支持文件编辑
- 多文件标签
- 脏状态提示
- `Cmd/Ctrl + S` 保存
- 外部文件修改检测
- 无终端时编辑器独占
- 有终端 + 有编辑器时双栏布局

当前定位：

- 这是轻量编辑器，不是 Monaco 式完整代码编辑器
- 第一目标是补齐 AI 工作流闭环，而不是语法高亮花样

### 3.4 Sessions

已完成：

- 自动识别 `Claude` / `Codex`
- 单击直接恢复会话
- 本地别名重命名
- 本地置顶
- 按“最后活跃时间”排序
- 右键删除原始会话记录

删除逻辑：

- Claude：删除主会话文件及同名子目录
- Codex：删除 session 文件，并清理索引

### 3.5 配置与兼容

已完成：

- 旧配置目录迁移到新 bundle id
- 主题存储 key 从旧值迁移到新值
- Shell 配置空值时做默认回填

### 3.6 提示与交互反馈

已完成：

- 新增全局 `NotificationCenter`
- 新建终端 / 分屏 / 写入命令失败时不再静默
- `showConfirm` 的全局 `keydown` 监听泄漏已修复

## 4. 当前架构概览

### 前端关键文件

- `src/App.tsx`
  - 整体布局、配置加载、版本检查、窗口关闭处理
- `src/store.ts`
  - 全局状态中心，项目、终端、编辑器、通知都在这里
- `src/components/WorkspaceArea.tsx`
  - 右侧工作区容器，控制编辑器和终端共存逻辑
- `src/components/TerminalArea.tsx`
  - 顶层 terminal tab 与 split layout
- `src/components/PaneGroup.tsx`
  - 单个 pane 组的标题条、关闭、新建、分屏
- `src/components/SessionList.tsx`
  - Claude/Codex 会话列表、恢复、别名、置顶、删除
- `src/components/EditorPane.tsx`
  - 文本编辑、保存、重载、外部修改处理
- `src/components/NotificationCenter.tsx`
  - 全局错误/提示反馈
- `src/utils/terminalCache.ts`
  - xterm 实例缓存
- `src/utils/ptyWriteQueue.ts`
  - PTY 写入串行化

### 后端关键文件

- `src-tauri/src/pty.rs`
  - PTY 创建、读写、AI 会话检测、代理环境变量注入
- `src-tauri/src/ai_sessions.rs`
  - Claude/Codex 会话扫描、排序时间、删除逻辑
- `src-tauri/src/config.rs`
  - 配置读写、旧配置迁移
- `src-tauri/src/fs.rs`
  - 文件读取、写入、元信息、监听
- `src-tauri/src/lib.rs`
  - Tauri command 注册入口

## 5. 当前未完全收口的问题

下面这些是当前最值得继续做的，不要假装已经“完成”。

### P0

- 单终端时的标题栏 / tab 体验还不稳定
  - 用户当前反馈：只有一个终端时没有想要的 tab 感
  - 这块在 `TerminalArea.tsx` 与 `PaneGroup.tsx` 的层级上还需要继续收

- Claude / Codex 会话输出疑似有首屏或部分内容丢失
  - 用户反馈：和普通终端相比，AI 对话内容不完整
  - 高概率位置在 `PTY 输出事件 -> xterm 挂载` 这段
  - 当前怀疑点：终端挂载前输出未被完整缓存
  - 下一步建议：在 `src-tauri/src/pty.rs` 增加 attach/backlog 机制，再配合 `src/utils/terminalCache.ts` 做前端回放

### P1

- 文件外部变更检测仍有竞态风险
  - `WorkspaceArea.tsx` 现在是可用的，但“外部改动 + 本地继续编辑”还值得再压一轮

- 终端 UI 细节仍需收一轮
  - tab 层级
  - hover 行为
  - 标题密度
  - 控制按钮语义

### P2

- 代码块体积较大，前端 bundle 还没做拆分
- 文档还不完整，尤其缺“设计原则”和“状态模型说明”

## 6. 发布状态

当前可以：

- 本地构建 `.app`
- 安装到 `/Applications`
- 用当前机器上的 `Apple Development` 证书重签名

当前还不能算“正式可分发”：

- 没有 `Developer ID Application`
- 没有 notarization

所以：

- 本地开发和自用没问题
- 对外分发还差正式签名链路

详细见：

- `docs/macos-release.md`

## 7. 常用命令

### 开发运行

```bash
cd /Users/yskj/mini-term
source ~/.cargo/env
npm run tauri dev
```

### 前端构建

```bash
cd /Users/yskj/mini-term
npm run build
```

### 单元测试

```bash
cd /Users/yskj/mini-term
npm run test:unit
```

### Rust 检查

```bash
cd /Users/yskj/mini-term/src-tauri
source ~/.cargo/env
cargo check
```

### 打包 app

```bash
cd /Users/yskj/mini-term
source ~/.cargo/env
npm run tauri build
```

## 8. 建议的下一步顺序

建议后续工作按这个顺序继续：

1. 修单终端 tab/header 体验
2. 修 Claude/Codex 输出不全问题
3. 回归测试终端关闭、session 恢复、分屏、新建终端
4. 压文件外部修改竞态
5. 做正式 macOS 发布链路

## 9. 当前结论

`TermNest` 已经从原始 `mini-term` 走到了“可用的 AI 工作台雏形”，而且：

- 基本工作流已经闭环
- 产品身份已经独立
- 编辑器 / session / 代理 / 终端三条主线已经接起来

但它现在还不是“完全收口的稳定版本”。  
当前最该继续盯的，是终端显示层和 AI 会话输出链路。
