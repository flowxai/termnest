import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore, genId } from '../store';
import { TerminalInstance } from './TerminalInstance';
import { StatusDot } from './StatusDot';
import { showContextMenu } from '../utils/contextMenu';
import { showConfirm, showPrompt } from '../utils/prompt';
import { disposeTerminal } from '../utils/terminalCache';
import type { SplitNode, PaneState, ShellConfig } from '../types';

interface Props {
  node: SplitNode & { type: 'leaf' };
  projectPath: string;
  onSplit: (paneId: string, direction: 'horizontal' | 'vertical') => void;
  onClosePane: () => void;
  onUpdateNode: (updated: SplitNode) => void;
}

export function PaneGroup({ node, projectPath, onSplit, onClosePane, onUpdateNode }: Props) {
  const availableShells = useAppStore((s) => s.config.availableShells);
  const defaultShell = useAppStore((s) => s.config.defaultShell);
  const pushNotification = useAppStore((s) => s.pushNotification);
  // headerHover 用 CSS group-hover 处理，避免 React state 重渲染
  const nodeRef = useRef(node);
  nodeRef.current = node;
  const showPaneTabs = node.panes.length > 1;

  const activePane = node.panes.find((p) => p.id === node.activePaneId) ?? node.panes[0];

  const handleNewTab = useCallback(async (selectedShell?: ShellConfig) => {
    const shell = selectedShell
      ?? availableShells.find((s) => s.name === defaultShell)
      ?? availableShells[0];
    if (!shell) {
      pushNotification({
        id: genId(),
        title: '无法新建终端',
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
        // Pane 挂载时会兜底创建；这里预热只是为了避免启动输出在挂载前丢失。
      }
    }

    const newPane: PaneState = {
      id: genId(),
      shellName: shell.name,
      status: 'idle',
      ptyId,
    };

    const currentNode = nodeRef.current;

    onUpdateNode({
      ...currentNode,
      panes: [...currentNode.panes, newPane],
      activePaneId: newPane.id,
    });
  }, [availableShells, defaultShell, projectPath, pushNotification, onUpdateNode]);

  const handleNewTabClick = useCallback((e: React.MouseEvent) => {
    if (availableShells.length <= 1) {
      handleNewTab();
      return;
    }
    showContextMenu(
      e.clientX,
      e.clientY,
      availableShells.map((shell) => ({
        label: shell.name,
        onClick: () => handleNewTab(shell),
      })),
    );
  }, [availableShells, handleNewTab]);

  const handleCloseTab = useCallback(async (paneId: string) => {
    const pane = nodeRef.current.panes.find((p) => p.id === paneId);
    if (!pane) return;

    const hasAi = pane.status === 'ai-working' || pane.status === 'ai-idle';
    if (hasAi) {
      const label = pane.customTitle || pane.shellName;
      const confirmed = await showConfirm(
        '关闭 AI 对话',
        `终端「${label}」正在运行 AI 对话，关闭后对话将被终止，确定继续吗？`,
      );
      if (!confirmed) return;
    }

    await invoke('kill_pty', { ptyId: pane.ptyId });
    disposeTerminal(pane.ptyId);

    const currentNode = nodeRef.current;
    const remaining = currentNode.panes.filter((p) => p.id !== paneId);
    if (remaining.length === currentNode.panes.length) return;

    if (remaining.length === 0) {
      onClosePane();
      return;
    }

    const newActive = currentNode.activePaneId === paneId
      ? (remaining[remaining.length - 1]?.id ?? remaining[0].id)
      : currentNode.activePaneId;

    onUpdateNode({
      ...currentNode,
      panes: remaining,
      activePaneId: newActive,
    });
  }, [onClosePane, onUpdateNode]);

  const handleRenameTab = useCallback(async (paneId: string) => {
    const currentNode = nodeRef.current;
    const pane = currentNode.panes.find((p) => p.id === paneId);
    if (!pane) return;
    const newTitle = await showPrompt('重命名终端', pane.customTitle || pane.shellName);
    if (newTitle === null) return;

    const latestNode = nodeRef.current;
    onUpdateNode({
      ...latestNode,
      panes: latestNode.panes.map((p) =>
        p.id === paneId ? { ...p, customTitle: newTitle.trim() || undefined } : p
      ),
    });
  }, [onUpdateNode]);

  const handleSetActive = useCallback((paneId: string) => {
    const currentNode = nodeRef.current;
    if (paneId !== currentNode.activePaneId) {
      onUpdateNode({ ...currentNode, activePaneId: paneId });
    }
  }, [onUpdateNode]);

  const handleClosePaneGroup = useCallback(async () => {
    const currentNode = nodeRef.current;
    const aiCount = currentNode.panes.filter(
      (p) => p.status === 'ai-working' || p.status === 'ai-idle'
    ).length;
    if (aiCount > 0) {
      const confirmed = await showConfirm(
        '关闭 AI 对话',
        `该区域内有 ${aiCount} 个终端正在运行 AI 对话，关闭后对话将被终止，确定继续吗？`,
      );
      if (!confirmed) return;
    }

    for (const pane of nodeRef.current.panes) {
      await invoke('kill_pty', { ptyId: pane.ptyId });
      disposeTerminal(pane.ptyId);
    }
    onClosePane();
  }, [onClosePane]);

  if (!activePane) return null;

  return (
    <div
      className="group w-full h-full flex flex-col"
    >
      {showPaneTabs && (
        <div
          className="pane-tabbar flex bg-[var(--tabbar-bg)] border-b border-[var(--tabbar-border)] text-[11px] overflow-x-auto select-none shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {node.panes.map((pane) => {
            const isActive = pane.id === activePane.id;
            return (
              <div
                key={pane.id}
                className={`pane-tab flex items-center gap-1.5 px-3 py-[3px] cursor-pointer whitespace-nowrap transition-all duration-100 relative ${
                  isActive
                    ? 'bg-[var(--tab-active-bg)] text-[var(--text-primary)] shadow-[var(--tab-active-shadow)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--tab-hover-bg)]'
                }`}
                onClick={() => handleSetActive(pane.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu(e.clientX, e.clientY, [
                    { label: '重命名', onClick: () => handleRenameTab(pane.id) },
                  ]);
                }}
              >
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]" />
                )}
                <StatusDot status={pane.status} />
                <span className="font-medium">{pane.customTitle || pane.shellName}</span>
                <span
                  className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--color-error)] text-[12px] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(pane.id);
                  }}
                >
                  ✕
                </span>
              </div>
            );
          })}

          <div
            className="px-2 py-[3px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] transition-colors text-[12px]"
            onClick={handleNewTabClick}
          >
            +
          </div>

          <div className="ml-auto flex items-center gap-0.5 px-2 text-[12px]">
            <div
              className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            >
              <span
                className="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-colors px-0.5"
                title="Split right"
                onClick={() => onSplit(activePane.id, 'horizontal')}
              >
                ┃
              </span>
              <span
                className="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-colors px-0.5"
                title="Split down"
                onClick={() => onSplit(activePane.id, 'vertical')}
              >
                ━
              </span>
              <span
                className="text-[var(--text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors pl-0.5"
                title="Close pane"
                onClick={handleClosePaneGroup}
              >
                ✕
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active terminal */}
      <div className="flex-1 overflow-hidden relative">
        {!showPaneTabs && (
          <div
            className="pane-float-controls absolute top-2 right-2 z-10 flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--floating-control-bg)] border border-[var(--floating-control-border)] px-1.5 py-1 text-[12px] backdrop-blur-[var(--panel-blur)] shadow-[var(--interactive-shadow)] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          >
            <span
              className="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-colors px-0.5"
              title="New tab"
              onClick={handleNewTabClick}
            >
              +
            </span>
            <span
              className="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-colors px-0.5"
              title="Split right"
              onClick={() => onSplit(activePane.id, 'horizontal')}
            >
              ┃
            </span>
            <span
              className="text-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer transition-colors px-0.5"
              title="Split down"
              onClick={() => onSplit(activePane.id, 'vertical')}
            >
              ━
            </span>
            <span
              className="text-[var(--text-muted)] hover:text-[var(--color-error)] cursor-pointer transition-colors pl-0.5"
              title="Close pane"
              onClick={handleClosePaneGroup}
            >
              ✕
            </span>
          </div>
        )}
        {node.panes.map((pane) => (
          <div
            key={pane.ptyId}
            className="absolute inset-0"
            style={{ display: pane.id === activePane.id ? 'block' : 'none' }}
          >
            <TerminalInstance
              ptyId={pane.ptyId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
