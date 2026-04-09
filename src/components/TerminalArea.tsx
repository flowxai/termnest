import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, genId, saveLayoutToConfig, createTerminalTab, collectPtyIds } from '../store';
import { StatusDot } from './StatusDot';
import { SplitLayout } from './SplitLayout';
import { showContextMenu } from '../utils/contextMenu';
import { showConfirm } from '../utils/prompt';
import { disposeTerminal } from '../utils/terminalCache';
import type { PaneState, SplitNode, ShellConfig, TerminalTab } from '../types';

interface Props {
  projectId: string;
  projectPath: string;
}

// 收集 SplitNode 树中所有 pane ID
function collectPaneIds(node: SplitNode): string[] {
  if (node.type === 'leaf') return node.panes.map((p) => p.id);
  return node.children.flatMap(collectPaneIds);
}

function getActivePane(node: SplitNode): PaneState | null {
  if (node.type === 'leaf') {
    return node.panes.find((pane) => pane.id === node.activePaneId) ?? node.panes[0] ?? null;
  }

  for (const child of node.children) {
    const pane = getActivePane(child);
    if (pane) return pane;
  }

  return null;
}

function getTabLabel(tab: TerminalTab): string {
  if (tab.customTitle?.trim()) return tab.customTitle;
  const activePane = getActivePane(tab.splitLayout);
  return activePane?.customTitle || activePane?.shellName || '终端';
}

async function closeTerminalTab(tab: TerminalTab): Promise<boolean> {
  const hasAi = tab.status === 'ai-working' || tab.status === 'ai-idle';
  if (hasAi) {
    const confirmed = await showConfirm(
      '关闭 AI 对话',
      `终端「${getTabLabel(tab)}」正在运行 AI 对话，关闭后对话将被终止，确定继续吗？`,
    );
    if (!confirmed) return false;
  }

  const ptyIds = collectPtyIds(tab.splitLayout);
  for (const ptyId of ptyIds) {
    await invoke('kill_pty', { ptyId });
    disposeTerminal(ptyId);
  }

  return true;
}

function insertSplit(
  node: SplitNode,
  targetPaneId: string,
  direction: 'horizontal' | 'vertical',
  newLeaf: SplitNode
): SplitNode {
  if (node.type === 'leaf') {
    if (node.panes.some((p) => p.id === targetPaneId)) {
      return {
        type: 'split',
        direction,
        children: [node, newLeaf],
        sizes: [50, 50],
      };
    }
    return node;
  }
  return {
    ...node,
    children: node.children.map((c) => insertSplit(c, targetPaneId, direction, newLeaf)),
  };
}


export function TerminalArea({ projectId, projectPath }: Props) {
  const config = useAppStore((s) => s.config);
  const projectStates = useAppStore((s) => s.projectStates);
  const updateTabLayout = useAppStore((s) => s.updateTabLayout);
  const removeTab = useAppStore((s) => s.removeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const pushNotification = useAppStore((s) => s.pushNotification);
  const ps = projectStates.get(projectId);
  const activeTab = ps?.tabs.find((t) => t.id === ps.activeTabId);
  const showTerminalTabs = (ps?.tabs.length ?? 0) > 0;

  const handleNewTab = useCallback(async (selectedShell?: ShellConfig) => {
    await createTerminalTab(projectId, projectPath, { shellName: selectedShell?.name });
  }, [projectId, projectPath, config]);

  const handleNewTabClick = useCallback((e: React.MouseEvent) => {
    showContextMenu(
      e.clientX,
      e.clientY,
      config.availableShells.map((shell) => ({
        label: shell.name,
        onClick: () => handleNewTab(shell),
      })),
    );
  }, [config.availableShells, handleNewTab]);

  const handleSplitPane = useCallback(
    async (paneId: string, direction: 'horizontal' | 'vertical') => {
      if (!ps || !activeTab) return;
      const shell = config.availableShells.find((s) => s.name === config.defaultShell)
        ?? config.availableShells[0];
      if (!shell) {
        pushNotification({
          id: genId(),
          title: '无法分屏',
          message: '请先在设置中配置至少一个可用的 shell。',
          kind: 'error',
        });
        return;
      }

      let ptyId: number;
      try {
        ptyId = await invoke<number>('create_pty', {
          shell: shell.command,
          args: shell.args ?? [],
          cwd: projectPath,
        });
      } catch (error) {
        pushNotification({
          id: genId(),
          title: '终端启动失败',
          message: error instanceof Error ? error.message : String(error),
          kind: 'error',
        });
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          const { getOrCreateTerminal } = await import('../utils/terminalCache');
          getOrCreateTerminal(ptyId);
        } catch {
          // Pane 挂载时会兜底创建；这里预热只是为了避免首屏输出丢失。
        }
      }

      const newPane: PaneState = {
        id: genId(),
        shellName: shell.name,
        status: 'idle',
        ptyId,
      };

      const newLeaf: SplitNode = {
        type: 'leaf',
        panes: [newPane],
        activePaneId: newPane.id,
      };

      const newLayout = insertSplit(activeTab.splitLayout, paneId, direction, newLeaf);
      updateTabLayout(projectId, activeTab.id, newLayout);
      saveLayoutToConfig(projectId);
    },
    [ps, activeTab, config, projectId, projectPath, pushNotification, updateTabLayout]
  );

  // Called when an entire leaf (pane group) is closed.
  // PTYs are already killed by PaneGroup before this is called.
  // For the root leaf case, we close the whole tab.
  const handleCloseLeaf = useCallback((tabId: string) => {
    // PTYs are already killed by PaneGroup before this is called.
    // Remove the entire layout tab directly instead of re-reading activeTabId,
    // which may already be stale while the tree is collapsing.
    removeTab(projectId, tabId);
    saveLayoutToConfig(projectId);
  }, [projectId, removeTab]);

  const handleCloseTopLevelTab = useCallback(async (tab: TerminalTab) => {
    const closed = await closeTerminalTab(tab);
    if (!closed) return;
    removeTab(projectId, tab.id);
    saveLayoutToConfig(projectId);
  }, [projectId, removeTab]);

  const handleLayoutChange = useCallback((updatedNode: SplitNode) => {
    const currentPs = useAppStore.getState().projectStates.get(projectId);
    const currentActiveTab = currentPs?.tabs.find((t) => t.id === currentPs.activeTabId);
    if (!currentActiveTab) return;

    // Validate layout structure: if pane ID sets differ, discard stale RAF callback
    const currentIds = collectPaneIds(currentActiveTab.splitLayout).sort().join(',');
    const updatedIds = collectPaneIds(updatedNode).sort().join(',');
    if (currentIds !== updatedIds) return;

    updateTabLayout(projectId, currentActiveTab.id, updatedNode);
    saveLayoutToConfig(projectId);
  }, [projectId, updateTabLayout]);

  // Handler for structural changes: tabs added/removed/switched within a leaf,
  // or children removed from a split. Bypasses pane-ID validation since the
  // set of pane IDs is expected to change.
  const handleUpdateNode = useCallback((updatedNode: SplitNode) => {
    const currentPs = useAppStore.getState().projectStates.get(projectId);
    const currentActiveTab = currentPs?.tabs.find((t) => t.id === currentPs.activeTabId);
    if (!currentActiveTab) return;
    updateTabLayout(projectId, currentActiveTab.id, updatedNode);
    saveLayoutToConfig(projectId);
  }, [projectId, updateTabLayout]);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-terminal)]">
      {showTerminalTabs && ps && (
        <div
          className="flex bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] text-[11px] overflow-x-auto select-none shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {ps.tabs.map((tab) => {
            const isActive = tab.id === ps.activeTabId;
            return (
              <div
                key={tab.id}
                className={`group flex shrink-0 items-center gap-1.5 px-3 py-[5px] cursor-pointer whitespace-nowrap transition-all duration-100 relative min-w-0 max-w-[220px] ${
                  isActive
                    ? 'bg-[var(--bg-terminal)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                }`}
                onClick={() => setActiveTab(projectId, tab.id)}
                title={getTabLabel(tab)}
              >
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]" />
                )}
                <StatusDot status={tab.status} />
                <span className="truncate">{getTabLabel(tab)}</span>
                <span
                  className={`ml-0.5 text-[12px] transition-colors ${
                    isActive
                      ? 'text-[var(--text-muted)] hover:text-[var(--color-error)]'
                      : 'text-transparent group-hover:text-[var(--text-muted)] hover:!text-[var(--color-error)]'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTopLevelTab(tab);
                  }}
                  title="关闭终端"
                >
                  ✕
                </span>
              </div>
            );
          })}
          <div
            className="shrink-0 px-2 py-[5px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] transition-colors text-[12px]"
            onClick={() => handleNewTab()}
            onContextMenu={(e) => {
              e.preventDefault();
              handleNewTabClick(e);
            }}
            title="左键新建终端，右键选择终端类型"
          >
            +
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {ps?.tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === ps.activeTabId ? 'block' : 'none' }}
          >
            <SplitLayout
              tabId={tab.id}
              node={tab.splitLayout}
              projectPath={projectPath}
              onSplit={handleSplitPane}
              onCloseLeaf={handleCloseLeaf}
              onUpdateNode={handleUpdateNode}
              onLayoutChange={handleLayoutChange}
            />
          </div>
        ))}

        {(!ps || ps.tabs.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
            <div className="text-3xl opacity-20">⌘</div>
            <button
              className="px-5 py-2.5 border border-dashed border-[var(--border-default)] rounded-[var(--radius-md)] text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all duration-200"
              onClick={() => handleNewTab()}
              onContextMenu={(e) => {
                e.preventDefault();
                handleNewTabClick(e);
              }}
              title="左键直接新建默认终端，右键选择终端类型"
            >
              + 新建终端
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
