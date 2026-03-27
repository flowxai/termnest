import type { PaneStatus } from '../types';

const STATUS_STYLES: Record<PaneStatus, { bg: string; shadow: string }> = {
  idle: { bg: '#6bb87a', shadow: 'none' },
  running: { bg: '#d4a84a', shadow: '0 0 6px #d4a84a80' },
  'ai-working': { bg: '#b08cd4', shadow: '0 0 6px #b08cd480' },
  error: { bg: '#d4605a', shadow: 'none' },
};

const GLOW_STATUSES: PaneStatus[] = ['running', 'ai-working'];

export function StatusDot({ status, size = 'sm' }: { status: PaneStatus; size?: 'sm' | 'md' }) {
  const style = STATUS_STYLES[status];
  const glow = GLOW_STATUSES.includes(status) ? 'animate-glow' : '';
  const dim = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${dim} ${glow}`}
      style={{ backgroundColor: style.bg, boxShadow: style.shadow }}
      title={status}
    />
  );
}
