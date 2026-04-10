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
import type { PtyOutputPayload, UiStyle } from '../types';
import { getResolvedTheme, getResolvedUiStyle } from './themeManager';
import { createPtyWriteQueue } from './ptyWriteQueue';
import { dispatchPtyOutput, hasPtyOutputSubscribers, subscribePtyOutput } from './ptyOutputRegistry';

export interface CachedTerminal {
  term: Terminal;
  fitAddon: FitAddon;
  wrapper: HTMLDivElement;
}

interface CachedEntry extends CachedTerminal {
  cleanup: () => void;
  attached: boolean;
  attachPromise?: Promise<void>;
}

type TerminalPalette = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

const TERMINAL_THEMES: Record<UiStyle, { dark: TerminalPalette; light: TerminalPalette }> = {
  classic: {
    dark: {
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
    },
    light: {
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
    },
  },
  pro: {
    dark: {
      background: '#07090c',
      foreground: '#d9dfe6',
      cursor: '#9aa7b5',
      cursorAccent: '#07090c',
      selectionBackground: '#9aa7b528',
      selectionForeground: '#f1f4f8',
      black: '#1d232b',
      red: '#c97a74',
      green: '#7da48f',
      yellow: '#b89a64',
      blue: '#8c9fb1',
      magenta: '#9b91bd',
      cyan: '#7eaab0',
      white: '#d9dfe6',
      brightBlack: '#636e79',
      brightRed: '#d9918b',
      brightGreen: '#95b9a5',
      brightYellow: '#c7ab7b',
      brightBlue: '#a6b5c4',
      brightMagenta: '#b2a8d0',
      brightCyan: '#97bec3',
      brightWhite: '#f1f4f8',
    },
    light: {
      background: '#f5f6f8',
      foreground: '#232a32',
      cursor: '#5c6977',
      cursorAccent: '#f5f6f8',
      selectionBackground: '#5c697724',
      selectionForeground: '#232a32',
      black: '#232a32',
      red: '#b86761',
      green: '#4f826d',
      yellow: '#96753c',
      blue: '#607486',
      magenta: '#766c9e',
      cyan: '#5a858a',
      white: '#7b858f',
      brightBlack: '#69747f',
      brightRed: '#c97a74',
      brightGreen: '#659681',
      brightYellow: '#ab8b53',
      brightBlue: '#75899b',
      brightMagenta: '#8d84b4',
      brightCyan: '#729ba0',
      brightWhite: '#9ca5af',
    },
  },
  workbench: {
    dark: {
      background: '#120d09',
      foreground: '#e5d9c9',
      cursor: '#d98d4e',
      cursorAccent: '#120d09',
      selectionBackground: '#d98d4e2f',
      selectionForeground: '#f2e9dc',
      black: '#2f2218',
      red: '#d86c55',
      green: '#84b56f',
      yellow: '#d1a957',
      blue: '#8a9ed1',
      magenta: '#c08bd7',
      cyan: '#7dcab2',
      white: '#e5d9c9',
      brightBlack: '#705845',
      brightRed: '#e8836f',
      brightGreen: '#98ca81',
      brightYellow: '#e0bd73',
      brightBlue: '#9fb3e1',
      brightMagenta: '#d0a4e4',
      brightCyan: '#94ddc8',
      brightWhite: '#f2e9dc',
    },
    light: {
      background: '#fbf5ec',
      foreground: '#2b221b',
      cursor: '#b56d34',
      cursorAccent: '#fbf5ec',
      selectionBackground: '#b56d3426',
      selectionForeground: '#2b221b',
      black: '#2b221b',
      red: '#c65d46',
      green: '#4b8550',
      yellow: '#a67d25',
      blue: '#5d77a6',
      magenta: '#8d63b8',
      cyan: '#3d8b7c',
      white: '#877868',
      brightBlack: '#726354',
      brightRed: '#dc7158',
      brightGreen: '#5b9860',
      brightYellow: '#bd9235',
      brightBlue: '#718cbf',
      brightMagenta: '#a179ce',
      brightCyan: '#4ba091',
      brightWhite: '#a29383',
    },
  },
  product: {
    dark: {
      background: '#091221',
      foreground: '#eef4ff',
      cursor: '#66d6ff',
      cursorAccent: '#091221',
      selectionBackground: '#66d6ff2e',
      selectionForeground: '#ffffff',
      black: '#223554',
      red: '#ff7e8a',
      green: '#59d5a4',
      yellow: '#f0c36a',
      blue: '#72adff',
      magenta: '#c19aff',
      cyan: '#53e0d2',
      white: '#eef4ff',
      brightBlack: '#6e85a5',
      brightRed: '#ff9ca5',
      brightGreen: '#79e4b8',
      brightYellow: '#ffd285',
      brightBlue: '#95c4ff',
      brightMagenta: '#d4b6ff',
      brightCyan: '#79eee2',
      brightWhite: '#ffffff',
    },
    light: {
      background: '#f7fbff',
      foreground: '#1b2940',
      cursor: '#2287e6',
      cursorAccent: '#f7fbff',
      selectionBackground: '#2287e620',
      selectionForeground: '#1b2940',
      black: '#1b2940',
      red: '#de5c69',
      green: '#279b78',
      yellow: '#b58a2f',
      blue: '#2b87ea',
      magenta: '#7d68df',
      cyan: '#1d9cab',
      white: '#8b9db1',
      brightBlack: '#728398',
      brightRed: '#ed7280',
      brightGreen: '#35b38b',
      brightYellow: '#c89f44',
      brightBlue: '#479df5',
      brightMagenta: '#9581eb',
      brightCyan: '#34b2c1',
      brightWhite: '#a2b4c8',
    },
  },
};

export function getTerminalTheme(terminalFollowTheme: boolean) {
  const style = getResolvedUiStyle();
  const palette = TERMINAL_THEMES[style];
  if (terminalFollowTheme && getResolvedTheme() === 'light') {
    return palette.light;
  }
  return palette.dark;
}

const cache = new Map<number, CachedEntry>();
const readyMap = new Map<number, { promise: Promise<void>; resolve: () => void }>();
let ptyOutputUnlisten: (() => void) | null = null;
let ptyOutputListenPromise: Promise<void> | null = null;

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

async function ensureGlobalPtyOutputListener(): Promise<void> {
  if (ptyOutputUnlisten) return;
  if (ptyOutputListenPromise) return ptyOutputListenPromise;

  ptyOutputListenPromise = listen<PtyOutputPayload>('pty-output', (event) => {
    dispatchPtyOutput(event.payload);
  }).then((unlisten) => {
    ptyOutputUnlisten = unlisten;
  }).finally(() => {
    ptyOutputListenPromise = null;
  });

  return ptyOutputListenPromise;
}

function maybeDisposeGlobalPtyOutputListener(): void {
  if (cache.size > 0) return;
  if (hasPtyOutputSubscribers()) return;
  ptyOutputUnlisten?.();
  ptyOutputUnlisten = null;
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
    smoothScrollDuration: 150,
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
  const unsubscribePtyOutput = subscribePtyOutput(ptyId, (data) => {
    term.write(data);
  });

  // 终端 resize → 同步到 PTY
  const onResizeDisp = term.onResize(({ cols, rows }) => {
    invoke('resize_pty', { ptyId, cols, rows });
  });

  const cleanup = () => {
    onDataDisp.dispose();
    onBinaryDisp.dispose();
    onResizeDisp.dispose();
    syncOnDisp.dispose();
    syncOffDisp.dispose();
    unsubscribePtyOutput();
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
    await ensureGlobalPtyOutputListener();
    try {
      const backlog = await invoke<string>('attach_pty_output', { ptyId });
      if (backlog) {
        // 分块写入，避免大 backlog 一次性阻塞主线程
        const CHUNK = 12 * 1024;
        if (backlog.length <= CHUNK) {
          entry.term.write(backlog);
        } else {
          for (let i = 0; i < backlog.length; i += CHUNK) {
            entry.term.write(backlog.slice(i, i + CHUNK));
            if (i + CHUNK < backlog.length) {
              await new Promise<void>((r) => requestAnimationFrame(() => r()));
            }
          }
        }
      }
      entry.attached = true;
    } catch (error) {
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
  maybeDisposeGlobalPtyOutputListener();
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
