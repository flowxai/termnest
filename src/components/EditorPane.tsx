import { useCallback, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createTerminalTab, useAppStore } from '../store';
import { showConfirm } from '../utils/prompt';
import type { EditorDocumentState, FileContentResult, FileMetadataResult, WriteFileResult } from '../types';

interface Props {
  projectId: string;
  projectPath: string;
}

function createLoadedEditor(
  existing: EditorDocumentState,
  contentResult: FileContentResult,
  metadataResult: FileMetadataResult,
): EditorDocumentState {
  return {
    ...existing,
    loading: false,
    error: undefined,
    isBinary: contentResult.isBinary,
    tooLarge: contentResult.tooLarge,
    savedContent: contentResult.content,
    draftContent: existing.dirty ? existing.draftContent : contentResult.content,
    dirty: existing.dirty,
    lastKnownModifiedMs: metadataResult.modifiedMs,
    externallyModified: false,
  };
}

export function EditorPane({ projectId, projectPath }: Props) {
  const workspace = useAppStore((s) => s.workspaceStates.get(projectId));
  const projectState = useAppStore((s) => s.projectStates.get(projectId));
  const setEditorLoaded = useAppStore((s) => s.setEditorLoaded);
  const updateEditorDraft = useAppStore((s) => s.updateEditorDraft);
  const markEditorSaved = useAppStore((s) => s.markEditorSaved);
  const clearEditorExternalChange = useAppStore((s) => s.clearEditorExternalChange);
  const hasTerminalTabs = (projectState?.tabs.length ?? 0) > 0;

  const activeEditor = useMemo(() => (
    workspace?.openEditors.find((editor) => editor.path === workspace.activeEditorPath) ?? null
  ), [workspace]);

  const loadEditor = useCallback(async (editor: EditorDocumentState) => {
    try {
      const [contentResult, metadataResult] = await Promise.all([
        invoke<FileContentResult>('read_file_content', { path: editor.path }),
        invoke<FileMetadataResult>('get_file_metadata', { path: editor.path }),
      ]);
      setEditorLoaded(projectId, createLoadedEditor(editor, contentResult, metadataResult));
    } catch (error) {
      setEditorLoaded(projectId, {
        ...editor,
        loading: false,
        error: String(error),
        isBinary: false,
        tooLarge: false,
        externallyModified: false,
      });
    }
  }, [projectId, setEditorLoaded]);

  useEffect(() => {
    if (activeEditor && activeEditor.loading) {
      loadEditor(activeEditor);
    }
  }, [activeEditor, loadEditor]);

  const saveEditor = useCallback(async (force = false) => {
    if (!activeEditor || activeEditor.loading || activeEditor.isBinary || activeEditor.tooLarge) return;
    try {
      const result = await invoke<WriteFileResult>('write_file_content', {
        path: activeEditor.path,
        content: activeEditor.draftContent,
        expectedModifiedMs: force ? null : activeEditor.lastKnownModifiedMs ?? null,
      });
      markEditorSaved(projectId, activeEditor.path, activeEditor.draftContent, result.modifiedMs);
    } catch (error) {
      const message = String(error);
      if (!force && message.includes('外部修改')) {
        const confirmed = await showConfirm('文件已变化', '文件已被外部修改。是否用当前编辑内容覆盖磁盘版本？');
        if (confirmed) {
          const result = await invoke<WriteFileResult>('write_file_content', {
            path: activeEditor.path,
            content: activeEditor.draftContent,
            expectedModifiedMs: null,
          });
          markEditorSaved(projectId, activeEditor.path, activeEditor.draftContent, result.modifiedMs);
        }
      }
    }
  }, [activeEditor, markEditorSaved, projectId]);

  const reloadEditor = useCallback(async () => {
    if (!activeEditor) return;
    if (activeEditor.dirty) {
      const confirmed = await showConfirm('重新加载文件', '未保存修改将丢失，确定重新从磁盘加载吗？');
      if (!confirmed) return;
    }
    clearEditorExternalChange(projectId, activeEditor.path);
    await loadEditor({ ...activeEditor, dirty: false, draftContent: activeEditor.savedContent });
  }, [activeEditor, clearEditorExternalChange, loadEditor, projectId]);

  useEffect(() => {
    if (!activeEditor) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (isSave) {
        event.preventDefault();
        saveEditor();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeEditor, saveEditor]);

  if (!workspace || !activeEditor) {
    return (
      <div className="flex-1 bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-muted)] text-sm">
        <div className="flex flex-col items-center gap-3">
          <div>从文件树打开文件开始编辑</div>
          {!hasTerminalTabs && (
            <button
              className="px-4 py-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              onClick={() => createTerminalTab(projectId, projectPath)}
            >
              + 新建终端
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-base)] min-w-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <div className="min-w-0">
          <div className="text-sm text-[var(--text-primary)] truncate">{activeEditor.name}</div>
          <div className="text-[11px] text-[var(--text-muted)] truncate">{activeEditor.path.replace(projectPath, '.')}</div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {activeEditor.dirty && <span className="text-[var(--color-warning)]">未保存</span>}
          {activeEditor.externallyModified && <span className="text-[var(--color-error)]">磁盘已更新</span>}
          {!hasTerminalTabs && (
            <button
              className="px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              onClick={() => createTerminalTab(projectId, projectPath)}
            >
              新建终端
            </button>
          )}
          <button
            className="px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            onClick={reloadEditor}
          >
            重新加载
          </button>
          <button
            className="px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-90 transition-opacity"
            onClick={() => saveEditor()}
          >
            保存
          </button>
        </div>
      </div>

      {activeEditor.loading && (
        <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
          加载中...
        </div>
      )}

      {!activeEditor.loading && activeEditor.error && (
        <div className="flex-1 flex items-center justify-center text-[var(--color-error)]">
          {activeEditor.error}
        </div>
      )}

      {!activeEditor.loading && activeEditor.isBinary && (
        <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
          二进制文件，不支持编辑
        </div>
      )}

      {!activeEditor.loading && activeEditor.tooLarge && (
        <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
          文件过大（&gt;1MB），暂不支持编辑
        </div>
      )}

      {!activeEditor.loading && !activeEditor.error && !activeEditor.isBinary && !activeEditor.tooLarge && (
        <textarea
          className="flex-1 w-full resize-none bg-[var(--bg-base)] text-[var(--text-primary)] font-mono text-sm leading-6 outline-none px-4 py-3"
          spellCheck={false}
          value={activeEditor.draftContent}
          onChange={(event) => updateEditorDraft(projectId, activeEditor.path, event.target.value)}
        />
      )}
    </div>
  );
}
