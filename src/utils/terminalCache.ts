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
      background: '#05070a',
      foreground: '#f0f4f8',
      cursor: '#5eaaef',
      cursorAccent: '#05070a',
      selectionBackground: '#5eaaef35',
      selectionForeground: '#ffffff',
      black: '#0a0e14',
      red: '#f06060',
      green: '#40e890',
      yellow: '#f0c040',
      blue: '#50a0f0',
      magenta: '#c070f0',
      cyan: '#40d8e8',
      white: '#f0f4f8',
      brightBlack: '#4a5868',
      brightRed: '#ff8080',
      brightGreen: '#60f0a8',
      brightYellow: '#ffd860',
      brightBlue: '#70b8ff',
      brightMagenta: '#d898ff',
      brightCyan: '#60e8f0',
      brightWhite: '#ffffff',
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
  mission: {
    dark: {
      background: '#060d10',
      foreground: '#dde9e6',
      cursor: '#78e1c7',
      cursorAccent: '#060d10',
      selectionBackground: '#78e1c728',
      selectionForeground: '#f5fbf9',
      black: '#162227',
      red: '#c97a72',
      green: '#70be9c',
      yellow: '#c7af69',
      blue: '#6ea5c7',
      magenta: '#9d90c9',
      cyan: '#5cc9c1',
      white: '#dde9e6',
      brightBlack: '#63777d',
      brightRed: '#d88f87',
      brightGreen: '#86cfaf',
      brightYellow: '#d4be81',
      brightBlue: '#88bad8',
      brightMagenta: '#b1a5d8',
      brightCyan: '#75ddd4',
      brightWhite: '#f5fbf9',
    },
    light: {
      background: '#f2f7f5',
      foreground: '#223137',
      cursor: '#3c9f88',
      cursorAccent: '#f2f7f5',
      selectionBackground: '#3c9f8820',
      selectionForeground: '#223137',
      black: '#223137',
      red: '#bd6c66',
      green: '#3f886d',
      yellow: '#9a7e33',
      blue: '#477597',
      magenta: '#7567a3',
      cyan: '#3e8a89',
      white: '#76858b',
      brightBlack: '#65757c',
      brightRed: '#cb8079',
      brightGreen: '#559b81',
      brightYellow: '#b18f4b',
      brightBlue: '#5d8aac',
      brightMagenta: '#8a7bb5',
      brightCyan: '#54a09e',
      brightWhite: '#96a4aa',
    },
  },
  editorial: {
    dark: {
      background: '#181118',
      foreground: '#f0e7ec',
      cursor: '#e29ac0',
      cursorAccent: '#181118',
      selectionBackground: '#e29ac025',
      selectionForeground: '#fff8fb',
      black: '#2f2430',
      red: '#d57b8c',
      green: '#93b18f',
      yellow: '#d2ad73',
      blue: '#8e9fd6',
      magenta: '#d4a1e2',
      cyan: '#8ac9c2',
      white: '#f0e7ec',
      brightBlack: '#6b5f6e',
      brightRed: '#e28d9c',
      brightGreen: '#a5c29f',
      brightYellow: '#e1bd86',
      brightBlue: '#a2b3e7',
      brightMagenta: '#dfb4eb',
      brightCyan: '#9ddbd5',
      brightWhite: '#fff8fb',
    },
    light: {
      background: '#fbf6f8',
      foreground: '#342730',
      cursor: '#9d4e73',
      cursorAccent: '#fbf6f8',
      selectionBackground: '#9d4e731b',
      selectionForeground: '#342730',
      black: '#342730',
      red: '#c26475',
      green: '#668462',
      yellow: '#a88547',
      blue: '#687fc0',
      magenta: '#a26ab3',
      cyan: '#5a9790',
      white: '#8d7d87',
      brightBlack: '#7a6b74',
      brightRed: '#cf7889',
      brightGreen: '#7a9876',
      brightYellow: '#bd9a5c',
      brightBlue: '#8098d0',
      brightMagenta: '#b481c4',
      brightCyan: '#71aca6',
      brightWhite: '#a898a2',
    },
  },
  dopamine: {
    dark: {
      background: '#0a081e',
      foreground: '#ffffff',
      cursor: '#ffe23d',
      cursorAccent: '#0a081e',
      selectionBackground: '#ff50c83e',
      selectionForeground: '#ffffff',
      black: '#201450',
      red: '#ff4090',
      green: '#30ffd0',
      yellow: '#ffe23d',
      blue: '#6070ff',
      magenta: '#d050ff',
      cyan: '#30d4ff',
      white: '#ffffff',
      brightBlack: '#7060c0',
      brightRed: '#ff70b0',
      brightGreen: '#60ffe0',
      brightYellow: '#ffec70',
      brightBlue: '#90a0ff',
      brightMagenta: '#e090ff',
      brightCyan: '#60e8ff',
      brightWhite: '#ffffff',
    },
    light: {
      background: '#fff6fd',
      foreground: '#30244c',
      cursor: '#914dff',
      cursorAccent: '#fff6fd',
      selectionBackground: '#914dff24',
      selectionForeground: '#30244c',
      black: '#30244c',
      red: '#eb4d90',
      green: '#05a99d',
      yellow: '#cf940c',
      blue: '#5962eb',
      magenta: '#ad54ef',
      cyan: '#1aa8d3',
      white: '#9486b6',
      brightBlack: '#7f71a1',
      brightRed: '#f467a2',
      brightGreen: '#1dc0b3',
      brightYellow: '#e3b02f',
      brightBlue: '#747bf5',
      brightMagenta: '#bd74f4',
      brightCyan: '#39bbe1',
      brightWhite: '#aa9bc8',
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
