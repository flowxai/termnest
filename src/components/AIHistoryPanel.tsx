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
    <div className="h-full bg-[#12121f] border-l-2 border-[#7c83ff33] flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1a1a2e] border-b border-[#333] text-[10px] text-[#7c83ff] font-bold">
        🤖 会话历史
        <span
          className="ml-auto text-gray-600 cursor-pointer hover:text-white text-[9px]"
          onClick={toggleAiPanel}
        >
          ◂ 收起
        </span>
      </div>

      {project && (
        <div className="px-2.5 py-1 border-b border-[#2a2a40] text-[10px] text-[#7c83ff] bg-[#7c83ff08]">
          📁 {project.name}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-1">
        {aiSessions.length === 0 && (
          <div className="text-center text-gray-600 text-[10px] mt-4">暂无会话记录</div>
        )}
        {aiSessions.map((session, idx) => (
          <div
            key={session.id}
            className={`px-2 py-1.5 rounded cursor-pointer mb-0.5 ${
              idx === 0
                ? 'bg-[#7c83ff12] border-l-[3px] border-[#7c83ff]'
                : 'hover:bg-[#ffffff06]'
            }`}
          >
            <div className={`text-[11px] ${idx === 0 ? 'text-gray-200' : 'text-gray-500'}`}>
              {session.sessionType === 'claude' ? 'Claude' : 'Codex'} #{aiSessions.length - idx}
            </div>
            <div className="text-[9px] text-gray-600 mt-0.5">
              {formatTime(session.startTime)} · {session.messageCount} 轮对话
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
