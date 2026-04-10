import type { PtyOutputPayload } from '../types';

export type PtyOutputHandler = (data: string) => void;

const handlers = new Map<number, Set<PtyOutputHandler>>();

export function subscribePtyOutput(ptyId: number, handler: PtyOutputHandler): () => void {
  const bucket = handlers.get(ptyId) ?? new Set<PtyOutputHandler>();
  bucket.add(handler);
  handlers.set(ptyId, bucket);

  return () => {
    const current = handlers.get(ptyId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) {
      handlers.delete(ptyId);
    }
  };
}

export function dispatchPtyOutput(payload: PtyOutputPayload): void {
  const bucket = handlers.get(payload.ptyId);
  if (!bucket) return;
  for (const handler of bucket) {
    handler(payload.data);
  }
}

export function hasPtyOutputSubscribers(): boolean {
  return handlers.size > 0;
}
