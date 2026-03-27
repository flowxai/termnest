import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import type { AISession } from '../types';

function formatTime(epochStr: string): string {
  const epoch = parseInt(epochStr, 10);
  if (isNaN(epoch)) return epochStr;

  const date = new Date(epoch * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `今天 ${time}`;
  if (isYesterday) return `昨天 ${time}`;
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function AIHistoryPanel() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const config = useAppStore((s) => s.config);
  const aiSessions = useAppStore((s) => s.aiSessions);
  const setAiSessions = useAppStore((s) => s.setAiSessions);
  const toggleAiPanel = useAppStore((s) => s.toggleAiPanel);

  const project = config.projects.find((p) => p.id === activeProjectId);

  useEffect(() => {
    if (!project) {
      setAiSessions([]);
      return;
    }
    invoke<AISession[]>('get_ai_sessions', { projectPath: project.path }).then(setAiSessions);
  }, [project?.path, setAiSessions]);

  return (
    <div className="h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] text-[10px] font-medium">
        <span className="text-[var(--color-ai)]">AI Sessions</span>
        <span
          className="ml-auto text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] text-[9px] transition-colors"
          onClick={toggleAiPanel}
        >
          ◂
        </span>
      </div>

      {/* 项目标识 */}
      {project && (
        <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
          {project.name}
        </div>
      )}

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {aiSessions.length === 0 && (
          <div className="text-center text-[var(--text-muted)] text-[10px] mt-6 opacity-60">
            暂无会话记录
          </div>
        )}
        {aiSessions.map((session, idx) => (
          <div
            key={session.id}
            className={`px-2.5 py-2 rounded-[var(--radius-sm)] cursor-pointer transition-colors duration-100 ${
              idx === 0
                ? 'bg-[var(--accent-subtle)] border-l-2 border-[var(--accent)]'
                : 'hover:bg-[var(--border-subtle)]'
            }`}
          >
            <div className={`text-[11px] font-medium ${idx === 0 ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
              {session.sessionType === 'claude' ? 'Claude' : 'Codex'} #{aiSessions.length - idx}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
              {formatTime(session.startTime)} · {session.messageCount} 轮对话
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
