import { useCallback } from 'react';
import { Allotment } from 'allotment';
import { createTerminalTab, useAppStore } from '../store';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { showConfirm } from '../utils/prompt';
import { EditorTabs } from './EditorTabs';
import { EditorPane } from './EditorPane';
import { TerminalArea } from './TerminalArea';
import type { FileContentResult, FileMetadataResult, FsChangePayload } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  projectId: string;
  projectPath: string;
}

export function WorkspaceArea({ projectId, projectPath }: Props) {
  const workspace = useAppStore((s) => s.workspaceStates.get(projectId));
  const projectState = useAppStore((s) => s.projectStates.get(projectId));
  const closeEditor = useAppStore((s) => s.closeEditor);
  const setActiveEditor = useAppStore((s) => s.setActiveEditor);
  const setEditorLoaded = useAppStore((s) => s.setEditorLoaded);
  const markEditorExternalChange = useAppStore((s) => s.markEditorExternalChange);
  const hasTerminalTabs = (projectState?.tabs.length ?? 0) > 0;
  const hasEditors = (workspace?.openEditors.length ?? 0) > 0;

  const handleCloseEditor = useCallback(async (path: string) => {
    const editor = workspace?.openEditors.find((item) => item.path === path);
    if (!editor) return;
    if (editor.dirty) {
      const confirmed = await showConfirm('关闭文件', `文件「${editor.name}」有未保存修改，确定关闭吗？`);
      if (!confirmed) return;
    }
    closeEditor(projectId, path);
  }, [closeEditor, projectId, workspace]);

  useTauriEvent<FsChangePayload>('fs-change', useCallback(async (payload) => {
    if (payload.projectPath !== projectPath || !workspace) return;
    const targetEditors = workspace.openEditors.filter((editor) => editor.path === payload.path);
    for (const editor of targetEditors) {
      try {
        const metadata = await invoke<FileMetadataResult>('get_file_metadata', { path: editor.path });
        if (metadata.modifiedMs === editor.lastKnownModifiedMs) continue;
        if (editor.dirty) {
          markEditorExternalChange(projectId, editor.path, metadata.modifiedMs);
          continue;
        }
        const content = await invoke<FileContentResult>('read_file_content', { path: editor.path });
        setEditorLoaded(projectId, {
          ...editor,
          loading: false,
          error: undefined,
          isBinary: content.isBinary,
          tooLarge: content.tooLarge,
          draftContent: content.content,
          savedContent: content.content,
          dirty: false,
          lastKnownModifiedMs: metadata.modifiedMs,
          externallyModified: false,
        });
      } catch {
        // ignore transient filesystem refresh issues
      }
    }
  }, [markEditorExternalChange, projectId, projectPath, setEditorLoaded, workspace]));

  const editorColumn = (
    <div className="h-full flex flex-col min-w-0">
      <EditorTabs
        editors={workspace?.openEditors ?? []}
        activePath={workspace?.activeEditorPath ?? null}
        onSelect={(path) => setActiveEditor(projectId, path)}
        onClose={handleCloseEditor}
      />
      <EditorPane projectId={projectId} projectPath={projectPath} />
    </div>
  );

  if (!hasEditors && !hasTerminalTabs) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--bg-base)] text-[var(--text-muted)] text-sm">
        <div>从文件树打开文件，或先新建一个终端</div>
        <button
          className="px-4 py-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          onClick={() => createTerminalTab(projectId, projectPath)}
        >
          + 新建终端
        </button>
      </div>
    );
  }

  if (!hasEditors) {
    return <TerminalArea projectId={projectId} projectPath={projectPath} />;
  }

  if (!hasTerminalTabs) return editorColumn;

  return (
    <Allotment defaultSizes={[45, 55]}>
      <Allotment.Pane minSize={260}>
        {editorColumn}
      </Allotment.Pane>
      <Allotment.Pane minSize={320}>
        <TerminalArea projectId={projectId} projectPath={projectPath} />
      </Allotment.Pane>
    </Allotment>
  );
}
