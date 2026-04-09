import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store';
import { getOrCreateTerminal, getCachedTerminal, getTerminalTheme, DARK_TERMINAL_THEME, writePtyInput, ensurePtyOutputAttached, signalTerminalReady } from '../utils/terminalCache';
import { getResolvedTheme } from '../utils/themeManager';
import '@xterm/xterm/css/xterm.css';

interface Props {
  ptyId: number;
}

export function TerminalInstance({ ptyId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const terminalFontSize = useAppStore((s) => s.config.terminalFontSize);
  const terminalFollowTheme = useAppStore((s) => s.config.terminalFollowTheme);

  // 终端不跟随主题且处于浅色模式时，面板背景强制深色
  const forceDarkBg = !terminalFollowTheme && getResolvedTheme() === 'light';
  const panelBg = forceDarkBg ? DARK_TERMINAL_THEME.background : undefined;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { term, fitAddon, wrapper } = getOrCreateTerminal(ptyId);

    container.appendChild(wrapper);

    // 先 attach 输出，再 resize 到实际尺寸，最后 signal ready
    // 保证恢复命令在正确尺寸下才发送
    (async () => {
      await ensurePtyOutputAttached(ptyId);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fitAddon.fit();
        await invoke('resize_pty', { ptyId, cols: term.cols, rows: term.rows });
        term.refresh(0, term.rows - 1);
      }
      signalTerminalReady(ptyId);
    })();

    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          fitAddon.fit();
        }
      });
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      wrapper.remove();
    };
  }, [ptyId]);

  useEffect(() => {
    const cached = getCachedTerminal(ptyId);
    if (cached && terminalFontSize) {
      cached.term.options.fontSize = terminalFontSize;
      cached.fitAddon.fit();
    }
  }, [terminalFontSize, ptyId]);

  useEffect(() => {
    const handler = () => {
      const cached = getCachedTerminal(ptyId);
      if (cached) {
        const { config } = useAppStore.getState();
        cached.term.options.theme = getTerminalTheme(config.terminalFollowTheme ?? true);
      }
    };
    window.addEventListener('theme-changed', handler);
    return () => window.removeEventListener('theme-changed', handler);
  }, [ptyId]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setFileDrag(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = e.relatedTarget as Node | null;
    if (!nextTarget || !e.currentTarget.contains(nextTarget)) {
      setFileDrag(false);
    }
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setFileDrag(false);
    const filePath = e.dataTransfer.getData('text/plain').trim();
    if (filePath) {
      void writePtyInput(ptyId, filePath);
      getCachedTerminal(ptyId)?.term.focus();
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div
        className="flex-1 relative bg-[var(--bg-terminal)]"
        style={panelBg ? { backgroundColor: panelBg } : undefined}
        onDragOverCapture={handleDragOver}
        onDragLeaveCapture={handleDragLeave}
        onDropCapture={handleDrop}
      >
        <div ref={containerRef} className="absolute inset-0" />

        {fileDrag && (
          <div
            className="absolute inset-1 z-10 flex items-center justify-center pointer-events-none rounded-[var(--radius-md)]"
            style={{ background: 'var(--accent-subtle)', border: '2px dashed var(--accent)' }}
          >
            <span className="text-[var(--accent)] text-xs px-3 py-1.5 rounded-[var(--radius-md)]"
              style={{ background: 'var(--bg-overlay)' }}>
              释放以插入路径
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
