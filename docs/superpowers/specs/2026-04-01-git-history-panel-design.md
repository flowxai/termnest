# Git 提交历史面板设计

## 概述

在 mini-term 中列（FileTree 下方）新增 Git 提交历史面板，支持自动扫描项目下所有 git 仓库，以二级列表展示提交记录。

## 需求

- 自动扫描项目目录下所有 git 仓库（包括项目本身就是 git 仓库的情况）
- 二级列表：一级为仓库名，展开后二级为提交记录
- 每条提交显示：提交消息 + 作者 + 相对时间 + 短 hash
- 右键菜单：复制 commit hash、查看该提交的 diff
- 查看 diff 复用现有 DiffModal，新增文件选择器支持多文件 commit
- 滚动到底自动加载更多（每次 30 条）

## 技术方案：纯 git2 实现

与现有 git.rs 一致的技术栈，不引入外部依赖。

## 后端设计（Rust）

### 新增数据结构

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    pub name: String,      // 仓库目录名
    pub path: String,      // 仓库绝对路径
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub hash: String,          // 完整 hash
    pub short_hash: String,    // 前 7 位
    pub message: String,       // 首行提交消息
    pub author: String,        // 作者名
    pub timestamp: i64,        // Unix 时间戳
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitFileDiff {
    pub path: String,
    pub status: String,            // "added" | "modified" | "deleted" | "renamed"
    pub old_path: Option<String>,
    pub diff: GitDiffResult,       // 复用现有结构
}
```

### 新增 Tauri Commands

#### 1. `discover_git_repos(project_path: String) -> Vec<GitRepoInfo>`

- 检查 project_path 本身是否为 git 仓库，是则加入结果
- 扫描一级子目录，发现 git 仓库则加入结果
- 返回仓库名称 + 绝对路径

#### 2. `get_git_log(repo_path: String, skip: usize, limit: usize) -> Vec<GitCommitInfo>`

- 用 `git2::Revwalk` 从 HEAD 开始遍历
- `skip` 跳过已加载的条目，`limit` 限制返回数量（默认 30）
- 返回提交列表，按时间倒序

#### 3. `get_commit_diff(repo_path: String, commit_hash: String) -> Vec<CommitFileDiff>`

- 解析 commit hash 找到对应 commit
- 对比该 commit 与其第一个 parent 的 tree diff
- 初始提交（无 parent）：所有文件视为 added
- 返回变更文件列表 + 每个文件的 hunks（复用现有 DiffHunk/DiffLine/GitDiffResult 结构）

### 修改文件

- `src-tauri/src/git.rs`：新增上述 3 个 command + 结构体
- `src-tauri/src/lib.rs`：注册新 command

## 前端设计

### 布局变更

App.tsx 中列从单独的 `<FileTree>` 改为 `<Allotment vertical>`：

```
中列 (Pane 2)
├── FileTree（上，minSize=150）
├── ── 可拖拽分割线 ──
└── GitHistory（下，minSize=100）
```

分割比例纳入现有 `config.layoutSizes` 持久化机制。

### 新建 GitHistory 组件

```
GitHistory
├── 头部 "Git History"
├── 仓库列表（可滚动）
│   ├── RepoItem（一级：仓库名 + 展开箭头）
│   │   └── CommitList（二级：展开后的提交列表）
│   │       ├── CommitItem × N
│   │       │   ├── 首行：提交消息（截断）
│   │       │   ├── 次行：作者 · 相对时间 · 短hash
│   │       │   └── 右键菜单：复制hash / 查看diff
│   │       └── 滚动到底 → 自动加载下一批 30 条
│   └── RepoItem ...
└── 空状态："未发现 Git 仓库"
```

### DiffModal 改造

因为一次 commit 可能改多个文件，需要在 DiffModal 中新增文件选择器（左侧文件列表或顶部下拉），让用户切换查看不同文件的 diff。

### 数据流

1. 切换项目时调用 `discover_git_repos` 获取仓库列表
2. 展开仓库时调用 `get_git_log(path, 0, 30)` 加载首批
3. 滚动到底调用 `get_git_log(path, skip, 30)` 加载更多
4. 右键 → "查看变更" → 调用 `get_commit_diff` → 弹出 DiffModal
5. 仓库列表的展开/折叠状态跟随项目持久化

### 类型定义（types.ts 新增）

```typescript
interface GitRepoInfo {
  name: string
  path: string
}

interface GitCommitInfo {
  hash: string
  shortHash: string
  message: string
  author: string
  timestamp: number
}

interface CommitFileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  oldPath?: string
  diff: GitDiffResult
}
```

### 相对时间

前端用简单函数计算：刚刚 / N分钟前 / N小时前 / N天前 / 具体日期。

## 边界情况

| 场景 | 处理 |
|------|------|
| 项目路径本身就是 git 仓库 | `discover_git_repos` 返回自身，列表只有一项 |
| 空仓库（无提交） | `get_git_log` 返回空数组，显示"暂无提交" |
| 无 git 仓库 | 显示"未发现 Git 仓库" |
| merge commit（多 parent） | diff 对比第一个 parent |
| 初始提交（无 parent） | 所有文件视为 added，old content 为空 |

## 需要修改的文件清单

| 文件 | 改动 |
|------|------|
| `src-tauri/src/git.rs` | 新增 3 个 command + 相关结构体 |
| `src-tauri/src/lib.rs` | 注册新 command |
| `src/types.ts` | 新增类型定义 |
| `src/App.tsx` | 中列改为垂直 Allotment |
| `src/components/DiffModal.tsx` | 新增文件选择器 |
| `src/components/GitHistory.tsx`（新建） | Git 历史面板组件 |
