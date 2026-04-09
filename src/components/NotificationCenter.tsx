import { useEffect } from 'react';
import { useAppStore } from '../store';

const KIND_STYLES = {
  info: 'border-[var(--border-default)] bg-[var(--bg-elevated)]',
  success: 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10',
  warning: 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10',
  error: 'border-[var(--color-error)]/30 bg-[var(--color-error-muted)]',
} as const;

export function NotificationCenter() {
  const notifications = useAppStore((s) => s.notifications);
  const dismissNotification = useAppStore((s) => s.dismissNotification);

  useEffect(() => {
    if (notifications.length === 0) return;

    const timers = notifications.map((notification) => (
      window.setTimeout(() => dismissNotification(notification.id), 4200)
    ));

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [dismissNotification, notifications]);

  if (notifications.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-12 z-50 flex max-w-[360px] flex-col gap-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`pointer-events-auto rounded-[var(--radius-md)] border px-3 py-2 shadow-lg backdrop-blur-sm ${KIND_STYLES[notification.kind]}`}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {notification.title && (
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {notification.title}
                </div>
              )}
              <div className="text-xs leading-5 text-[var(--text-secondary)]">
                {notification.message}
              </div>
            </div>
            <button
              className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              onClick={() => dismissNotification(notification.id)}
              title="关闭提示"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
