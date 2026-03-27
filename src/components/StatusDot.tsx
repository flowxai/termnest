import type { PaneStatus } from '../types';

const STATUS_COLORS: Record<PaneStatus, string> = {
  idle: 'bg-green-400',
  running: 'bg-orange-400',
  'ai-working': 'bg-purple-400',
  error: 'bg-red-500',
};

const PULSE_STATUSES: PaneStatus[] = ['running', 'ai-working'];

export function StatusDot({ status }: { status: PaneStatus }) {
  const color = STATUS_COLORS[status];
  const pulse = PULSE_STATUSES.includes(status) ? 'animate-pulse' : '';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color} ${pulse}`}
      title={status}
    />
  );
}
