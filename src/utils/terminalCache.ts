/**
 * 终端实例缓存：在 React 组件卸载/重新挂载期间保持 xterm.js Terminal 存活。
 *
 * 问题：分屏操作导致 SplitLayout 从 leaf 变为 split 节点，React 会卸载旧的
 * TerminalInstance 并重建新的，xterm.js 实例被 dispose，终端内容丢失。
 *
 * 方案：Terminal 实例按 ptyId 缓存。组件 mount 时附着 wrapper 到容器，
 * unmount 时仅分离 wrapper，不销毁 Terminal。仅在面板真正关闭时调用 dispose。
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
// import { CanvasAddon } from '@xterm/addon-canvas';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useAppStore } from '../store';
import type { PtyOutputPayload } from '../types';
import { getResolvedTheme } from './themeManager';
import { createPtyWriteQueue } from './ptyWriteQueue';

export interface CachedTerminal {
  term: Terminal;
  fitAddon: FitAddon;
  wrapper: HTMLDivElement;
}

interface CachedEntry extends CachedTerminal {
  cleanup: () => void;
  attached: boolean;
  attachPromise?: Promise<void>;
  unlisten?: () => void;
}

export const DARK_TERMINAL_THEME = {
  background: '#100f0d',
  foreground: '#d8d4cc',
  cursor: '#c8805a',
  cursorAccent: '#100f0d',
  selectionBackground: '#c8805a30',
  selectionForeground: '#e5e0d8',
  black: '#2a2824',
  red: '#d4605a',
  green: '#6bb87a',
  yellow: '#d4a84a',
  blue: '#6896c8',
  magenta: '#b08cd4',
  cyan: '#7dcfb8',
  white: '#d8d4cc',
  brightBlack: '#5c5850',
  brightRed: '#e07060',
  brightGreen: '#80d090',
  brightYellow: '#e0b860',
  brightBlue: '#80aad8',
  brightMagenta: '#c0a0e0',
  brightCyan: '#90e0c8',
  brightWhite: '#e5e0d8',
};

export const LIGHT_TERMINAL_THEME = {
  background: '#fafafa',
  foreground: '#1a1a1a',
  cursor: '#b06830',
  cursorAccent: '#fafafa',
  selectionBackground: '#b0683030',
  selectionForeground: '#1a1a1a',
  black: '#1a1a1a',
  red: '#c0392b',
  green: '#2d8a46',
  yellow: '#b08620',
  blue: '#2860a0',
  magenta: '#8a5cb8',
  cyan: '#1a8a6a',
  white: '#808080',
  brightBlack: '#666666',
  brightRed: '#e04030',
  brightGreen: '#38a058',
  brightYellow: '#c89830',
  brightBlue: '#3870b8',
  brightMagenta: '#a070d0',
  brightCyan: '#28a080',
  brightWhite: '#a0a0a0',
};

export function getTerminalTheme(terminalFollowTheme: boolean): typeof DARK_TERMINAL_THEME {
  if (terminalFollowTheme && getResolvedTheme() === 'light') {
    return LIGHT_TERMINAL_THEME;
  }
  return DARK_TERMINAL_THEME;
}

const cache = new Map<number, CachedEntry>();
const readyMap = new Map<number, { promise: Promise<void>; resolve: () => void }>();

function getOrCreateReadyEntry(ptyId: number) {
  let entry = readyMap.get(ptyId);
  if (!entry) {
    let resolve: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    entry = { promise, resolve: resolve! };
    readyMap.set(ptyId, entry);
  }
  return entry;
}

/** 等待终端完成 attach + resize，超时 3 秒兜底 */
export function waitForTerminalReady(ptyId: number): Promise<void> {
  const { promise } = getOrCreateReadyEntry(ptyId);
  return Promise.race([
    promise,
    new Promise<void>((r) => setTimeout(r, 3000)),
  ]);
}

/** 终端 attach + resize 完成后调用 */
export function signalTerminalReady(ptyId: number): void {
  const entry = readyMap.get(ptyId);
  if (entry) {
    entry.resolve();
    readyMap.delete(ptyId);
  }
}
const enqueuePtyWrite = createPtyWriteQueue((ptyId, data) =>
  invoke('write_pty', { ptyId, data })
);

function writePtyBinary(ptyId: number, data: string): Promise<void> {
  const bytes = Array.from(data, (char) => char.charCodeAt(0) & 0xff);
  return invoke('write_pty_binary', { ptyId, data: bytes });
}

export function getOrCreateTerminal(ptyId: number): CachedTerminal {
  const existing = cache.get(ptyId);
  if (existing) return existing;

  // 创建 wrapper 容器，xterm.js 会在其中渲染
  const wrapper = document.createElement('div');
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';

  const term = new Terminal({
    fontSize: useAppStore.getState().config.terminalFontSize ?? 14,
    fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
    fontWeight: '400',
    fontWeightBold: '600',
    cursorBlink: true,
    cursorStyle: 'bar',
    cursorWidth: 2,
    scrollback: 10000,
    letterSpacing: 0,
    lineHeight: 1.35,
    theme: getTerminalTheme(useAppStore.getState().config.terminalFollowTheme ?? true),
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(wrapper);

  // 注意：WebGL 和 Canvas 渲染器在 Tauri WKWebView 中
  // 均存在多上下文兼容性问题，暂用默认 DOM 渲染器。

  // Some TUIs (notably Codex) rely heavily on DECSET 2026 synchronized output.
  // In the embedded terminal this can leave the renderer stuck in a degraded
  // state, so we ignore that mode and prefer immediate rendering.
  const syncOnDisp = term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
    return params.length > 0 && params[0] === 2026;
  });
  const syncOffDisp = term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
    return params.length > 0 && params[0] === 2026;
  });

  // 剪贴板快捷键
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      e.preventDefault();
      const sel = term.getSelection();
      if (sel) writeText(sel);
      return false;
    }
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
      e.preventDefault();
      readText().then((text) => {
        if (text) void enqueuePtyWrite(ptyId, text);
      });
      return false;
    }
    return true;
  });

  // 用户输入 → PTY
  const onDataDisp = term.onData((data) => {
    term.scrollToBottom();
    void enqueuePtyWrite(ptyId, data);
  });
  const onBinaryDisp = term.onBinary((data) => {
    void writePtyBinary(ptyId, data);
  });

  // 终端 resize → 同步到 PTY
  const onResizeDisp = term.onResize(({ cols, rows }) => {
    invoke('resize_pty', { ptyId, cols, rows });
  });

  const cleanup = () => {
    entry.unlisten?.();
    onDataDisp.dispose();
    onBinaryDisp.dispose();
    onResizeDisp.dispose();
    syncOnDisp.dispose();
    syncOffDisp.dispose();
    term.dispose();
  };

  const entry: CachedEntry = {
    term,
    fitAddon,
    wrapper,
    cleanup,
    attached: false,
  };
  cache.set(ptyId, entry);
  return entry;
}

/** 获取已缓存的终端（不创建新的） */
export function getCachedTerminal(ptyId: number): CachedTerminal | undefined {
  return cache.get(ptyId);
}

export async function ensurePtyOutputAttached(ptyId: number): Promise<void> {
  const entry = cache.get(ptyId);
  if (!entry) return;
  if (entry.attached) return;
  if (entry.attachPromise) return entry.attachPromise;

  entry.attachPromise = (async () => {
    const unlisten = await listen<PtyOutputPayload>('pty-output', (event) => {
      if (event.payload.ptyId === ptyId) {
        entry.term.write(event.payload.data);
      }
    });

    try {
      entry.unlisten = unlisten;
      const backlog = await invoke<string>('attach_pty_output', { ptyId });
      if (backlog) {
        // 分块写入，避免大 backlog 一次性阻塞主线程
        const CHUNK = 64 * 1024;
        if (backlog.length <= CHUNK) {
          entry.term.write(backlog);
        } else {
          for (let i = 0; i < backlog.length; i += CHUNK) {
            entry.term.write(backlog.slice(i, i + CHUNK));
            if (i + CHUNK < backlog.length) {
              await new Promise((r) => setTimeout(r, 0));
            }
          }
        }
      }
      entry.attached = true;
    } catch (error) {
      unlisten();
      entry.unlisten = undefined;
      throw error;
    } finally {
      entry.attachPromise = undefined;
    }
  })();

  return entry.attachPromise;
}

/** 彻底销毁终端（面板关闭 / kill_pty 后调用） */
export function disposeTerminal(ptyId: number): void {
  const entry = cache.get(ptyId);
  if (!entry) return;
  entry.wrapper.remove();
  entry.cleanup();
  cache.delete(ptyId);
}

export function updateAllTerminalThemes(terminalFollowTheme: boolean): void {
  const theme = getTerminalTheme(terminalFollowTheme);
  for (const entry of cache.values()) {
    entry.term.options.theme = theme;
  }
}

export function writePtyInput(ptyId: number, data: string): Promise<void> {
  return enqueuePtyWrite(ptyId, data);
}
