'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/lib/api/hooks';
import { useDemoMode } from '@/app/_providers/demo-mode-provider';
import { cn } from '@/lib/utils/cn';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { demoMode } = useDemoMode();

  const { data: notifications } = useNotifications();
  const { data: unreadCount } = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const count = unreadCount?.count ?? 0;

  function handleMarkRead(id: string) {
    if (demoMode) return;
    markRead.mutate(id);
  }

  function handleMarkAllRead() {
    if (demoMode) return;
    markAllRead.mutate();
  }

  function handleNotificationClick(notif: { id: string; projectId?: string | null; read: boolean }) {
    if (!notif.read) handleMarkRead(notif.id);
    // Ensure the Alert Log refetches even if the notification was already
    // read (markRead-onSuccess invalidation wouldn't fire in that case).
    queryClient.invalidateQueries({ queryKey: ['notification-log'] });
    setOpen(false);
    if (notif.projectId) {
      router.push(`/projects/${notif.projectId}/alerts#alert-log-${notif.id}`);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          // 44x44 tap target on <sm; 32x32 on >=sm to match the rest of the header
          'flex h-10 w-10 items-center justify-center rounded-md text-secondary transition-colors hover:bg-qod-bg hover:text-primary sm:h-8 sm:w-8',
          open && 'bg-qod-bg text-primary',
        )}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-80 rounded-lg border border-qod-border bg-qod-surface shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-qod-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Notifications
            </p>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-qod-accent transition-colors hover:text-qod-accent/80"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list — fixed ~5 rows, scroll after */}
          <div className="max-h-[22rem] overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-qod-border px-3 py-2.5 text-left transition-colors hover:bg-qod-bg last:border-b-0',
                    !notif.read && 'bg-qod-accent/5',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notif.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-qod-accent" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        'truncate text-sm',
                        notif.read ? 'text-secondary' : 'font-medium text-primary',
                      )}>
                        {notif.title}
                      </p>
                      <p className="line-clamp-2 text-xs text-muted">
                        {notif.body}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {timeAgo(notif.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
