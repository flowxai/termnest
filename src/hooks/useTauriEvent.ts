import { useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let unlistenFn: UnlistenFn | undefined;
    let cancelled = false;
    listen<T>(event, (e) => handlerRef.current(e.payload)).then((fn) => {
      if (cancelled) { fn(); return; }
      unlistenFn = fn;
    });
    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [event]);
}
