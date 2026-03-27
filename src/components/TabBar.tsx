import { useState, useRef } from 'react';
import { useAppStore } from '../store';
import { StatusDot } from './StatusDot';
import type { TerminalTab } from '../types';

function getTabTitle(tab: TerminalTab): string {
  if (tab.customTitle) return tab.customTitle;
  if (tab.splitLayout.type === 'leaf') return tab.splitLayout.pane.shellName;
  return 'split';
}

interface Props {
  projectId: string;
  onNewTab: (e: React.MouseEvent) => void;
  onCloseTab: (tabId: string) => void;
}

export function TabBar({ projectId, onNewTab, onCloseTab }: Props) {
  const projectStates = useAppStore((s) => s.projectStates);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const reorderTabs = useAppStore((s) => s.reorderTabs);
  const ps = projectStates.get(projectId);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragTabId = useRef<string | null>(null);
  if (!ps) return null;

  return (
    <div className="flex bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] text-[11px] overflow-x-auto select-none">
      {ps.tabs.map((tab) => {
        const isActive = tab.id === ps.activeTabId;
        const isDragOver = dragOverId === tab.id && dragTabId.current !== tab.id;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-[7px] cursor-pointer whitespace-nowrap transition-all duration-100 relative ${
              isActive
                ? 'bg-[var(--bg-terminal)] text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
            }`}
            style={{
              borderLeft: isDragOver ? '2px solid var(--accent)' : '2px solid transparent',
            }}
            draggable
            onDragStart={(e) => {
              dragTabId.current = tab.id;
              e.dataTransfer.setData('application/tab-id', tab.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/tab-id')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverId(tab.id);
            }}
            onDragLeave={() => {
              setDragOverId((prev) => (prev === tab.id ? null : prev));
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverId(null);
              const fromId = e.dataTransfer.getData('application/tab-id');
              if (fromId && fromId !== tab.id) {
                reorderTabs(projectId, fromId, tab.id);
              }
            }}
            onDragEnd={() => {
              dragTabId.current = null;
              setDragOverId(null);
            }}
            onClick={() => setActiveTab(projectId, tab.id)}
          >
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]" />
            )}
            <StatusDot status={tab.status} />
            <span className="font-medium">{getTabTitle(tab)}</span>
            <span
              className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--color-error)] text-[9px] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ✕
            </span>
          </div>
        );
      })}
      <div
        className="px-3 py-[7px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--accent)] transition-colors"
        onClick={onNewTab}
      >
        +
      </div>
    </div>
  );
}
