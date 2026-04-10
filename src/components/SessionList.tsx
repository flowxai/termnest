import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { useAppStore, createTerminalTab } from '../store';
import { showContextMenu } from '../utils/contextMenu';
import { showPrompt } from '../utils/prompt';
import type { AiSession } from '../types';

/** 将 ISO 时间戳转换为简短的相对/绝对时间 */
function formatTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;

  // 超过一周显示日期
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  const currentYear = new Date().getFullYear();
  return y === currentYear ? `${m}月${d}日` : `${y}/${m}/${d}`;
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  claude: { label: 'C', color: 'var(--color-ai)' },
  codex: { label: 'X', color: 'var(--color-success)' },
};

export function SessionList() {
  const config = useAppStore((s) => s.config);
  const activeProjectId = useAppStore((s) => s.activeProjectId);

  const [sessions, setSessions] = useState<AiSession[]>([]);
  const [loading, setLoading] = useState(false);
  const suppressClickUntilRef = useRef(0);

  const activeProject = config.projects.find((p) => p.id === activeProjectId);

  const saveAliases = useCallback((updater: (prev: typeof config.sessionAliases) => typeof config.sessionAliases) => {
    const nextAliases = updater(useAppStore.getState().config.sessionAliases ?? {});
    const newConfig = { ...useAppStore.getState().config, sessionAliases: nextAliases };
    useAppStore.getState().setConfig(newConfig);
    invoke('save_config', { config: newConfig });
  }, []);

  const savePins = useCallback((updater: (prev: typeof config.sessionPins) => typeof config.sessionPins) => {
    const nextPins = updater(useAppStore.getState().config.sessionPins ?? {});
    const newConfig = { ...useAppStore.getState().config, sessionPins: nextPins };
    useAppStore.getState().setConfig(newConfig);
    invoke('save_config', { config: newConfig });
  }, []);

  const getSessionKey = useCallback((session: AiSession) => `${session.sessionType}:${session.id}`, []);

  const getAlias = useCallback((session: AiSession) => {
    if (!activeProject) return '';
    return config.sessionAliases?.[activeProject.path]?.[getSessionKey(session)] ?? '';
  }, [activeProject, config.sessionAliases, getSessionKey]);

  const isPinned = useCallback((session: AiSession) => {
    if (!activeProject) return false;
    return config.sessionPins?.[activeProject.path]?.[getSessionKey(session)] === true;
  }, [activeProject, config.sessionPins, getSessionKey]);

  const fetchSessions = useCallback(async (projectPath: string) => {
    setLoading(true);
    try {
      const result = await invoke<AiSession[]>('get_ai_sessions', { projectPath });
      setSessions([...result].sort((a, b) => (
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )));
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeProject?.path) {
      fetchSessions(activeProject.path);
    } else {
      setSessions([]);
    }
  }, [activeProject?.path, fetchSessions]);

  const sortedSessions = useMemo(() => (
    [...sessions].sort((a, b) => {
      const pinDiff = Number(isPinned(b)) - Number(isPinned(a));
      if (pinDiff !== 0) return pinDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
  ), [isPinned, sessions]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-surface)]">
      <div className="px-3 pt-2.5 pb-1.5 text-sm text-[var(--text-muted)] uppercase tracking-[0.12em] font-medium flex items-center justify-between">
        <span>Sessions</span>
        {activeProject && (
          <span
            className="text-xs normal-case tracking-normal cursor-pointer hover:text-[var(--text-primary)] transition-colors"
            onClick={() => fetchSessions(activeProject.path)}
            title="刷新会话列表"
          >
            ↻
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1.5">
        {loading && sessions.length === 0 && (
          <div className="px-2.5 py-3 text-xs text-[var(--text-muted)] text-center">加载中…</div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="px-2.5 py-3 text-xs text-[var(--text-muted)] text-center">
            {activeProject ? '暂无会话记录' : '请先选择项目'}
          </div>
        )}

        {sortedSessions.map((session) => {
          const badge = TYPE_BADGE[session.sessionType] ?? TYPE_BADGE.claude;
          const alias = getAlias(session);
          const displayTitle = alias || session.title;
          const pinned = isPinned(session);

          return (
            <div
              key={`${session.sessionType}-${session.id}`}
              className="flex items-start gap-2 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs group hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
              title={session.title}
              onClick={async () => {
                if (Date.now() < suppressClickUntilRef.current) return;
                if (!activeProjectId || !activeProject) return;
                const resumeCommand = session.sessionType === 'claude'
                  ? `claude --resume ${session.id} --dangerously-skip-permissions --teammate-mode tmux`
                  : `codex resume ${session.id}`;
                await createTerminalTab(activeProjectId, activeProject.path, {
                  initialCommand: resumeCommand,
                  customTitle: alias || session.title,
                });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                suppressClickUntilRef.current = Date.now() + 300;
                const cmd = session.sessionType === 'claude'
                  ? `claude --resume ${session.id} --dangerously-skip-permissions --teammate-mode tmux`
                  : `codex resume ${session.id}`;
                showContextMenu(e.clientX, e.clientY, [
                  {
                    label: pinned ? '取消置顶' : '置顶',
                    onClick: () => {
                      if (!activeProject) return;
                      const sessionKey = getSessionKey(session);
                      savePins((prev) => {
                        const projectPins = { ...(prev[activeProject.path] ?? {}) };
                        if (pinned) {
                          delete projectPins[sessionKey];
                        } else {
                          projectPins[sessionKey] = true;
                        }
                        return { ...prev, [activeProject.path]: projectPins };
                      });
                    },
                  },
                  {
                    label: '重命名别名',
                    onClick: async () => {
                      if (!activeProject) return;
                      const value = await showPrompt('Session 别名', '输入在 TermNest 中显示的名称', alias || session.title);
                      if (value === null) return;
                      const sessionKey = getSessionKey(session);
                      saveAliases((prev) => {
                        const projectAliases = { ...(prev[activeProject.path] ?? {}) };
                        const trimmed = value.trim();
                        if (!trimmed || trimmed === session.title) {
                          delete projectAliases[sessionKey];
                        } else {
                          projectAliases[sessionKey] = trimmed;
                        }
                        return { ...prev, [activeProject.path]: projectAliases };
                      });
                    },
                  },
                  {
                    label: '复制恢复命令',
                    onClick: () => navigator.clipboard.writeText(cmd),
                  },
                  {
                    label: '删除会话',
                    danger: true,
                    onClick: async () => {
                      if (!activeProject) return;
                      const confirmed = await ask(
                        `确定永久删除这个 ${session.sessionType === 'claude' ? 'Claude' : 'Codex'} 会话吗？此操作不可恢复。`,
                        { title: '删除会话', kind: 'warning' },
                      );
                      if (!confirmed) return;

                      try {
                        await invoke('delete_ai_session', {
                          projectPath: activeProject.path,
                          sessionType: session.sessionType,
                          sessionId: session.id,
                        });

                        const sessionKey = getSessionKey(session);
                        saveAliases((prev) => {
                          const projectAliases = { ...(prev[activeProject.path] ?? {}) };
                          delete projectAliases[sessionKey];
                          return { ...prev, [activeProject.path]: projectAliases };
                        });
                        savePins((prev) => {
                          const projectPins = { ...(prev[activeProject.path] ?? {}) };
                          delete projectPins[sessionKey];
                          return { ...prev, [activeProject.path]: projectPins };
                        });

                        await fetchSessions(activeProject.path);
                      } catch (error) {
                        await message(
                          typeof error === 'string' ? error : String(error),
                          { title: '删除失败', kind: 'error' },
                        );
                      }
                    },
                  },
                ]);
              }}
            >
              {/* 类型徽标 */}
              <span
                className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{ backgroundColor: badge.color + '22', color: badge.color }}
              >
                {badge.label}
              </span>

              {/* 标题 + 时间 */}
              <div className="flex-1 min-w-0">
                <div className="truncate text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors leading-snug">
                  {displayTitle}
                </div>
                {pinned && (
                  <div className="text-[10px] text-[var(--color-warning)] font-medium truncate mt-0.5 leading-none">
                    置顶
                  </div>
                )}
                {alias && (
                  <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5 leading-none">
                    {session.title}
                  </div>
                )}
                <div className="text-[var(--text-muted)] text-[10px] mt-0.5 leading-none">
                  {formatTime(session.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
