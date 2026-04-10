import type { UiStyle } from '../types';

type ThemeMode = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

let currentResolved: ResolvedTheme = 'dark';
let currentUiStyle: UiStyle = 'classic';
let cleanupFn: (() => void) | null = null;

const STORAGE_KEY = 'termnest-theme';
const UI_STYLE_STORAGE_KEY = 'termnest-ui-style';
const WINDOW_GLASS_STORAGE_KEY = 'termnest-window-glass';
const GLASS_STRENGTH_STORAGE_KEY = 'termnest-glass-strength';
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: light)';

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

function getColorSchemeQuery(): LegacyMediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(COLOR_SCHEME_QUERY) as LegacyMediaQueryList;
}

function listenColorSchemeChange(
  mql: LegacyMediaQueryList,
  handler: (event: MediaQueryListEvent) => void,
): () => void {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => {
      mql.removeEventListener?.('change', handler);
    };
  }

  if (typeof mql.addListener === 'function') {
    mql.addListener(handler);
    return () => {
      mql.removeListener?.(handler);
    };
  }

  return () => {};
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'auto') {
    const mql = getColorSchemeQuery();
    return mql?.matches ? 'light' : 'dark';
  }
  return mode;
}

function normalizeUiStyle(style: string | null | undefined): UiStyle {
  if (style === 'classic' || style === 'workbench' || style === 'product' || style === 'pro') {
    return style;
  }
  return 'classic';
}

function normalizeGlassStrength(value: number | string | null | undefined): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 34;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function applyToDOM(theme: ResolvedTheme) {
  currentResolved = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

function applyUiStyleToDOM(style: UiStyle) {
  currentUiStyle = style;
  document.documentElement.dataset.uiStyle = style;
  localStorage.setItem(UI_STYLE_STORAGE_KEY, style);
}

function readStoredTheme(): ResolvedTheme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

function readStoredUiStyle(): UiStyle | null {
  return normalizeUiStyle(localStorage.getItem(UI_STYLE_STORAGE_KEY));
}

function readStoredWindowGlass(): boolean {
  return localStorage.getItem(WINDOW_GLASS_STORAGE_KEY) === '1';
}

function readStoredGlassStrength(): number {
  return normalizeGlassStrength(localStorage.getItem(GLASS_STRENGTH_STORAGE_KEY));
}

export function getResolvedTheme(): ResolvedTheme {
  return currentResolved;
}

export function getResolvedUiStyle(): UiStyle {
  return currentUiStyle;
}

export function applyTheme(mode: ThemeMode): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }

  const initialTheme = mode === 'auto' ? (readStoredTheme() ?? resolveTheme(mode)) : resolveTheme(mode);
  applyToDOM(initialTheme);

  if (mode === 'auto') {
    const mql = getColorSchemeQuery();
    if (!mql) return;
    const handler = (e: MediaQueryListEvent) => {
      applyToDOM(e.matches ? 'light' : 'dark');
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: getResolvedTheme() }));
    };
    cleanupFn = listenColorSchemeChange(mql, handler);
  }
}

export function applyUiStyle(style: UiStyle): void {
  applyUiStyleToDOM(normalizeUiStyle(style));
  window.dispatchEvent(new CustomEvent('ui-style-changed', { detail: getResolvedUiStyle() }));
}

export function initUiStyle(style?: UiStyle): void {
  applyUiStyleToDOM(style ? normalizeUiStyle(style) : (readStoredUiStyle() ?? 'classic'));
}

export function applyWindowGlass(enabled: boolean, strength: number): void {
  const normalizedStrength = normalizeGlassStrength(strength);
  document.documentElement.dataset.windowGlass = enabled ? 'on' : 'off';
  document.documentElement.style.setProperty('--glass-strength', String(normalizedStrength));
  localStorage.setItem(WINDOW_GLASS_STORAGE_KEY, enabled ? '1' : '0');
  localStorage.setItem(GLASS_STRENGTH_STORAGE_KEY, String(normalizedStrength));
}

export function initWindowGlass(enabled?: boolean, strength?: number): void {
  applyWindowGlass(
    enabled ?? readStoredWindowGlass(),
    strength ?? readStoredGlassStrength(),
  );
}
