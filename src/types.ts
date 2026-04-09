// === 配置持久化 ===

export type ProjectTreeItem = string | ProjectGroup;

export interface ProjectGroup {
  id: string;
  name: string;
  collapsed: boolean;
  children: ProjectTreeItem[];
}

export interface AppConfig {
  projects: ProjectConfig[];
  projectTree?: ProjectTreeItem[];
  // 旧字段仅用于迁移兼容（Rust 端处理后不再出现）
  projectGroups?: { id: string; name: string; collapsed: boolean; projectIds: string[] }[];
  projectOrdering?: string[];
  defaultShell: string;
  availableShells: ShellConfig[];
  uiFontSize: number;
  terminalFontSize: number;
  layoutSizes?: number[];
  middleColumnSizes?: number[];
  theme: 'auto' | 'light' | 'dark';
  terminalFollowTheme: boolean;
  proxy: ProxyConfig;
  sessionAliases: Record<string, Record<string, string>>;
  sessionPins: Record<string, Record<string, boolean>>;
}

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  title?: string;
  message: string;
  kind: NotificationKind;
}

export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  savedLayout?: SavedProjectLayout;
  expandedDirs?: string[];
  proxyMode: ProjectProxyMode;
  proxyOverride?: ProxyOverrideConfig;
}

export interface ShellConfig {
  name: string;
  command: string;
  args?: string[];
}

export type ProjectProxyMode = 'inherit' | 'enabled' | 'disabled';

export interface ProxyConfig {
  enabled: boolean;
  allProxy: string;
  httpProxy: string;
  httpsProxy: string;
}

export interface ProxyOverrideConfig {
  allProxy: string;
  httpProxy: string;
  httpsProxy: string;
}

// === 布局持久化 ===

export interface SavedPane {
  shellName: string;
}

export type SavedSplitNode =
  | { type: 'leaf'; panes: SavedPane[] }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: SavedSplitNode[]; sizes: number[] };

export interface SavedTab {
  customTitle?: string;
  splitLayout: SavedSplitNode;
}

export interface SavedProjectLayout {
  tabs: SavedTab[];
  activeTabIndex: number;
}

// === 运行时状态 ===

export type PaneStatus = 'idle' | 'ai-idle' | 'ai-working' | 'error';

export interface ProjectState {
  id: string;
  tabs: TerminalTab[];
  activeTabId: string;
}

export type EditorMode = 'split' | 'editor-only';

export interface EditorDocumentState {
  path: string;
  name: string;
  draftContent: string;
  savedContent: string;
  dirty: boolean;
  loading: boolean;
  error?: string;
  isBinary: boolean;
  tooLarge: boolean;
  lastKnownModifiedMs?: number;
  externallyModified: boolean;
}

export interface WorkspaceState {
  projectId: string;
  openEditors: EditorDocumentState[];
  activeEditorPath: string | null;
  editorMode: EditorMode;
}

export interface TerminalTab {
  id: string;
  customTitle?: string;
  splitLayout: SplitNode;
  status: PaneStatus;
}

export type SplitNode =
  | { type: 'leaf'; panes: PaneState[]; activePaneId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: SplitNode[]; sizes: number[] };

export interface PaneState {
  id: string;
  shellName: string;
  customTitle?: string;
  status: PaneStatus;
  ptyId: number;
}

// === AI 会话 ===

export interface AiSession {
  id: string;
  sessionType: 'claude' | 'codex';
  title: string;
  timestamp: string; // ISO 8601
}

// === 文件树 ===

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  ignored?: boolean;
  children?: FileEntry[];
}

// === Tauri 事件 payload ===

export interface PtyOutputPayload {
  ptyId: number;
  data: string;
}

export interface PtyExitPayload {
  ptyId: number;
  exitCode: number;
}

export interface PtyStatusChangePayload {
  ptyId: number;
  status: PaneStatus;
}

export interface FsChangePayload {
  projectPath: string;
  path: string;
  kind: string;
}

// === Git 状态 ===

export type GitStatusType = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface GitFileStatus {
  path: string;
  oldPath?: string;
  status: GitStatusType;
  statusLabel: string; // "M", "A", "D", "R", "?", "C"
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  kind: 'add' | 'delete' | 'context';
  content: string;
  oldLineno?: number;
  newLineno?: number;
}

export interface GitDiffResult {
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
  isBinary: boolean;
  tooLarge: boolean;
}

// === 文件查看 ===

export interface FileContentResult {
  content: string;
  isBinary: boolean;
  tooLarge: boolean;
}

export interface FileMetadataResult {
  isBinary: boolean;
  tooLarge: boolean;
  modifiedMs: number;
}

export interface WriteFileResult {
  modifiedMs: number;
}

// === Git 历史 ===

export interface GitRepoInfo {
  name: string;
  path: string;
  currentBranch?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  body?: string;
  author: string;
  timestamp: number;
}

export interface CommitFileInfo {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
}

export interface BranchInfo {
  name: string;
  isHead: boolean;
  isRemote: boolean;
  commitHash: string;
}
