import type { EditorDocumentState } from '../types';

interface Props {
  editors: EditorDocumentState[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabs({ editors, activePath, onSelect, onClose }: Props) {
  return (
    <div
      className="flex bg-[var(--tabbar-bg)] border-b border-[var(--tabbar-border)] text-[11px] overflow-x-auto select-none shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {editors.map((editor) => {
        const isActive = editor.path === activePath;
        return (
          <div
            key={editor.path}
            className={`flex items-center gap-1.5 px-3 py-[5px] cursor-pointer whitespace-nowrap transition-all duration-100 relative ${
              isActive
                ? 'bg-[var(--tab-active-bg)] text-[var(--text-primary)] shadow-[var(--tab-active-shadow)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--tab-hover-bg)]'
            }`}
            onClick={() => onSelect(editor.path)}
            title={editor.path}
          >
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--accent)]" />
            )}
            <span className={`w-1.5 h-1.5 rounded-full ${editor.dirty ? 'bg-[var(--color-warning)]' : 'bg-transparent'}`} />
            <span>{editor.name}</span>
            {editor.externallyModified && (
              <span className="text-[10px] text-[var(--color-error)]">外部已修改</span>
            )}
            <span
              className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--color-error)] text-[12px] transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClose(editor.path);
              }}
            >
              ✕
            </span>
          </div>
        );
      })}
    </div>
  );
}
