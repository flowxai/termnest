import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  AppConfig,
  ProjectConfig,
  ProjectGroup,
  ProjectState,
  WorkspaceState,
  EditorDocumentState,
  EditorMode,
  TerminalTab,
  SplitNode,
  PaneState,
  PaneStatus,
  SavedPane,
  SavedSplitNode,
  SavedTab,
  SavedProjectLayout,
  AppNotification,
  NotificationKind,
} from './types';
import {
  deepCloneTree,
  removeFromTree,
  insertIntoTree,
  updateGroupInTree,
  removeGroupAndPromoteChildren,
  removeProjectFromTree,
  migrateToTree,
} from './utils/projectTree';

// 生成唯一 ID
let idCounter = 0;
export const genId = () => `id-${Date.now()}-${++idCounter}`;

// waitForTerminalMount removed — replaced by waitForTerminalReady in terminalCache

function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

function notify(title: string, message: string, kind: NotificationKind = 'error') {
  useAppStore.getState().pushNotification({
    id: genId(),
    title,
    message,
    kind,
  });
}

// 计算 Tab 聚合状态
const STATUS_PRIORITY: Record<PaneStatus, number> = {
  error: 3,
  'ai-working': 2,
  'ai-idle': 1,
  idle: 0,
};

function getHighestStatus(node: SplitNode): PaneStatus {
  if (node.type === 'leaf') {
    return node.panes.reduce<PaneStatus>((acc, p) => {
      return STATUS_PRIORITY[p.status] > STATUS_PRIORITY[acc] ? p.status : acc;
    }, 'idle');
  }
  return node.children.reduce<PaneStatus>((acc, child) => {
    const s = getHighestStatus(child);
    return STATUS_PRIORITY[s] > STATUS_PRIORITY[acc] ? s : acc;
  }, 'idle');
}

// 在 SplitNode 中更新指定 pane 的状态
function updatePaneStatus(node: SplitNode, ptyId: number, status: PaneStatus): SplitNode {
  if (node.type === 'leaf') {
    const idx = node.panes.findIndex((p) => p.ptyId === ptyId);
    if (idx >= 0) {
      const newPanes = [...node.panes];
      newPanes[idx] = { ...newPanes[idx], status };
      return { ...node, panes: newPanes };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) => updatePaneStatus(c, ptyId, status)),
  };
}

// 收集所有 pane 的 ptyId
export function collectPtyIds(node: SplitNode): number[] {
  if (node.type === 'leaf') return node.panes.map((p) => p.ptyId);
  return node.children.flatMap(collectPtyIds);
}

export async function createTerminalTab(
  projectId: string,
  projectPath: string,
  options?: {
    shellName?: string;
    initialCommand?: string;
    customTitle?: string;
  },
): Promise<number | null> {
  const { config, addTab } = useAppStore.getState();
  const shell = (options?.shellName
    ? config.availableShells.find((s) => s.name === options.shellName)
    : undefined)
    ?? config.availableShells.find((s) => s.name === config.defaultShell)
    ?? config.availableShells[0];
  if (!shell) {
    notify('无法新建终端', '请先在设置中配置至少一个可用的 shell。');
    return null;
  }

  let ptyId: number;
  try {
    ptyId = await invoke<number>('create_pty', {
      shell: shell.command,
      args: shell.args ?? [],
      cwd: projectPath,
    });
  } catch (error) {
    notify('终端启动失败', toErrorMessage(error));
    return null;
  }

  if (typeof window !== 'undefined') {
    try {
      const { getOrCreateTerminal } = await import('./utils/terminalCache');
      getOrCreateTerminal(ptyId);
    } catch {
      // TerminalInstance 挂载时会兜底创建；这里预热只是为了尽早接住启动输出。
    }
  }

  const paneId = genId();
  const tabId = genId();

  const tab: TerminalTab = {
    id: tabId,
    customTitle: options?.customTitle,
    status: 'idle',
    splitLayout: {
      type: 'leaf',
      panes: [{
        id: paneId,
        shellName: shell.name,
        status: 'idle',
        ptyId,
      }],
      activePaneId: paneId,
    },
  };

  addTab(projectId, tab);
  saveLayoutToConfig(projectId);

  if (options?.initialCommand) {
    try {
      const { waitForTerminalReady } = await import('./utils/terminalCache');
      await waitForTerminalReady(ptyId);
      await invoke('write_pty', { ptyId, data: `${options.initialCommand}\n` });
    } catch (error) {
      notify('终端命令发送失败', toErrorMessage(error), 'warning');
    }
  }

  return ptyId;
}

export function countDirtyEditors(): number {
  let count = 0;
  for (const workspace of useAppStore.getState().workspaceStates.values()) {
    count += workspace.openEditors.filter((editor) => editor.dirty).length;
  }
  return count;
}

// 序列化 SplitNode 树（剥离运行时数据）
function serializeSplitNode(node: SplitNode): SavedSplitNode {
  if (node.type === 'leaf') {
    return { type: 'leaf', panes: node.panes.map((p) => ({ shellName: p.shellName })) };
  }
  return {
    type: 'split',
    direction: node.direction,
    children: node.children.map(serializeSplitNode),
    sizes: [...node.sizes],
  };
}

export function serializeLayout(ps: ProjectState): SavedProjectLayout {
  const tabs: SavedTab[] = ps.tabs.map((tab) => ({
    customTitle: tab.customTitle,
    splitLayout: serializeSplitNode(tab.splitLayout),
  }));
  const activeTabIndex = ps.tabs.findIndex((t) => t.id === ps.activeTabId);
  return { tabs, activeTabIndex: activeTabIndex >= 0 ? activeTabIndex : 0 };
}

// 反序列化：重建 SplitNode 树并创建 PTY
async function restoreSplitNode(
  saved: SavedSplitNode,
  projectPath: string,
  config: AppConfig,
): Promise<SplitNode | null> {
  if (saved.type === 'leaf') {
    // Backward compatibility: old format had `pane` (single), new has `panes` (array).
    // TODO: remove this compat shim once all users have migrated (added in v0.2.0).
    const savedPanes = saved.panes ?? [((saved as any).pane as SavedPane)].filter(Boolean);
    const panes: PaneState[] = [];
    for (const savedPane of savedPanes) {
      const shell =
        config.availableShells.find((s) => s.name === savedPane.shellName)
        ?? config.availableShells.find((s) => s.name === config.defaultShell)
        ?? config.availableShells[0];
      if (!shell) continue;
      try {
        const ptyId = await invoke<number>('create_pty', {
          shell: shell.command,
          args: shell.args ?? [],
          cwd: projectPath,
        });
        panes.push({ id: genId(), shellName: shell.name, status: 'idle' as PaneStatus, ptyId });
      } catch {
        // skip failed pane
      }
    }
    if (panes.length === 0) return null;
    return {
      type: 'leaf',
      panes,
      activePaneId: panes[0].id,
    };
  }

  const children: SplitNode[] = [];
  for (const child of saved.children) {
    const restored = await restoreSplitNode(child, projectPath, config);
    if (restored) children.push(restored);
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return {
    type: 'split',
    direction: saved.direction,
    children,
    sizes: children.length === saved.sizes.length ? [...saved.sizes] : children.map(() => 100 / children.length),
  };
}

export async function restoreLayout(
  projectId: string,
  savedLayout: SavedProjectLayout,
  projectPath: string,
  config: AppConfig,
): Promise<void> {
  const tabs: TerminalTab[] = [];
  for (const savedTab of savedLayout.tabs) {
    const layout = await restoreSplitNode(savedTab.splitLayout, projectPath, config);
    if (layout) {
      tabs.push({
        id: genId(),
        customTitle: savedTab.customTitle,
        splitLayout: layout,
        status: 'idle',
      });
    }
  }
  if (tabs.length === 0) return;
  const activeTabId = tabs[savedLayout.activeTabIndex]?.id ?? tabs[0]?.id ?? '';
  useAppStore.setState((state) => {
    const newStates = new Map(state.projectStates);
    newStates.set(projectId, { id: projectId, tabs, activeTabId });
    return { projectStates: newStates };
  });
}

// 每个项目的展开目录集合（运行时状态）
const expandedDirsMap = new Map<string, Set<string>>();

export function initExpandedDirs(projectId: string, dirs: string[]) {
  expandedDirsMap.set(projectId, new Set(dirs));
}

export function isExpanded(projectId: string, path: string): boolean {
  return expandedDirsMap.get(projectId)?.has(path) ?? false;
}

export function toggleExpandedDir(projectId: string, path: string, expanded: boolean) {
  let set = expandedDirsMap.get(projectId);
  if (!set) {
    set = new Set();
    expandedDirsMap.set(projectId, set);
  }
  if (expanded) {
    set.add(path);
  } else {
    set.delete(path);
  }
  saveExpandedDirsToConfig(projectId);
}

// 保存展开目录到配置（防抖）
const saveExpandedTimers = new Map<string, ReturnType<typeof setTimeout>>();

function applyExpandedDirsToStore(projectId: string) {
  const { config } = useAppStore.getState();
  const dirs = Array.from(expandedDirsMap.get(projectId) ?? []);
  const newConfig = {
    ...config,
    projects: config.projects.map((p) =>
      p.id === projectId ? { ...p, expandedDirs: dirs } : p
    ),
  };
  useAppStore.getState().setConfig(newConfig);
}

function doSaveExpandedDirs(projectId: string) {
  applyExpandedDirsToStore(projectId);
  invoke('save_config', { config: useAppStore.getState().config });
}

function saveExpandedDirsToConfig(projectId: string) {
  const existing = saveExpandedTimers.get(projectId);
  if (existing) clearTimeout(existing);
  saveExpandedTimers.set(projectId, setTimeout(() => {
    saveExpandedTimers.delete(projectId);
    doSaveExpandedDirs(projectId);
  }, 500));
}

export function flushExpandedDirsToConfig(projectId: string) {
  const existing = saveExpandedTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
    saveExpandedTimers.delete(projectId);
  }
  applyExpandedDirsToStore(projectId);
}

// 每个项目独立的防抖 timer
const saveLayoutTimers = new Map<string, ReturnType<typeof setTimeout>>();

function applyLayoutToStore(projectId: string) {
  const { config, projectStates } = useAppStore.getState();
  const ps = projectStates.get(projectId);
  if (!ps) return;
  const savedLayout = serializeLayout(ps);
  const newConfig = {
    ...config,
    projects: config.projects.map((p) =>
      p.id === projectId ? { ...p, savedLayout } : p
    ),
  };
  useAppStore.getState().setConfig(newConfig);
}

function doSaveLayout(projectId: string) {
  applyLayoutToStore(projectId);
  invoke('save_config', { config: useAppStore.getState().config });
}

export function saveLayoutToConfig(projectId: string) {
  const existing = saveLayoutTimers.get(projectId);
  if (existing) clearTimeout(existing);
  saveLayoutTimers.set(projectId, setTimeout(() => {
    saveLayoutTimers.delete(projectId);
    doSaveLayout(projectId);
  }, 500));
}

// 立即保存（不防抖，用于 beforeunload / 项目切换）
export function flushLayoutToConfig(projectId: string) {
  const existing = saveLayoutTimers.get(projectId);
  if (existing) {
    clearTimeout(existing);
    saveLayoutTimers.delete(projectId);
  }
  applyLayoutToStore(projectId);
}

/** 将当前 store 中的 config 写入磁盘（返回 Promise） */
export function persistConfig() {
  return invoke('save_config', { config: useAppStore.getState().config });
}

function ensureTree(config: AppConfig): AppConfig {
  if (config.projectTree && config.projectTree.length > 0) return config;
  if (config.projectOrdering || config.projectGroups) {
    return { ...config, projectTree: migrateToTree(config), projectGroups: undefined, projectOrdering: undefined };
  }
  return { ...config, projectTree: config.projects.map((p) => p.id) };
}

interface AppStore {
  // 配置
  config: AppConfig;
  setConfig: (config: AppConfig) => void;

  // 项目
  activeProjectId: string | null;
  projectStates: Map<string, ProjectState>;
  workspaceStates: Map<string, WorkspaceState>;
  notifications: AppNotification[];
  setActiveProject: (id: string) => void;
  addProject: (project: ProjectConfig) => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;

  // Tab
  addTab: (projectId: string, tab: TerminalTab) => void;
  removeTab: (projectId: string, tabId: string) => void;
  setActiveTab: (projectId: string, tabId: string) => void;
  updateTabLayout: (projectId: string, tabId: string, layout: SplitNode) => void;

  // Pane 状态
  updatePaneStatusByPty: (ptyId: number, status: PaneStatus) => void;

  // 编辑器工作区
  openEditor: (projectId: string, path: string, name: string) => void;
  closeEditor: (projectId: string, path: string) => void;
  setActiveEditor: (projectId: string, path: string | null) => void;
  setEditorMode: (projectId: string, mode: EditorMode) => void;
  setEditorLoaded: (projectId: string, editor: EditorDocumentState) => void;
  updateEditorDraft: (projectId: string, path: string, content: string) => void;
  markEditorSaved: (projectId: string, path: string, content: string, modifiedMs: number) => void;
  markEditorExternalChange: (projectId: string, path: string, modifiedMs: number) => void;
  clearEditorExternalChange: (projectId: string, path: string) => void;

  // 分组
  createGroup: (name: string, parentGroupId?: string) => void;
  removeGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  moveItem: (itemId: string, targetGroupId: string | null, index?: number) => void;
  pushNotification: (notification: AppNotification) => void;
  dismissNotification: (id: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  config: {
    projects: [],
    defaultShell: '',
    availableShells: [],
    uiFontSize: 13,
    terminalFontSize: 14,
    theme: 'auto',
    terminalFollowTheme: true,
    proxy: {
      enabled: false,
      allProxy: '',
      httpProxy: '',
      httpsProxy: '',
    },
    sessionAliases: {},
    sessionPins: {},
  },
  setConfig: (config) => set({ config }),

  activeProjectId: null,
  projectStates: new Map(),
  workspaceStates: new Map(),
  notifications: [],

  setActiveProject: (id) => set({ activeProjectId: id }),

  addProject: (project) =>
    set((state) => {
      const config = ensureTree(state.config);
      const newTree = [...(config.projectTree ?? []), project.id];
      const newConfig = {
        ...config,
        projects: [...config.projects, project],
        projectTree: newTree,
      };
      const newStates = new Map(state.projectStates);
      newStates.set(project.id, { id: project.id, tabs: [], activeTabId: '' });
      const newWorkspaces = new Map(state.workspaceStates);
      newWorkspaces.set(project.id, {
        projectId: project.id,
        openEditors: [],
        activeEditorPath: null,
        editorMode: 'split',
      });
      return {
        config: newConfig,
        projectStates: newStates,
        workspaceStates: newWorkspaces,
        activeProjectId: state.activeProjectId ?? project.id,
      };
    }),

  removeProject: (id) =>
    set((state) => {
      expandedDirsMap.delete(id);
      const timer = saveExpandedTimers.get(id);
      if (timer) { clearTimeout(timer); saveExpandedTimers.delete(id); }

      const newTree = deepCloneTree(state.config.projectTree ?? []);
      removeProjectFromTree(newTree, id);
      const newConfig = {
        ...state.config,
        projects: state.config.projects.filter((p) => p.id !== id),
        projectTree: newTree,
      };
      const newStates = new Map(state.projectStates);
      newStates.delete(id);
      const newWorkspaces = new Map(state.workspaceStates);
      newWorkspaces.delete(id);
      const newActive =
        state.activeProjectId === id
          ? newConfig.projects[0]?.id ?? null
          : state.activeProjectId;
      return { config: newConfig, projectStates: newStates, workspaceStates: newWorkspaces, activeProjectId: newActive };
    }),

  renameProject: (id, name) =>
    set((state) => ({
      config: {
        ...state.config,
        projects: state.config.projects.map((p) =>
          p.id === id ? { ...p, name } : p
        ),
      },
    })),

  addTab: (projectId, tab) =>
    set((state) => {
      const newStates = new Map(state.projectStates);
      const ps = newStates.get(projectId);
      if (!ps) return state;
      newStates.set(projectId, {
        ...ps,
        tabs: [...ps.tabs, tab],
        activeTabId: tab.id,
      });
      return { projectStates: newStates };
    }),

  removeTab: (projectId, tabId) =>
    set((state) => {
      const newStates = new Map(state.projectStates);
      const ps = newStates.get(projectId);
      if (!ps) return state;
      const newTabs = ps.tabs.filter((t) => t.id !== tabId);
      const newActive =
        ps.activeTabId === tabId ? (newTabs[newTabs.length - 1]?.id ?? '') : ps.activeTabId;
      newStates.set(projectId, { ...ps, tabs: newTabs, activeTabId: newActive });
      return { projectStates: newStates };
    }),

  setActiveTab: (projectId, tabId) =>
    set((state) => {
      const newStates = new Map(state.projectStates);
      const ps = newStates.get(projectId);
      if (!ps) return state;
      newStates.set(projectId, { ...ps, activeTabId: tabId });
      return { projectStates: newStates };
    }),

  updateTabLayout: (projectId, tabId, layout) =>
    set((state) => {
      const newStates = new Map(state.projectStates);
      const ps = newStates.get(projectId);
      if (!ps) return state;
      newStates.set(projectId, {
        ...ps,
        tabs: ps.tabs.map((t) =>
          t.id === tabId ? { ...t, splitLayout: layout, status: getHighestStatus(layout) } : t
        ),
      });
      return { projectStates: newStates };
    }),

  updatePaneStatusByPty: (ptyId, status) =>
    set((state) => {
      // 快速检查：是否有任何 pane 包含此 ptyId
      let found = false;
      for (const ps of state.projectStates.values()) {
        if (found) break;
        for (const tab of ps.tabs) {
          if (collectPtyIds(tab.splitLayout).includes(ptyId)) { found = true; break; }
        }
      }
      if (!found) return state;

      const newStates = new Map(state.projectStates);
      let changed = false;
      for (const [pid, ps] of newStates) {
        let tabsChanged = false;
        const updatedTabs = ps.tabs.map((tab) => {
          const newLayout = updatePaneStatus(tab.splitLayout, ptyId, status);
          if (newLayout === tab.splitLayout) return tab;
          tabsChanged = true;
          return { ...tab, splitLayout: newLayout, status: getHighestStatus(newLayout) };
        });
        if (tabsChanged) {
          newStates.set(pid, { ...ps, tabs: updatedTabs });
          changed = true;
        }
      }
      return changed ? { projectStates: newStates } : state;
    }),

  openEditor: (projectId, path, name) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId) ?? {
        projectId,
        openEditors: [],
        activeEditorPath: null,
        editorMode: 'split' as EditorMode,
      };
      if (workspace.openEditors.some((editor) => editor.path === path)) {
        workspaces.set(projectId, { ...workspace, activeEditorPath: path });
        return { workspaceStates: workspaces };
      }

      const editor: EditorDocumentState = {
        path,
        name,
        draftContent: '',
        savedContent: '',
        dirty: false,
        loading: true,
        isBinary: false,
        tooLarge: false,
        externallyModified: false,
      };
      workspaces.set(projectId, {
        ...workspace,
        openEditors: [...workspace.openEditors, editor],
        activeEditorPath: path,
      });
      return { workspaceStates: workspaces };
    }),

  closeEditor: (projectId, path) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      const remaining = workspace.openEditors.filter((editor) => editor.path !== path);
      let activeEditorPath = workspace.activeEditorPath;
      if (activeEditorPath === path) {
        activeEditorPath = remaining[remaining.length - 1]?.path ?? remaining[0]?.path ?? null;
      }
      workspaces.set(projectId, { ...workspace, openEditors: remaining, activeEditorPath });
      return { workspaceStates: workspaces };
    }),

  setActiveEditor: (projectId, path) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      workspaces.set(projectId, { ...workspace, activeEditorPath: path });
      return { workspaceStates: workspaces };
    }),

  setEditorMode: (projectId, mode) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId) ?? {
        projectId,
        openEditors: [],
        activeEditorPath: null,
        editorMode: 'split' as EditorMode,
      };
      workspaces.set(projectId, { ...workspace, editorMode: mode });
      return { workspaceStates: workspaces };
    }),

  setEditorLoaded: (projectId, editor) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      const exists = workspace.openEditors.some((item) => item.path === editor.path);
      if (!exists) return state;
      workspaces.set(projectId, {
        ...workspace,
        openEditors: workspace.openEditors.map((item) => item.path === editor.path ? editor : item),
      });
      return { workspaceStates: workspaces };
    }),

  updateEditorDraft: (projectId, path, content) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      workspaces.set(projectId, {
        ...workspace,
        openEditors: workspace.openEditors.map((editor) =>
          editor.path === path
            ? { ...editor, draftContent: content, dirty: content !== editor.savedContent }
            : editor
        ),
      });
      return { workspaceStates: workspaces };
    }),

  markEditorSaved: (projectId, path, content, modifiedMs) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      workspaces.set(projectId, {
        ...workspace,
        openEditors: workspace.openEditors.map((editor) =>
          editor.path === path
            ? {
              ...editor,
              draftContent: content,
              savedContent: content,
              dirty: false,
              externallyModified: false,
              lastKnownModifiedMs: modifiedMs,
            }
            : editor
        ),
      });
      return { workspaceStates: workspaces };
    }),

  markEditorExternalChange: (projectId, path, _modifiedMs) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      workspaces.set(projectId, {
        ...workspace,
        openEditors: workspace.openEditors.map((editor) =>
          editor.path === path
            ? { ...editor, externallyModified: true }
            : editor
        ),
      });
      return { workspaceStates: workspaces };
    }),

  clearEditorExternalChange: (projectId, path) =>
    set((state) => {
      const workspaces = new Map(state.workspaceStates);
      const workspace = workspaces.get(projectId);
      if (!workspace) return state;
      workspaces.set(projectId, {
        ...workspace,
        openEditors: workspace.openEditors.map((editor) =>
          editor.path === path ? { ...editor, externallyModified: false } : editor
        ),
      });
      return { workspaceStates: workspaces };
    }),

  createGroup: (name, parentGroupId) =>
    set((state) => {
      const config = ensureTree(state.config);
      const group: ProjectGroup = { id: genId(), name, collapsed: false, children: [] };
      const newTree = deepCloneTree(config.projectTree ?? []);
      insertIntoTree(newTree, parentGroupId ?? null, group);
      return { config: { ...config, projectTree: newTree } };
    }),

  removeGroup: (groupId) =>
    set((state) => {
      const newTree = deepCloneTree(state.config.projectTree ?? []);
      removeGroupAndPromoteChildren(newTree, groupId);
      return { config: { ...state.config, projectTree: newTree } };
    }),

  renameGroup: (groupId, name) =>
    set((state) => {
      const newTree = deepCloneTree(state.config.projectTree ?? []);
      updateGroupInTree(newTree, groupId, (g) => ({ ...g, name }));
      return { config: { ...state.config, projectTree: newTree } };
    }),

  toggleGroupCollapse: (groupId) =>
    set((state) => {
      const newTree = deepCloneTree(state.config.projectTree ?? []);
      updateGroupInTree(newTree, groupId, (g) => ({ ...g, collapsed: !g.collapsed }));
      return { config: { ...state.config, projectTree: newTree } };
    }),

  moveItem: (itemId, targetGroupId, index) =>
    set((state) => {
      const config = ensureTree(state.config);
      const newTree = deepCloneTree(config.projectTree ?? []);
      const removed = removeFromTree(newTree, itemId);
      if (!removed) return state;
      insertIntoTree(newTree, targetGroupId, removed, index);
      return { config: { ...config, projectTree: newTree } };
    }),

  pushNotification: (notification) =>
    set((state) => ({
      notifications: [...state.notifications, notification],
    })),

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),

}));
